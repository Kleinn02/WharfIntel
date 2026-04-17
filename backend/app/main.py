# app/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

# Import our new database logic
from .database import engine, get_db, Base
from .models import User
from .auth import get_password_hash, verify_password

# Create the database tables if they don't exist yet
Base.metadata.create_all(bind=engine)

app = FastAPI(title="WharfIntel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic schema for incoming JSON data
class UserAuth(BaseModel):
    username: str
    password: str

@app.post("/register")
def register(user: UserAuth, db: Session = Depends(get_db)):
    # 1. Check if user already exists in PostgreSQL
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # 2. Hash the password with our pepper
    hashed = get_password_hash(user.password)
    
    # 3. Save to database
    new_user = User(username=user.username, hashed_password=hashed)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User registered successfully!"}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    # 1. Find the user in PostgreSQL
    db_user = db.query(User).filter(User.username == user.username).first()
    
    # 2. Verify existence and password match
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return {"message": "Login successful!", "user": db_user.username}