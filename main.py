import os
import sys
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from supabase import create_client, Client
from dotenv import load_dotenv
import bcrypt
import uvicorn
import resend
import jwt
import html
import httpx
from datetime import datetime, timezone, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "agent"))
from validator_agent import process_and_validate
from command_parser import parse_label_command

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")
resend.api_key = os.getenv("RESEND_API_KEY")
# Az értesítő e-mail címzettje env-ből — ne legyen a publikus repóban (spam-scrape ellen).
# Ha nincs beállítva, az értesítő egyszerűen kimarad (a generálás nem törik el).
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def client_ip(request: Request) -> str:
    """Valódi kliens IP a Railway proxy mögött.
    Az X-Forwarded-For utolsó elemét a Railway edge proxy fűzi hozzá,
    azt a kliens nem tudja hamisítani."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)

# Éles környezetben (Railway) nincs Swagger / OpenAPI séma
_IS_PRODUCTION = bool(os.getenv("RAILWAY_ENVIRONMENT_NAME") or os.getenv("RAILWAY_ENVIRONMENT"))

app = FastAPI(
    docs_url=None if _IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if _IS_PRODUCTION else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── JWT auth ──
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY környezeti változó hiányzik — állítsd be a Railway-en!")

TOKEN_LIFETIME_HOURS = 12

# Konstans idejű login: ismeretlen felhasználónévnél is lefuttatunk egy
# bcrypt-ellenőrzést egy dummy hash ellen, hogy a válaszidőből ne lehessen
# létező felhasználónevet kikövetkeztetni (timing-alapú user enumeration).
_DUMMY_PW_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt()).decode("utf-8")

# ── DEMO korlátok (lásd DEMO_OLDAL_TERV.md) ──
DEMO_USERNAME = "DEMO"
DEMO_TOKEN_LIFETIME_HOURS = 1
DEMO_MAX_ROWS = 21  # 1 sor = 1 címke; 21 címke = 1 teljes A4 oldal (3×7)
DEMO_DAILY_PROCESS_CAP = 50  # napi feldolgozás-sapka (AI-költség védelem)
# Napi felső korlát a demo által az össz-számlálóhoz adható címkékre. Cyber security:
# a nyilvános demo NE inflálhassa korlátlanul az "összes generált címke" értéket.
# = a legális demo-plafon (max 50 generálás × 21 címke) — a valós használatot nem vágja.
DEMO_DAILY_LABEL_CAP = DEMO_MAX_ROWS * DEMO_DAILY_PROCESS_CAP  # 21 * 50 = 1050 / nap
TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY")  # Cloudflare Turnstile (demo CAPTCHA)
_demo_daily_usage = {"date": None, "process_calls": 0}
_demo_daily_labels = {"date": None, "labels": 0}


def _demo_grant_labels(n: int) -> int:
    """Mennyi demo-címke számolható még ma az össz-számlálóhoz (0..n értéket ad vissza).
    In-memory napi sapka (1 Railway-instance-ra elég; restartnál megengedő irányba nullázódik).
    A per-hívás plafon (DEMO_MAX_ROWS) és a rate limit mellett ez védi az össz-számlálót."""
    from datetime import date as _date
    today = _date.today().isoformat()
    if _demo_daily_labels["date"] != today:
        _demo_daily_labels["date"] = today
        _demo_daily_labels["labels"] = 0
    remaining = DEMO_DAILY_LABEL_CAP - _demo_daily_labels["labels"]
    grant = max(0, min(int(n), remaining))
    _demo_daily_labels["labels"] += grant
    return grant


def _demo_allow_process_inmemory() -> bool:
    """In-memory fallback: egy Railway-instance esetén elegendő; restartnál
    nullázódik (megengedő irányba). Akkor lép életbe, ha a perzisztens
    számláló (Supabase RPC) nem érhető el."""
    from datetime import date as _date
    today = _date.today().isoformat()
    if _demo_daily_usage["date"] != today:
        _demo_daily_usage["date"] = today
        _demo_daily_usage["process_calls"] = 0
    if _demo_daily_usage["process_calls"] >= DEMO_DAILY_PROCESS_CAP:
        return False
    _demo_daily_usage["process_calls"] += 1
    return True


def _demo_allow_process() -> bool:
    """Napi sapka a demo process-labels hívásaira (AI-költség védelem).
    Elsődlegesen egy Supabase-oldali ATOMI számlálót használ (demo_increment
    RPC), ami több instance és restart esetén is helyesen korlátoz. Ha a tábla/
    RPC még nincs telepítve vagy a hívás hibázik, az in-memory számlálóra esik
    vissza — így a demo sosem törik el a perzisztens réteg hiánya miatt.
    A tábla + RPC telepítéséhez lásd: demo_usage.sql."""
    try:
        res = supabase.rpc("demo_increment", {"p_cap": DEMO_DAILY_PROCESS_CAP}).execute()
        allowed = res.data
        if isinstance(allowed, list):  # PostgREST néha listában adja vissza a skalárt
            allowed = allowed[0] if allowed else None
        if isinstance(allowed, bool):
            return allowed
        return _demo_allow_process_inmemory()  # váratlan válaszforma → biztonságos fallback
    except Exception as e:
        print(f"Demo cap RPC error, in-memory fallback: {e}")
        return _demo_allow_process_inmemory()


def create_token(username: str, role: str = "customer") -> str:
    hours = DEMO_TOKEN_LIFETIME_HOURS if role == "demo" else TOKEN_LIFETIME_HOURS
    payload = {
        "sub": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


_auth_header = APIKeyHeader(name="Authorization", auto_error=False)

async def require_user(authorization: str = Security(_auth_header)) -> str:
    """Ellenőrzi a Bearer tokent, és visszaadja a bejelentkezett usernamet."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bejelentkezés szükséges")
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="A munkamenet lejárt, jelentkezz be újra")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Érvénytelen token")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Érvénytelen token")
    return username


