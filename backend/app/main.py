# app/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import websockets
import json
from datetime import datetime

from . import models, database, pathfinder
from .database import engine, get_db, Base
from .models import User, Shipment
from .auth import get_password_hash, verify_password

# Initialize Database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="WharfIntel Command Center API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- BACKEND SIMULATION CONSTANTS ---
DESTINATION_PRICING = {
    "Panabo Wharf": 500, "Davao City Port": 800,
    "Manila, Philippines": 5000, "Cebu Port": 3500,
    "Batangas Terminal": 4200, "Tokyo, Japan": 25000,
    "Busan, South Korea": 22000, "Taipei, Taiwan": 18000,
    "Singapore": 20000
}

INFRA_INCOME = {
    "solar_grid": 150,
    "crane_auto": 400,
    "duty_free": 1200
}

# --- AISStream Live Traffic Engine (Operational Side) ---
LIVE_VESSELS = {}

async def fetch_ais_stream():
    api_key = "0c7e24bd5f030997f83f24e7af7c97ea5e6ad73d" 
    bounding_box = [[[-10.0, 100.0], [25.0, 145.0]]]
    subscribe_message = {
        "APIKey": api_key,
        "BoundingBoxes": bounding_box,
        "FilterMessageTypes": ["PositionReport"]
    }

    while True:
        try:
            async with websockets.connect("wss://stream.aisstream.io/v0/stream") as websocket:
                await websocket.send(json.dumps(subscribe_message))
                print("📡 RADAR ACTIVE: Monitoring real-world AIS traffic...")
                async for message_json in websocket:
                    message = json.loads(message_json)
                    if message["MessageType"] == "PositionReport":
                        meta = message["MetaData"]
                        report = message["Message"]["PositionReport"]
                        mmsi = meta["MMSI"]
                        lat, lng = report.get("Latitude", 0), report.get("Longitude", 0)
                        
                        if 90 >= lat >= -90 and 180 >= lng >= -180:
                            raw_name = meta.get("ShipName")
                            LIVE_VESSELS[mmsi] = {
                                "id": str(mmsi),
                                "name": raw_name.strip() if raw_name else f"Unknown {mmsi}",
                                "type": "Cargo", 
                                "lat": lat, "lng": lng,
                                "status": "Inbound" if report.get("Sog", 0) > 0.5 else "Docked", 
                                "heading": report.get("TrueHeading", 0) if report.get("TrueHeading") != 511 else 0
                            }
        except Exception as e:
            print(f"⚠️ Radar link interrupted: {e}. Reconnecting...")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(fetch_ais_stream())

# --- SCHEMAS ---
class UserAuth(BaseModel):
    username: str
    password: str

class ShipmentCreate(BaseModel):
    cargo_name: str
    weight_kg: int
    destination_country: str
    scale: str
    username: str # Required to link to account

# --- AUTH ENDPOINTS ---
@app.post("/register")
def register(user: UserAuth, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Commander ID already exists")
    new_user = User(username=user.username, hashed_password=get_password_hash(user.password))
    db.add(new_user)
    db.commit()
    return {"message": "Commander registered"}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"message": "Login successful", "user": db_user.username}

# --- SIMULATION AUTHORITATIVE API ---

@app.get("/api/user/{username}/profile")
def get_user_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")

    # PASSIVE INCOME ENGINE: Calculate earnings while user was offline
    now = datetime.utcnow()
    seconds_elapsed = (now - user.last_income_collection).total_seconds()
    
    # Calculate current rate
    active_rate = 50 + sum(INFRA_INCOME.get(b, 0) for b in user.owned_buildings)
    
    # Ticks every 5 seconds
    ticks = int(seconds_elapsed // 5)
    if ticks > 0:
        earned = ticks * active_rate
        user.money += earned
        user.last_income_collection = now
        db.commit()

    return {
        "username": user.username,
        "money": user.money,
        "reputation": user.reputation,
        "owned_buildings": user.owned_buildings,
        "passive_rate": active_rate
    }

@app.get("/api/vessels/active")
def get_live_radar():
    return list(LIVE_VESSELS.values())[:300]

@app.get("/api/ticketing/active")
def get_user_exports(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    return db.query(Shipment).filter(Shipment.user_id == user.id).all()

@app.post("/api/ticketing/create")
def initiate_export(ticket: ShipmentCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == ticket.username).first()
    cost = DESTINATION_PRICING.get(ticket.destination_country, 0)

    if user.money < cost:
        raise HTTPException(status_code=400, detail="Insufficient persistent credits")

    # Generate persistent route waypoints via pathfinder
    smart_route = pathfinder.plot_smart_course("DAVAO_PORT", ticket.destination_country)
    
    new_shipment = Shipment(
        user_id=user.id,
        cargo_name=ticket.cargo_name,
        weight_kg=ticket.weight_kg,
        destination_country=ticket.destination_country,
        scale=ticket.scale,
        route_waypoints=smart_route,
        status="Outbound"
    )
    
    user.money -= cost
    db.add(new_shipment)
    db.commit()
    db.refresh(new_shipment)
    return {"user_money": user.money, "shipment_id": new_shipment.id}

@app.post("/api/ticketing/{ship_id}/relaunch")
def relaunch_shipment(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    user = ship.owner
    
    # 50% cost rule for relaunch
    relaunch_cost = DESTINATION_PRICING.get(ship.destination_country, 0) / 2

    if user.money < relaunch_cost:
        raise HTTPException(status_code=400, detail="Insufficient credits for relaunch")

    user.money -= relaunch_cost
    ship.status = "Outbound"
    ship.departure_time = datetime.utcnow() # Resets progress AUTHORITATIVELY to 0
    ship.storm_event_handled = False # Reset storm trigger
    
    db.commit()
    return {"user_money": user.money, "departure_time": ship.departure_time}

@app.post("/api/user/{username}/buy_infrastructure")
def buy_infrastructure(username: str, data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    item_id = data.get("item_id")
    
    infra_costs = {"solar_grid": 30000, "crane_auto": 85000, "duty_free": 150000}
    cost = infra_costs.get(item_id, 999999)

    if user.money < cost:
        raise HTTPException(status_code=400, detail="Insufficient credits")

    current_buildings = list(user.owned_buildings)
    current_buildings.append(item_id)
    user.owned_buildings = current_buildings
    user.money -= cost
    db.commit()
    
    return {"money": user.money, "owned_buildings": user.owned_buildings}

@app.get("/api/analytics/forecast")
def get_traffic_forecast():
    return [
        {"day": "Day -3", "historical": 85, "predicted": None},
        {"day": "Day -2", "historical": 92, "predicted": None},
        {"day": "Day -1", "historical": 110, "predicted": None},
        {"day": "Today", "historical": 105, "predicted": 105},
        {"day": "Day +1", "historical": None, "predicted": 125},
        {"day": "Day +2", "historical": None, "predicted": 140},
        {"day": "Day +3", "historical": None, "predicted": 115},
    ]