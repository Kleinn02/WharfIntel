# models.py
from sqlalchemy import Column, Integer, String, DateTime, JSON, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    # --- PERSISTENT PROGRESS FIELDS ---
    money = Column(Float, default=200000.0)
    reputation = Column(Integer, default=50)
    # Stores list of IDs like ["solar_grid", "crane_auto"]
    owned_buildings = Column(JSON, default=[])
    # Timestamp of the last time income was "collected" or profile was fetched
    last_income_collection = Column(DateTime, default=datetime.utcnow)

    shipments = relationship("Shipment", back_populates="owner")

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    cargo_name = Column(String, index=True)
    weight_kg = Column(Integer)
    destination_country = Column(String)
    scale = Column(String) 
    
    # STATUS: "Preparing", "Outbound", "Arrived", "Sheltered"
    status = Column(String, default="Preparing")
    departure_time = Column(DateTime, default=datetime.utcnow)
    route_waypoints = Column(JSON, default=[])
    
    # Track if this ship has already triggered a storm event
    storm_event_handled = Column(Boolean, default=False)

    owner = relationship("User", back_populates="shipments")