async def require_user_role(authorization: str = Security(_auth_header)) -> tuple[str, str]:
    """Mint a require_user, de a role claimet is visszaadja. Hiányzó role = customer
    (a régi, role nélküli tokenek visszafelé kompatibilisek)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bejelentkezés szükséges")
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="A munkamenet lejárt, jelentkezz be újra")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Érvénytelen token")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Érvénytelen token")
    return username, payload.get("role", "customer")


def send_label_notification(username: str, count: int, new_company_total: int):
    if not NOTIFY_EMAIL:
        print("Email notification skipped: NOTIFY_EMAIL nincs beállítva")
        return
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .execute()
        total = sum(c.get("label_count", 0) or 0 for c in response.data) if response.data else 0

        budapest_tz = timezone(timedelta(hours=1))
        now = datetime.now(budapest_tz).strftime("%Y.%m.%d. %H:%M")

        safe_username = html.escape(username)

        resend.Emails.send({
            "from": "Label Labor <noreply@labellabor.com>",
            "to": [NOTIFY_EMAIL],
            "subject": f"Label Labor — {safe_username} generált {count} címkét",
            "html": f"""
                <h2>Label Labor — Új címke generálás</h2>
                <p><strong>Időpont:</strong> {now}</p>
                <hr>
                <p><strong>Cég:</strong> {safe_username}</p>
                <p><strong>Most generált:</strong> {count} címke</p>
                <p><strong>Cég összesen:</strong> {new_company_total} címke</p>
                <hr>
                <p><strong>Összes generált címke (minden cég):</strong> {total}</p>
            """
        })
        print(f"Email notification sent (+{count})")
    except Exception as e:
        print(f"Email notification error: {e}")


_ALLOWED_ORIGINS = [
    "https://labellabor.com",
    "https://www.labellabor.com",
    "https://cimkegenerator.netlify.app",
]
if not _IS_PRODUCTION:
    # Lokális fejlesztéshez (Live Server) — élesben nem engedélyezett
    _ALLOWED_ORIGINS += [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # az API csak ezeket használja
    allow_headers=["Content-Type", "Authorization"],
)


# ── Biztonsági HTTP fejlécek (SEC-01) ──
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if _IS_PRODUCTION:
        # Az API nem szolgál ki HTML-t — a legszigorúbb CSP mehet.
        # (Dev-ben nem küldjük, hogy a /docs Swagger UI működjön.)
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return response


# ── Kérés-testméret limit (SEC-04): 500 sor bőven belefér 2 MB-ba ──
MAX_BODY_BYTES = 2 * 1024 * 1024

@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={"detail": "Túl nagy kérés (max 2 MB)"})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Érvénytelen Content-Length"})
    return await call_next(request)


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_ok(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Nem lehet üres")
        if len(v) > 64:
            raise ValueError("Túl hosszú felhasználónév")
        return v

    @field_validator("password")
    @classmethod
    def password_ok(cls, v: str) -> str:
        # Nem üres + felső korlát: a bcrypt 72 bájt fölött hibát dobna (500 helyett
        # itt tiszta 422-t adunk), és a hossz-korlát általános DoS-higiénia is.
        if not v or len(v.strip()) == 0:
            raise ValueError("Nem lehet üres")
        if len(v) > 128:
            raise ValueError("Túl hosszú jelszó")
        return v


class LabelCountUpdate(BaseModel):
    count: int

    @field_validator("count")
    @classmethod
    def count_positive(cls, v: int) -> int:
        if v <= 0 or v > 10000:
            raise ValueError("Érvénytelen darabszám")
        return v


class LabelProcessRequest(BaseModel):
    rows: list[dict]
    subpage: str = "standard"

    @field_validator("rows")
    @classmethod
    def limit_rows(cls, v: list) -> list:
        if len(v) > 500:
            raise ValueError("Egyszerre maximum 500 sor dolgozható fel")
        # Szerveroldali per-cella hossz-korlát (defense in depth): a kliens is vág,
        # de a backendnek sem szabad megbíznia benne. A címke pár tíz karaktert
        # mutat; a túlméretes cellák csak a validátor AI-promptját fújnák fel
        # (költség + DoS). 300 karakterre vágunk, és az oszlopszámot is limitáljuk.
        for row in v:
            if not isinstance(row, dict):
                continue
            if len(row) > 60:
                raise ValueError("Túl sok oszlop a táblázatban")
            for k, val in list(row.items()):
                if isinstance(val, str) and len(val) > 300:
                    row[k] = val[:300]
        return v


class CorrectionRecord(BaseModel):
    """Egy validációs döntés a korrekciós naplóhoz (Roadmap 0. fázis)."""
    oszlop: str
    eredeti: str = ""
    ai_javaslat: str = ""
    vegso_ertek: str = ""
    action: str  # accepted | edited | unchanged | skipped
    termek: str = ""
    excel_sor: int | None = None
    hiba_leiras: str = ""


class CorrectionLogRequest(BaseModel):
    subpage: str = "standard"
    corrections: list[CorrectionRecord]

    @field_validator("corrections")
    @classmethod
    def limit_corrections(cls, v: list) -> list:
        if len(v) > 1000:
            raise ValueError("Egyszerre maximum 1000 korrekció naplózható")
        return v


class LabelCommandRequest(BaseModel):
    """Cimbi chat (1. fázis): természetes nyelvű címke-parancs."""
    subpage: str = "standard"
    message: str
    # A betöltött címkék tömör listája (sorszám-feloldáshoz). Best-effort, opcionális.
    labels: list | None = None

    @field_validator("message")
    @classmethod
    def msg_ok(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Üres parancs")
        if len(v) > 500:
            raise ValueError("Túl hosszú parancs (max 500 karakter)")
        return v

    @field_validator("labels")
    @classmethod
    def labels_ok(cls, v):
        if v is None:
            return v
        # Méret-korlát: a parser amúgy is 150-re vág, de itt is védünk.
        if len(v) > 1000:
            return v[:1000]
        return v


@app.post("/api/process-labels")
@limiter.limit("20/minute")
def process_labels(request: Request, req: LabelProcessRequest, auth: tuple[str, str] = Depends(require_user_role)):
    username, role = auth
    if role == "demo":
        if len(req.rows) > DEMO_MAX_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"A demó legfeljebb {DEMO_MAX_ROWS} sort dolgoz fel.",
            )
        if not _demo_allow_process():
            raise HTTPException(
                status_code=429,
                detail="A demó napi keretét elérted - próbáld újra holnap.",
            )
    try:
        result = process_and_validate(req.rows, subpage=req.subpage)

        if not _IS_PRODUCTION and result.get("issues"):
            print(f"\n🔍 DEBUG - Returning {len(result['issues'])} issues to frontend:")
            for issue in result['issues'][:2]:
                print(f"  Issue row {issue['row_index']}:")
                for hiba in issue['hibak'][:2]:
                    print(f"    - {hiba['oszlop']}: javitott='{hiba.get('javitott', 'NINCS')}', eredeti='{hiba.get('eredeti', '')}'")

        return result
    except Exception as e:
        print(f"Process labels error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba a feldolgozás során")


@app.options("/api/process-labels")
def process_labels_options():
    return {"message": "OK"}


@app.post("/api/log-corrections")
@limiter.limit("30/minute")
def log_corrections(request: Request, req: CorrectionLogRequest, username: str = Depends(require_user)):
    """Korrekciós napló (Roadmap 0. fázis): a validációs modal döntéseit tanulási
    adatként menti. Best-effort — hiba esetén sem blokkolja a felhasználói folyamatot."""
    if not req.corrections:
        return {"success": True, "logged": 0}
    try:
        rows = [{
            "company": username,
            "subpage": (req.subpage or "")[:50],
            "oszlop": (c.oszlop or "")[:50],
            "eredeti": (c.eredeti or "")[:300],
            "ai_javaslat": (c.ai_javaslat or "")[:300],
            "vegso_ertek": (c.vegso_ertek or "")[:300],
            "action": (c.action or "")[:20],
            "termek": (c.termek or "")[:300],
            "excel_sor": c.excel_sor,
            "hiba_leiras": (c.hiba_leiras or "")[:500],
        } for c in req.corrections]

        supabase.table("corrections").insert(rows).execute()
        return {"success": True, "logged": len(rows)}
    except Exception as e:
        # A naplózás nem kritikus — ne dobjunk 500-at a felhasználóra.
        print(f"Log corrections error: {e}")
        return {"success": False, "logged": 0}


@app.options("/api/log-corrections")
def log_corrections_options():
    return {"message": "OK"}


@app.post("/api/label-command")
@limiter.limit("20/minute")
def label_command(request: Request, req: LabelCommandRequest, auth: tuple[str, str] = Depends(require_user_role)):
    """Cimbi chat (1. fázis): a természetes nyelvű parancsot strukturált intentté fordítja.
    A frontend alkalmazza az intentet (előnézet + visszavonás miatt)."""
    username, role = auth
    if role == "demo":
        raise HTTPException(status_code=403, detail="A Cimbi chat a demóban nem elérhető.")
    try:
        intent = parse_label_command(req.message, labels=req.labels)
        return {"intent": intent}
    except Exception as e:
        print(f"Label command error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba a parancs értelmezésekor")


@app.options("/api/label-command")
def label_command_options():
    return {"message": "OK"}


@app.options("/api/login")
def login_options():
    return {"message": "OK"}


@app.options("/api/update-label-count")
def update_label_count_options():
    return {"message": "OK"}


@app.options("/api/total-label-count")
def total_label_count_options():
    return {"message": "OK"}


@app.get("/")
def read_root():
    return {"message": "API működik"}


@app.post("/api/login")
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest):
    try:
        response = supabase.table("companies")\
            .select("username, password_hash, redirect_url")\
            .eq("username", req.username).execute()

        if not response.data or len(response.data) == 0:
            # Egyenlő válaszidő: ismeretlen usernél is végzünk egy bcrypt-hívást.
            bcrypt.checkpw(req.password.encode("utf-8"), _DUMMY_PW_HASH.encode("utf-8"))
            raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

        user = response.data[0]
        password_hash = user["password_hash"]

        if not bcrypt.checkpw(req.password.encode("utf-8"), password_hash.encode("utf-8")):
            raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

        role = "demo" if user["username"] == DEMO_USERNAME else "customer"
        return {
            "redirect_url": user["redirect_url"],
            "token": create_token(user["username"], role),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


class DemoTokenRequest(BaseModel):
    turnstile_token: str

    @field_validator("turnstile_token")
    @classmethod
    def token_ok(cls, v):
        if not v or len(v) > 5000:
            raise ValueError("Érvénytelen token")
        return v


@app.post("/api/demo-token")
@limiter.limit("10/minute")
def demo_token(request: Request, req: DemoTokenRequest):
    """CAPTCHA-val védett demo-belépés (DEMO_OLDAL_TERV.md 2. ütem).
    A frontend Turnstile-tokent küld; sikeres ellenőrzés után rövid életű
    demo JWT-t adunk - jelszó begépelése nélkül. A nyilvános jelszó fallback marad."""
    if not TURNSTILE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="A demó gyorsbelépés nincs konfigurálva")
    try:
        resp = httpx.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": TURNSTILE_SECRET_KEY,
                "response": req.turnstile_token,
                "remoteip": request.client.host if request.client else "",
            },
            timeout=10,
        )
        outcome = resp.json()
    except Exception as e:
        print(f"Turnstile verify error: {e}")
        raise HTTPException(status_code=502, detail="A CAPTCHA-ellenőrzés nem érhető el")
    if not outcome.get("success"):
        raise HTTPException(status_code=403, detail="Sikertelen CAPTCHA-ellenőrzés")
    return {"token": create_token(DEMO_USERNAME, "demo"), "redirect_url": "/demo"}


@app.options("/api/demo-token")
def demo_token_options():
    return {"message": "OK"}


@app.post("/api/update-label-count")
@limiter.limit("30/minute")
def update_label_count(request: Request, req: LabelCountUpdate, background_tasks: BackgroundTasks, auth: tuple[str, str] = Depends(require_user_role)):
    username, role = auth
    count = req.count
    if role == "demo":
        # Cyber security: a demo nyilvános. A DEMO a saját companies sorába számol
        # (így a total-label-count beleveszi, mint bármely aloldalét), DE a hozzáadható
        # mennyiséget szerveroldalon korlátozzuk: per-hívás max 1 A4 oldal (DEMO_MAX_ROWS),
        # plusz napi összesített sapka — hogy a nyilvános demo ne inflálhassa az összeget.
        count = _demo_grant_labels(max(0, min(count, DEMO_MAX_ROWS)))
        if count == 0:
            # üres / negatív / elfogyott napi keret → ne írjunk, a jelenlegi értéket adjuk vissza
            try:
                cur = supabase.table("companies").select("label_count").eq("username", username).execute()
                current = (cur.data[0].get("label_count", 0) or 0) if cur.data else 0
            except Exception:
                current = 0
            return {"success": True, "new_count": current}
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", username)\
            .execute()

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")

        current_count = response.data[0].get("label_count", 0) or 0
        new_count = current_count + count

        supabase.table("companies")\
            .update({"label_count": new_count})\
            .eq("username", username)\
            .execute()

        # Értesítő e-mail — a demo is küld, mint a többi aloldal. A "DEMO" felhasználónév
        # miatt az e-mail tárgya/törzse egyértelműen jelzi, hogy demo-generálásról van szó,
        # így az inboxban megkülönböztethető/szűrhető. (A demo napi sapkája + a count==0
        # korai kilépés amúgy is korlátozza, hány e-mail mehet ki.)
        background_tasks.add_task(send_label_notification, username, count, new_count)

        return {"success": True, "new_count": new_count}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Update label count error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


@app.get("/api/total-label-count")
@limiter.limit("60/minute")
def get_total_label_count(request: Request):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .execute()

        if not response.data:
            return {"total_count": 0}

        total = sum(company.get("label_count", 0) or 0 for company in response.data)
        return {"total_count": total}

    except Exception as e:
        print(f"Get total label count error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


@app.get("/api/company-label-count")
@limiter.limit("60/minute")
def get_company_label_count(request: Request, username: str = Depends(require_user)):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", username)\
            .execute()

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")

        count = response.data[0].get("label_count", 0) or 0
        return {"count": count}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Get company label count error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=PORT)
