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
from datetime import datetime, timezone, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "agent"))
from validator_agent import process_and_validate
from command_parser import parse_label_command

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")
resend.api_key = os.getenv("RESEND_API_KEY")

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

def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_LIFETIME_HOURS),
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


def send_label_notification(username: str, count: int, new_company_total: int):
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
            "to": ["zsombor.labellabor@gmail.com"],
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
        print(f"Email notification sent: {username} +{count}")
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
        "http://localhost:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

    @field_validator("username", "password")
    @classmethod
    def no_empty(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Nem lehet üres")
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
def process_labels(request: Request, req: LabelProcessRequest, username: str = Depends(require_user)):
    try:
        result = process_and_validate(req.rows, subpage=req.subpage)

        if result.get("issues"):
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
def label_command(request: Request, req: LabelCommandRequest, username: str = Depends(require_user)):
    """Cimbi chat (1. fázis): a természetes nyelvű parancsot strukturált intentté fordítja.
    A frontend alkalmazza az intentet (előnézet + visszavonás miatt)."""
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
            raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

        user = response.data[0]
        password_hash = user["password_hash"]

        if not bcrypt.checkpw(req.password.encode("utf-8"), password_hash.encode("utf-8")):
            raise HTTPException(status_code=401, detail="Hibás felhasználónév vagy jelszó")

        return {
            "redirect_url": user["redirect_url"],
            "token": create_token(user["username"]),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


@app.post("/api/update-label-count")
@limiter.limit("30/minute")
def update_label_count(request: Request, req: LabelCountUpdate, background_tasks: BackgroundTasks, username: str = Depends(require_user)):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", username)\
            .execute()

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")

        current_count = response.data[0].get("label_count", 0) or 0
        new_count = current_count + req.count

        supabase.table("companies")\
            .update({"label_count": new_count})\
            .eq("username", username)\
            .execute()

        background_tasks.add_task(send_label_notification, username, req.count, new_count)

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
