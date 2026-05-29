import os
import sys
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Depends, Security
from fastapi.middleware.cors import CORSMiddleware
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
from datetime import datetime, timezone, timedelta

sys.path.append(os.path.join(os.path.dirname(__file__), "agent"))
from validator_agent import process_and_validate

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")
resend.api_key = os.getenv("RESEND_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")

async def require_api_key(api_key: str = Security(_api_key_header)):
    if not api_key or api_key != _INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Érvénytelen API kulcs")


def send_label_notification(username: str, count: int, new_company_total: int):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .execute()
        total = sum(c.get("label_count", 0) or 0 for c in response.data) if response.data else 0

        budapest_tz = timezone(timedelta(hours=1))
        now = datetime.now(budapest_tz).strftime("%Y.%m.%d. %H:%M")

        resend.Emails.send({
            "from": "Label Labor <noreply@labellabor.com>",
            "to": ["zsombor.labellabor@gmail.com"],
            "subject": f"Label Labor — {username} generált {count} címkét",
            "html": f"""
                <h2>Label Labor — Új címke generálás</h2>
                <p><strong>Időpont:</strong> {now}</p>
                <hr>
                <p><strong>Cég:</strong> {username}</p>
                <p><strong>Most generált:</strong> {count} címke</p>
                <p><strong>Cég összesen:</strong> {new_company_total} címke</p>
                <hr>
                <p><strong>Összes generált címke (minden cég):</strong> {total}</p>
            """
        })
        print(f"Email notification sent: {username} +{count}")
    except Exception as e:
        print(f"Email notification error: {e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://labellabor.com",
        "https://www.labellabor.com",
        "https://cimkegenerator.netlify.app",
        "http://localhost:3000",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


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
    username: str
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


class CompanySearchRequest(BaseModel):
    company_name: str

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Cégnév nem lehet üres")
        if len(v) > 100:
            raise ValueError("Cégnév maximum 100 karakter lehet")
        return v


@app.post("/api/process-labels")
@limiter.limit("20/minute")
def process_labels(request: Request, req: LabelProcessRequest, _=Depends(require_api_key)):
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


@app.post("/api/search-company")
@limiter.limit("10/minute")
def search_company_endpoint(request: Request, req: CompanySearchRequest, _=Depends(require_api_key)):
    try:
        from web_search import search_company_products
        result = search_company_products(req.company_name)
        return result
    except Exception as e:
        print(f"Search company error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Szerverhiba a keresés során")


@app.options("/api/search-company")
def search_company_options():
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

        return {"redirect_url": user["redirect_url"]}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


@app.post("/api/update-label-count")
@limiter.limit("30/minute")
def update_label_count(request: Request, req: LabelCountUpdate, background_tasks: BackgroundTasks):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", req.username)\
            .execute()

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")

        current_count = response.data[0].get("label_count", 0) or 0
        new_count = current_count + req.count

        supabase.table("companies")\
            .update({"label_count": new_count})\
            .eq("username", req.username)\
            .execute()

        background_tasks.add_task(send_label_notification, req.username, req.count, new_count)

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


@app.get("/api/company-label-count/{username}")
@limiter.limit("60/minute")
def get_company_label_count(request: Request, username: str):
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
