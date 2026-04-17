# app/auth.py
import os
import bcrypt
from dotenv import load_dotenv

load_dotenv()

# The Pepper stays hidden on your MacBook, never sent to the browser
SECRET_PEPPER = os.getenv("WHARF_PEPPER", "CyberSec@WharfIntel2026!Pepper")

def get_password_hash(password: str):
    # 1. Combine password and pepper, then convert to bytes
    pwd_bytes = (password + SECRET_PEPPER).encode('utf-8')
    
    # 2. Generate a secure salt and hash the password
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(pwd_bytes, salt)
    
    # 3. Return as a normal string to save in PostgreSQL
    return hashed_bytes.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str):
    # 1. Combine the login attempt with the pepper
    pwd_bytes = (plain_password + SECRET_PEPPER).encode('utf-8')
    
    # 2. Convert the stored database hash back to bytes
    hash_bytes = hashed_password.encode('utf-8')
    
    # 3. Let bcrypt safely compare them
    return bcrypt.checkpw(pwd_bytes, hash_bytes)