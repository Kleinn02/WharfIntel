from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .auth import get_password_hash, verify_password

app = FastAPI(title="WharfIntel API")

# Allow your React app (on port 5173) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A simple "User Store" until we connect PostgreSQL
mock_db = {}

class UserAuth(BaseModel):
    username: str
    password: str

@app.post("/register")
async def register(user: UserAuth):
    if user.username in mock_db:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Hash + Salt + Pepper happen here!
    hashed = get_password_hash(user.password)
    mock_db[user.username] = hashed
    return {"message": "User registered successfully!"}

@app.post("/login")
async def login(user: UserAuth):
    stored_hash = mock_db.get(user.username)
    if not stored_hash or not verify_password(user.password, stored_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {"message": "Login successful!", "user": user.username}