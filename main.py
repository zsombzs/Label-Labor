import os
import sys
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
import bcrypt
import uvicorn
import resend
from datetime import datetime, timezone, timedelta

# Az agent mappát hozzáadjuk a Python keresési úthoz
sys.path.append(os.path.join(os.path.dirname(__file__), "agent"))
from validator_agent import process_and_validate

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")
resend.api_key = os.getenv("RESEND_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def send_label_notification(username: str, count: int, new_company_total: int):
    try:
        # Összes cég label count lekérdezése
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

app = FastAPI()

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
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    username: str
    password: str

class LabelCountUpdate(BaseModel):
    username: str
    count: int

class LabelProcessRequest(BaseModel):
    rows: list[dict]
    max_chars_per_line: int = 22  # Default: 22 (LL), EA uses 20
    extract_kiszereles: bool = False  # Ha True, a megnevezés végéről kinyeri a kiszerelést

@app.post("/api/process-labels")
def process_labels(req: LabelProcessRequest):
    try:
        result = process_and_validate(req.rows, max_chars_per_line=req.max_chars_per_line, extract_kiszereles=req.extract_kiszereles)

        # Debug: Log what we're sending back
        if result.get("issues"):
            print(f"\n🔍 DEBUG - Returning {len(result['issues'])} issues to frontend:")
            for issue in result['issues'][:2]:  # Show first 2 issues
                print(f"  Issue row {issue['row_index']}:")
                for hiba in issue['hibak'][:2]:  # Show first 2 errors per issue
                    print(f"    - {hiba['oszlop']}: javitott='{hiba.get('javitott', 'NINCS')}', eredeti='{hiba.get('eredeti', '')}'")

        return result
    except Exception as e:
        print(f"Process labels error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba a feldolgozás során")


@app.options("/api/process-labels")
def process_labels_options():
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
def login(req: LoginRequest):
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
    
    except Exception as e:
        print(f"Login error: {e}")  
        raise HTTPException(status_code=500, detail="Szerverhiba")

@app.post("/api/update-label-count")
def update_label_count(req: LabelCountUpdate, background_tasks: BackgroundTasks):
    try:
        # Lekérjük a jelenlegi értéket
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", req.username)\
            .execute()

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")

        current_count = response.data[0].get("label_count", 0) or 0
        new_count = current_count + req.count

        # Frissítjük az értéket
        update_response = supabase.table("companies")\
            .update({"label_count": new_count})\
            .eq("username", req.username)\
            .execute()

        # Email értesítés háttérben
        background_tasks.add_task(send_label_notification, req.username, req.count, new_count)

        return {"success": True, "new_count": new_count}

    except Exception as e:
        print(f"Update label count error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")

@app.get("/api/total-label-count")
def get_total_label_count():
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
def get_company_label_count(username: str):
    try:
        response = supabase.table("companies")\
            .select("label_count")\
            .eq("username", username)\
            .execute()
        
        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Felhasználó nem található")
        
        count = response.data[0].get("label_count", 0) or 0
        
        return {"count": count}
    
    except Exception as e:
        print(f"Get company label count error: {e}")
        raise HTTPException(status_code=500, detail="Szerverhiba")


if __name__ == "__main__":
    PORT = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=PORT)