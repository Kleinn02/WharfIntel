# models.py
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    # We store the resulting hash here. BCrypt handles the salt internally.
    hashed_password = Column(String) 
    created_at = Column(DateTime, default=datetime.utcnow)