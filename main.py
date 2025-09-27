import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv
import bcrypt
import uvicorn

# .env betöltése
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

# CORS middleware, csak a frontend domain engedélyezve
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login(req: LoginRequest):
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


if __name__ == "__main__":
    # Lokális teszt port, Railway-en a $PORT változót használja
    PORT = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=PORT)
