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

    # 🔌 ADD THIS LINE SO SQLALCHEMY RECOGNIZES THE COLUMNS YOU ADDED IN PGADMIN
    role = Column(String, default="commander")

    # --- PERSISTENT PROGRESS FIELDS ---
    money = Column(Float, default=200000.0)
    reputation = Column(Integer, default=50)
    
    # Stores list of active boosters with expiration times
    # Example: [{"id": "boost_radar", "expiresAt": "2026-05-12T14:30:00"}]
    active_boosters = Column(JSON, default=[])
    
    # Timestamp of the last time income was collected
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
    category = Column(String, default="Standard") # 🔥 ADD THIS
    
    # STATUS: "Preparing", "Outbound", "Arrived", "Sheltered", "Failed"
    status = Column(String, default="Preparing")
    departure_time = Column(DateTime, default=datetime.utcnow)
    route_waypoints = Column(JSON, default=[])
    # 🔥 ADD THIS: Permanent authoritative cargo health tracking
    cargo_health = Column(Float, default=100.0)
    
    # --- CHAOS ENGINE & TWO-STRIKE SYSTEM ---
    total_duration_ms = Column(Float, default=432000000.0)
    storm_time = Column(DateTime, nullable=True)
    shelter_count = Column(Integer, default=0)
    storm_event_handled = Column(Boolean, default=False)

    owner = relationship("User", back_populates="shipments")

    # --- ADD THIS TO THE VERY BOTTOM OF models.py ---
class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    event_type = Column(String, index=True)  # e.g., "AUTH", "SYSTEM", "CLIMATE"
    description = Column(String)

class InstructorInvite(Base):
    __tablename__ = "instructor_invites"

    id = Column(Integer, primary_key=True, index=True)
    code_hash = Column(String(64), unique=True, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    redeemed_at = Column(DateTime, nullable=True)