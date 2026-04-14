import os
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# The Pepper stays hidden on your MacBook, never sent to the browser
SECRET_PEPPER = os.getenv("WHARF_PEPPER", "CyberSec@WharfIntel2026!Pepper")

# Use BCrypt for hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str):
    # Combine password with your secret pepper before hashing
    return pwd_context.hash(password + SECRET_PEPPER)

def verify_password(plain_password: str, hashed_password: str):
    # Check if the login attempt matches the stored hash
    return pwd_context.verify(plain_password + SECRET_PEPPER, hashed_password)