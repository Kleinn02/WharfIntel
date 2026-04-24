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

    # Add this underneath your User class in models.py
class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    cargo_name = Column(String, index=True) # e.g., "Cavendish Bananas"
    weight_kg = Column(Integer)
    destination_country = Column(String)
    scale = Column(String) # "Local", "National", "Global"
    status = Column(String, default="Preparing") # Preparing, En Route, Arrived
    departure_time = Column(DateTime, default=datetime.utcnow)