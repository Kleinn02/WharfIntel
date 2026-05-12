# app/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import websockets
import json
import random
from datetime import datetime, timedelta

from . import models, database, pathfinder
from .database import engine, get_db, Base
from .models import User, Shipment
from .auth import get_password_hash, verify_password

# Initialize Database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="WharfIntel Command Center API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

BOOSTER_PRICING = {
    "boost_speed": 15000,  # Eco-Routing Algorithm (formerly Speed)
    "boost_bribe": 25000,  # Priority Customs Clearance (formerly Bribe)
    "boost_radar": 50000   # Advanced Sonar
}

# --- AISStream Live Traffic Engine ---
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
    username: str
    departure_time: Optional[str] = None

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

    # Clean up expired boosters before returning profile
    now = datetime.utcnow()
    valid_boosters = []
    for b in user.active_boosters:
        expires = datetime.fromisoformat(b["expiresAt"])
        if now < expires:
            valid_boosters.append(b)
            
    if len(valid_boosters) != len(user.active_boosters):
        user.active_boosters = valid_boosters
        db.commit()

    return {
        "username": user.username,
        "money": user.money,
        "reputation": user.reputation,
        "active_boosters": user.active_boosters
    }

@app.get("/api/vessels/active")
def get_live_radar():
    return list(LIVE_VESSELS.values())[:300]

@app.get("/api/ticketing/active")
def get_user_exports(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user: return []
    return db.query(Shipment).filter(Shipment.user_id == user.id).all()

@app.post("/api/ticketing/create")
def initiate_export(ticket: ShipmentCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == ticket.username).first()
    cost = DESTINATION_PRICING.get(ticket.destination_country, 0)

    if user.money < cost:
        raise HTTPException(status_code=400, detail="Insufficient persistent credits")

    start_time_str = ticket.departure_time
    departure_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00')) if start_time_str else datetime.utcnow()

    smart_route = pathfinder.plot_smart_course("DAVAO_PORT", ticket.destination_country)
    
    # 🌪️ THE BACKEND DICE ROLL FOR STORMS
    total_duration = 432000000.0
    generated_storm_time = None
    
    # Check if they have the Advanced Sonar booster active (prevents random storms)
    has_sonar = any(b["id"] == "boost_radar" for b in user.active_boosters)
    
    #if not has_sonar and random.random() < 0.40:
    if True: # ⚠️ 100% STORM TEST MODE ACTIVE ⚠️
        impact_offset_percent = 0.2 + (random.random() * 0.6)
        offset_seconds = (total_duration / 1000) * impact_offset_percent
        generated_storm_time = departure_time + timedelta(seconds=offset_seconds)
    
    new_shipment = Shipment(
        user_id=user.id,
        cargo_name=ticket.cargo_name,
        weight_kg=ticket.weight_kg,
        destination_country=ticket.destination_country,
        scale=ticket.scale,
        route_waypoints=smart_route,
        departure_time=departure_time,
        total_duration_ms=total_duration,
        storm_time=generated_storm_time,
        shelter_count=0,
        status="Outbound"
    )
    
    user.money -= cost
    db.add(new_shipment)
    db.commit()
    db.refresh(new_shipment)
    return {"user_money": user.money, "shipment_id": new_shipment.id, "storm_time": generated_storm_time}

@app.post("/api/ticketing/{ship_id}/relaunch")
def relaunch_shipment(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    user = db.query(User).filter(User.username == data.get("username")).first()
    relaunch_cost = DESTINATION_PRICING.get(ship.destination_country, 0) / 2

    if user.money < relaunch_cost:
        raise HTTPException(status_code=400, detail="Insufficient credits for relaunch")

    start_time_str = data.get("departure_time")
    ship.departure_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00')) if start_time_str else datetime.utcnow()
    
    user.money -= relaunch_cost
    ship.status = "Outbound"
    ship.storm_event_handled = False 
    
    # Reroll storm chance on relaunch
    has_sonar = any(b["id"] == "boost_radar" for b in user.active_boosters)
    if not has_sonar and random.random() < 0.40:
        impact_offset_percent = 0.2 + (random.random() * 0.6)
        offset_seconds = (ship.total_duration_ms / 1000) * impact_offset_percent
        ship.storm_time = ship.departure_time + timedelta(seconds=offset_seconds)
    else:
        ship.storm_time = None

    db.commit()
    return {"user_money": user.money, "departure_time": ship.departure_time}

@app.post("/api/ticketing/{ship_id}/resolve_event")
def resolve_ship_event(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    if not ship: 
        raise HTTPException(status_code=404, detail="Ship not found")
        
    user = db.query(User).filter(User.username == data.get("username")).first()
    choice = data.get("choice")
    
    # --- AUTHORITATIVE RESOLUTION LOGIC ---
    if choice == 'SHELTER':
        ship.shelter_count += 1
        if ship.shelter_count >= 2:
            # STRIKE TWO: Contract Terminated
            ship.status = "Failed"
            user.money -= 10000
            user.reputation -= 10
        else:
            # STRIKE ONE: Sheltered
            ship.status = "Sheltered"
            user.money -= 5000
            
    elif choice == 'PUSH':
        success = random.random() < 0.20 # 20% Success Rate
        if success:
            user.money += 15000
            user.reputation += 10
        else:
            user.money -= 30000
            user.reputation -= 20
            
    # Clamp reputation bounds
    user.reputation = max(0, min(100, user.reputation))
    ship.storm_event_handled = True
    
    db.commit()
    return {"status": ship.status, "user_money": user.money, "reputation": user.reputation}

@app.post("/api/ticketing/{ship_id}/arrive")
def resolve_arrival(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    user = db.query(User).filter(User.username == data.get("username")).first()
    
    # Prevent double-payouts if the frontend accidentally sends two requests
    if ship.status == "Arrived":
        return {"message": "Already processed", "user_money": user.money}
        
    cost = DESTINATION_PRICING.get(ship.destination_country, 0)
    
    # 🔥 THE BULK PAYOUT: 1.5x the route cost (e.g., 20k -> 30k)
    payout = int(cost * 1.5)
    
    # If they have the Eco-Routing booster, give them an extra 20% bonus!
    has_eco = any(b["id"] == "boost_speed" for b in user.active_boosters)
    if has_eco:
        payout = int(payout * 1.2)
        
    user.money += payout
    
    # Small reputation bump for a successful delivery
    user.reputation = min(100, user.reputation + 2) 
    ship.status = "Arrived"
    
    db.commit()
    return {"user_money": user.money, "payout": payout, "reputation": user.reputation}

@app.post("/api/user/{username}/activate_booster")
def activate_booster(username: str, data: dict, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    item_id = data.get("item_id")
    cost = BOOSTER_PRICING.get(item_id, 999999)

    if user.money < cost:
        raise HTTPException(status_code=400, detail="Insufficient credits")

    # Boosters last for 1 hour (simulated or real, depending on your frontend clock)
    # Using real-time 1 hour for standard web app tracking
    expires_at = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    
    new_booster = {"id": item_id, "expiresAt": expires_at}
    
    current_boosters = list(user.active_boosters)
    current_boosters.append(new_booster)
    user.active_boosters = current_boosters
    user.money -= cost
    db.commit()
    
    return {"money": user.money, "active_boosters": user.active_boosters}

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