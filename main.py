import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
import bcrypt
import uvicorn

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
def update_label_count(req: LabelCountUpdate):
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