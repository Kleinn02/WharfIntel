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
import numpy as np
import math
import os
import joblib

from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import DBSCAN # 🔥 STRIKE 1: Import DBSCAN
from datetime import datetime, timedelta
from . import models, database, pathfinder
from .database import engine, get_db, Base
from .models import User, Shipment
from .auth import get_password_hash, verify_password
# 🔥 NEW: Added WebSocket, WebSocketDisconnect, and BackgroundTasks
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

# --- PRE-TRAINED ML ENGINES ---
print("🧠 Booting WharfIntel Predictive ML Engines...")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Safely load the Transit model
try:
    transit_rf_model = joblib.load(os.path.join(BASE_DIR, "transit_rf_model.joblib"))
except:
    transit_rf_model = None

# Safely load all 3 Congestion Models into a dictionary
CONGESTION_BRAINS = {}
try:
    CONGESTION_BRAINS["low"] = joblib.load(os.path.join(BASE_DIR, "low_density_rf_model.joblib"))
    CONGESTION_BRAINS["medium"] = joblib.load(os.path.join(BASE_DIR, "medium_density_rf_model.joblib"))
    CONGESTION_BRAINS["high"] = joblib.load(os.path.join(BASE_DIR, "global_hub_rf_model.joblib"))
    print("✅ All 3 Context-Aware Congestion Engines Loaded")
except Exception as e:
    print(f"❌ WARNING: Multi-Brain loading failed! Error: {e}")

# --- BACKEND SIMULATION CONSTANTS ---
DESTINATION_PRICING = {
    "Panabo Wharf": 500, "Davao City Port": 800,
    "Manila, Philippines": 5000, "Cebu Port": 3500,
    "Batangas Terminal": 4200, "Singapore": 20000,
    "Ho Chi Minh, Vietnam": 12000, "Bangkok, Thailand": 15000,
    "Jakarta, Indonesia": 19000, "Muara, Brunei": 11000, 
    "Yangon, Myanmar": 17000, "Dili, Timor-Leste": 6000
}

# Initialize Database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="WharfIntel Command Center API")

# ==========================================
# 🔥 GLOBAL MULTIPLAYER WEBSOCKET ENGINE
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws/simulation")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BOOSTER_PRICING = {
    "boost_speed": 15000,  # Eco-Routing Algorithm (formerly Speed)
    "boost_bribe": 25000,  # Priority Customs Clearance (formerly Bribe)
    "boost_radar": 50000   # Advanced Sonar
}

# --- AISStream Live Traffic Engine ---
LIVE_VESSELS = {}

async def fetch_ais_stream():
    api_key = "9b10e83852926e663e32eb347078171bae11e0bc" 
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

# --- FIND YOUR STARTUP EVENT AND UPDATE IT ---
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(fetch_ais_stream())

# --- SCHEMAS ---
class UserAuth(BaseModel):
    username: str
    password: str

# --- Add these under your existing schemas ---
class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class AccountDelete(BaseModel):
    password: str

# --- ADMIN SCHEMAS ---
class AdminUserCreate(BaseModel):
    username: str
    password: str
    money: float = 200000.0
    reputation: int = 50

class AdminUserUpdate(BaseModel):
    money: float
    reputation: int

class ShipmentCreate(BaseModel):
    cargo_name: str
    weight_kg: int
    destination_country: str
    scale: str
    category: str  # 🔥 ADD THIS
    username: str
    departure_time: Optional[str] = None

# --- AUTH ENDPOINTS ---
@app.post("/register")
def register(user: UserAuth, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Commander ID already exists")
    new_user = User(username=user.username, hashed_password=get_password_hash(user.password))
    db.add(new_user)
    
    # 🔥 NEW: Permanent System Log
    new_log = models.SystemLog(event_type="AUTH", description=f"New Commander provisioned: {user.username}")
    db.add(new_log)
    
    db.commit()
    return {"message": "Commander registered"}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # 🛡️ BULLETPROOF ROLE CHECK: Bypasses model syncing issues
    user_role = getattr(db_user, 'role', None)
    
    # Fallback if your app/models.py hasn't mapped the column yet
    if user_role is None:
        user_role = "admin" if db_user.username == "PJ Teves" else "commander"
    
    return {
        "message": "Login successful", 
        "user": db_user.username,
        "role": user_role
    }

@app.put("/api/user/{username}/password")
def update_password(username: str, data: PasswordUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")
    
    # Verify the current password before allowing a change
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect current password.")
        
    # Hash the new password and save it
    user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    return {"message": "Security credentials updated successfully."}

@app.delete("/api/user/{username}")
def delete_account(username: str, data: AccountDelete, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")
        
    # Verify password before deleting
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password. Deletion aborted.")
    
    # Delete associated shipments first to prevent database errors
    db.query(Shipment).filter(Shipment.user_id == user.id).delete()
    
    # Delete the user
    db.delete(user)
    
    # 🔥 NEW: Permanent System Log
    new_log = models.SystemLog(event_type="SYSTEM", description=f"Commander decommissioned: {username}")
    db.add(new_log)
    
    db.commit()
    return {"message": "Commander decommissioned permanently."}

# --- SIMULATION AUTHORITATIVE API ---
@app.get("/api/user/{username}/profile")
def get_user_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")

    # Clean up expired boosters before returning profile
    # now = datetime.utcnow()
    # valid_boosters = []
    # for b in user.active_boosters:
    #     expires = datetime.fromisoformat(b["expiresAt"])
    #     if now < expires:
    #         valid_boosters.append(b)
    valid_boosters = []
    for b in user.active_boosters:
        # 🔥 Only process it if it's a new dictionary format
        if isinstance(b, dict) and "expiresAt" in b:
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
    # 🔥 BUMP TO 1000: Leaflet MarkerCluster can handle this smoothly.
    return list(LIVE_VESSELS.values())[:1000]

# 🔥 ROUTE HARMONIZATION: Updated to send authoritative cargo_health
@app.get("/api/admin/ticketing/active")
def get_all_active_exports(db: Session = Depends(get_db)):
    shipments = db.query(Shipment).all()
    result = []
    for s in shipments:
        user = db.query(User).filter(User.id == s.user_id).first()
        result.append({
            "id": s.id,
            "cargo_name": s.cargo_name,
            "scale": s.scale,
            "category": s.category,
            "destination_country": s.destination_country,
            "route_waypoints": s.route_waypoints,
            "departure_time": s.departure_time,
            "total_duration_ms": s.total_duration_ms,
            "status": s.status,
            "storm_event_handled": s.storm_event_handled,
            "shelter_count": s.shelter_count,
            "storm_time": s.storm_time,
            "cargo_health": getattr(s, 'cargo_health', 100.0), # 🔥 THE FIX: Send health to React
            "commander": user.username if user else "Unknown"
        })
    return result

@app.post("/api/ticketing/create")
def initiate_export(ticket: ShipmentCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == ticket.username).first()
    # 🔥 DYNAMIC PRICING: Scale cost by weight (e.g., 5000kg = 5x multiplier)
    base_cost = DESTINATION_PRICING.get(ticket.destination_country, 0)
    weight_multiplier = ticket.weight_kg / 1000.0
    cost = int(base_cost * weight_multiplier)

    # if user.money < cost:
    #     raise HTTPException(status_code=400, detail="Insufficient persistent credits")
    
    start_time_str = ticket.departure_time
    departure_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00')) if start_time_str else datetime.utcnow()

    # 🔥 DYNAMIC A-STAR ORIGIN ROUTING via Dedicated Module
    origin_facility = "Panabo North Facility" # Default for Electronics / Raw Materials
    if "Perishable" in ticket.category:
        origin_facility = "Central Cold Storage"
        
    smart_route = pathfinder.a_star_route(origin_facility, ticket.destination_country)
    
    # --- REPLACE THE HARDCODED TOTAL_DURATION WITH THIS ---
    base_distance = DESTINATION_PRICING.get(ticket.destination_country, 1000) / 10 
    weather_risk = 0.8 if True else 0.1 # Simulated risk
        
    # Feed data into the AI: [Distance, Weight, Risk]
    features = np.array([[base_distance, ticket.weight_kg, weather_risk]])
    predicted_hours = transit_rf_model.predict(features)[0]
    
    # 🔥 THE FIX: Wrap the entire calculation in float() to strip the Numpy data type
    total_duration = float(predicted_hours * 60 * 60 * 500)  

    # 🌩️ MACRO-CLIMATE INTEGRATION
    # Pull the exact weather state at the moment the commander hits deploy
    current_weather = get_weather_state(0)
    weather_risk = current_weather["risk_percent"]
    
    generated_storm_time = None
    
    # Roll the dice against the live weather risk!
    # If risk is 0.85 (Cyclone), they have an 85% chance of hitting a storm.
    if random.random() < weather_risk: 
        # 🔥 DEEP OCEAN FIX: Force the storm to hit strictly between 30% and 75% of the trip
        impact_offset_percent = random.uniform(0.30, 0.75) 
        offset_seconds = (total_duration / 1000) * impact_offset_percent
        generated_storm_time = departure_time + timedelta(seconds=offset_seconds)
        print(f"🌩️ DISASTER LOCKED: Vessel {ticket.cargo_name} will encounter severe weather.")
    else:
        print(f"☀️ CLEAR SKIES: Vessel {ticket.cargo_name} bypassed the anomaly.")
    
    new_shipment = Shipment(
        user_id=user.id,
        cargo_name=ticket.cargo_name,
        weight_kg=ticket.weight_kg,
        destination_country=ticket.destination_country,
        scale=ticket.scale,
        category=ticket.category,  # 🔥 THE 100% FIX: Actually save the category to the database!
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

    # 🔥 BROADCAST TO EVERYONE ON THE NETWORK
    background_tasks.add_task(manager.broadcast, {
        "event": "SYNC_MAP",
        "commander": user.username,
        "action": f"deployed a new vessel to {ticket.destination_country}"
    })
    return {"user_money": user.money, "shipment_id": new_shipment.id, "storm_time": generated_storm_time}

# Inside main.py
@app.post("/api/ticketing/{ship_id}/resolve_event")
def resolve_ship_event(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    if not ship: 
        raise HTTPException(status_code=404, detail="Ship not found")
        
    user = db.query(User).filter(User.username == data.get("username")).first()
    choice = data.get("choice")
    
    current_idx = data.get("current_index", 0)
    safe_idx = max(0, min(current_idx, len(ship.route_waypoints) - 1))
    current_coord = ship.route_waypoints[safe_idx]
    
    # 🔥 INJECT HEALTH PENALTY DATA FROM FRONTEND
    health_penalty = data.get("health_penalty", 0)
    
    # Safety fallback just in case DB hasn't migrated yet
    if not hasattr(ship, 'cargo_health') or ship.cargo_health is None:
        ship.cargo_health = 100.0
        
    ship.cargo_health -= health_penalty
    
    # 💀 INSTANT FAIL STATE: Cargo destroyed
    if ship.cargo_health <= 0:
        ship.cargo_health = 0
        ship.status = "Failed"
        user.money -= 10000
        user.reputation -= 15
        db.commit()
        return {"status": ship.status, "user_money": user.money, "reputation": user.reputation}

    # 🔥 ELITE KNOWLEDGE: The Safe Haven Mapping Doctrine
    SAFE_HAVENS = {
        "WP_SULU_SEA_MAIN": "WP_SARANGANI",
        "WP_SOUTH_CHINA_SEA_MAIN": "WP_SULU_SEA_MAIN",
        "WP_CELEBES_SEA": "WP_SARANGANI",
        "WP_SULU_SEA_SOUTH": "WP_CELEBES_SEA",
        "WP_SOUTH_CHINA_SEA_SOUTH": "WP_SULU_SEA_SOUTH",
        "WP_NATUNA_SEA": "WP_SOUTH_CHINA_SEA_MAIN",
        "WP_MAKASSAR_STRAIT": "WP_SARANGANI",
        "WP_JAVA_SEA": "WP_MAKASSAR_STRAIT",
        "WP_MALACCA": "WP_NATUNA_SEA",
        "WP_PHILIPPINE_SEA": "DAVAO_PORT",
        "WP_DAVAO_GULF_SOUTH": "WP_DAVAO_GULF_NORTH",
        "WP_SARANGANI": "WP_DAVAO_GULF_SOUTH",
        "WP_THAILAND_ROUTE_1": "WP_SOUTH_CHINA_SEA_MAIN",
        "WP_THAILAND_ROUTE_2": "WP_THAILAND_ROUTE_1",
        "WP_JAKARTA_ROUTE_1": "WP_SARANGANI",
        "WP_JAKARTA_ROUTE_2": "WP_MAKASSAR_STRAIT",
        "WP_BRUNEI_ROUTE_1": "WP_SARANGANI",
        "WP_BRUNEI_ROUTE_2": "WP_BRUNEI_ROUTE_1",
        "WP_BRUNEI_ROUTE_3": "WP_BRUNEI_ROUTE_2",
        "WP_BRUNEI_ROUTE_4": "WP_BRUNEI_ROUTE_3",
        "WP_DILI_ROUTE_1": "WP_SARANGANI",
        "WP_DILI_ROUTE_2": "WP_DILI_ROUTE_1",
        "WP_MYANMAR_ROUTE_1": "WP_NATUNA_SEA",
        "WP_MYANMAR_ROUTE_2": "WP_MYANMAR_ROUTE_1",
        "WP_MYANMAR_ROUTE_3": "WP_MALACCA",
        "WP_DAVAO_GULF_NORTH": "DAVAO_PORT",
        "DAVAO_PORT": "Export Processing Zone",
    }
    
    if choice == 'RETREAT':
        ship.shelter_count += 1
        if ship.shelter_count >= 2:
            ship.status = "Failed"
            user.money -= 10000
            user.reputation -= 10
        else:
            ship.status = "Sheltered"
            user.money -= 2500 
            
            # 1. Identify closest node
            nearest_node = None
            min_dist = float('inf')
            for node_name, coords in pathfinder.WAYPOINTS.items():
                dist = pathfinder.haversine(current_coord, coords)
                if dist < min_dist:
                    min_dist = dist
                    nearest_node = node_name
            
            # 2. Look up the Safe Haven
            fallback_node = SAFE_HAVENS.get(nearest_node)
            
            # 3. Find exact coordinate
            if fallback_node and fallback_node in pathfinder.WAYPOINTS:
                safe_coord = pathfinder.WAYPOINTS[fallback_node]
            else:
                retreat_idx = max(0, safe_idx - 1)
                safe_coord = ship.route_waypoints[retreat_idx]

            updated_waypoints = list(ship.route_waypoints)
            updated_waypoints[safe_idx] = safe_coord
            if safe_idx + 1 < len(updated_waypoints):
                updated_waypoints[safe_idx + 1] = safe_coord
                
            for i in range(safe_idx + 2, len(updated_waypoints)):
                updated_waypoints[i] = safe_coord
                
            ship.route_waypoints = updated_waypoints

    elif choice == 'PUSH':
        # 🔥 THE LEARNING ENGINE FIX: No more random chance! Uses quiz result.
        success = data.get("is_success", False) 
        
        if success:
            user.money += 15000
            user.reputation += 10
        else:
            user.money -= 5000
            user.reputation -= 10
            ship.shelter_count += 1
            if ship.shelter_count >= 2:
                ship.status = "Failed"
            else:
                ship.status = "Sheltered"
                
                fallback_idx = max(0, safe_idx - 1)
                safe_coord = ship.route_waypoints[fallback_idx]
                
                updated_waypoints = list(ship.route_waypoints)
                updated_waypoints[safe_idx] = safe_coord
                if safe_idx + 1 < len(updated_waypoints):
                    updated_waypoints[safe_idx + 1] = safe_coord
                for i in range(safe_idx + 2, len(updated_waypoints)):
                    updated_waypoints[i] = safe_coord
                    
                ship.route_waypoints = updated_waypoints
            
    user.reputation = max(0, user.reputation) # Removed the 100-point ceiling!
    ship.storm_event_handled = True
    
    db.commit()
    return {"status": ship.status, "user_money": user.money, "reputation": user.reputation}

# Inside main.py
@app.post("/api/ticketing/{ship_id}/relaunch")
def relaunch_shipment(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    user = db.query(User).filter(User.username == data.get("username")).first()
    
    choice = data.get("choice") 
    current_idx = data.get("current_index", 0)
    
    safe_idx = max(0, min(current_idx, len(ship.route_waypoints) - 1))
    current_coord = ship.route_waypoints[safe_idx]

    # 🔥 APPLY HEALTH DAMAGE FROM WAIT/REROUTE ACTIONS
    health_penalty = data.get("health_penalty", 0)
    if not hasattr(ship, 'cargo_health') or ship.cargo_health is None:
        ship.cargo_health = 100.0
        
    ship.cargo_health -= health_penalty
    
    # 💀 INSTANT FAIL STATE: Cargo destroyed
    if ship.cargo_health <= 0:
        ship.cargo_health = 0
        ship.status = "Failed"
        db.commit()
        return {"user_money": user.money, "status": ship.status}

    nearest_node = None
    min_dist = float('inf')
    for node_name, coords in pathfinder.WAYPOINTS.items():
        dist = pathfinder.haversine(current_coord, coords)
        if dist < min_dist:
            min_dist = dist
            nearest_node = node_name

    if choice == 'REROUTE':
        # 🔥 THE LEARNING ENGINE FIX: Check if they passed the route quiz
        success = data.get("is_success", False)
        
        if success:
            cost = DESTINATION_PRICING.get(ship.destination_country, 0) * 0.70
            if user.money < cost:
                raise HTTPException(status_code=400, detail="Insufficient credits for Reroute")
            user.money -= cost
            
            if nearest_node:
                avoid_nodes = []
                if safe_idx + 1 < len(ship.route_waypoints):
                    next_coord = ship.route_waypoints[safe_idx + 1]
                    for n_name, n_coords in pathfinder.WAYPOINTS.items():
                        if pathfinder.haversine(next_coord, n_coords) < 0.01:
                            avoid_nodes.append(n_name)
                            break 
                
                new_route = pathfinder.a_star_route(nearest_node, ship.destination_country, avoid_nodes, use_reroute_graph=True)
                
                ship.route_waypoints = ship.route_waypoints[:safe_idx] + [current_coord] + new_route
                ship.total_duration_ms += 86400000.0 # +1 Day delay
        else:
            # 🔥 FAILED REROUTE: Forced to Wait It Out as penalty
            if nearest_node:
                resumed_route = pathfinder.a_star_route(nearest_node, ship.destination_country, use_reroute_graph=False)
                ship.route_waypoints = ship.route_waypoints[:safe_idx] + [current_coord] + resumed_route
                
            ship.total_duration_ms += 172800000.0 # +2 Days delay penalty
            
    elif choice == 'WAIT':
        if nearest_node:
            resumed_route = pathfinder.a_star_route(nearest_node, ship.destination_country, use_reroute_graph=False)
            ship.route_waypoints = ship.route_waypoints[:safe_idx] + [current_coord] + resumed_route
            
        ship.total_duration_ms += 172800000.0 # +2 Days delay

    ship.status = "Outbound"
    ship.storm_event_handled = True 
    ship.storm_time = None 
    
    db.commit()
    return {"user_money": user.money, "status": ship.status}

@app.post("/api/ticketing/{ship_id}/arrive")
def resolve_arrival(ship_id: int, data: dict, db: Session = Depends(get_db)):
    ship = db.query(Shipment).filter(Shipment.id == ship_id).first()
    user = db.query(User).filter(User.username == data.get("username")).first()
    
    # Prevent double-payouts if the frontend accidentally sends two requests
    if ship.status == "Arrived":
        return {"message": "Already processed", "user_money": user.money}
        
    cost = DESTINATION_PRICING.get(ship.destination_country, 0)

    # 🔥 DYNAMIC PAYOUT: Must match the weight multiplier they paid for!
    base_cost = DESTINATION_PRICING.get(ship.destination_country, 0)
    weight_multiplier = ship.weight_kg / 1000.0
    actual_cost_paid = int(base_cost * weight_multiplier)
    
    # 🔥 THE BULK PAYOUT: 1.5x the route cost (e.g., 20k -> 30k)
    payout = int(cost * 1.5)
    
    # If they have the Eco-Routing booster, give them an extra 20% bonus!
    has_eco = any(b["id"] == "boost_speed" for b in user.active_boosters)
    if has_eco:
        payout = int(payout * 1.2)
        
    user.money += payout
    
    # 🔥 DYNAMIC REPUTATION REWARD: Scales with Cargo Health
    health = getattr(ship, 'cargo_health', 100.0)
    if health >= 100:
        rep_gain = 10
    elif health >= 90:
        rep_gain = 8
    elif health >= 70:
        rep_gain = 5
    elif health >= 50:
        rep_gain = 2
    else:
        rep_gain = 1 # Barely survived, but still delivered
        
    user.reputation += rep_gain
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

from datetime import datetime

# ==========================================
# 🌩️ MACRO-CLIMATE ENGINE (STOCHASTIC + ADMIN)
# ==========================================
import time

# 🔥 GLOBALS FOR OVERRIDE, EXPIRATION, AND SYNC EPOCH
ADMIN_WEATHER_OVERRIDE = None
ADMIN_OVERRIDE_EXPIRY = None
LAST_AUTO_RESTART_TIME = datetime.utcnow() # 🔥 NEW: Tracks when Auto was clicked

def get_weather_state(offset_minutes=0):
    global ADMIN_WEATHER_OVERRIDE, ADMIN_OVERRIDE_EXPIRY, LAST_AUTO_RESTART_TIME
    target_time = datetime.utcnow() + timedelta(minutes=offset_minutes)
    
    # 1. ADMIN OVERRIDE CHECK (God Mode)
    if ADMIN_WEATHER_OVERRIDE and ADMIN_OVERRIDE_EXPIRY:
        if target_time < ADMIN_OVERRIDE_EXPIRY:
            if ADMIN_WEATHER_OVERRIDE == "NOMINAL":
                return {"state": "NOMINAL", "risk_percent": 0.05, "pressure": 1013, "color": "#2ecc71"}
            elif ADMIN_WEATHER_OVERRIDE == "DETERIORATING":
                return {"state": "DETERIORATING", "risk_percent": 0.35, "pressure": 998, "color": "#f1c40f"}
            elif ADMIN_WEATHER_OVERRIDE == "CYCLONE IMMINENT":
                return {"state": "CYCLONE IMMINENT", "risk_percent": 0.85, "pressure": 960, "color": "#e74c3c"}
        else:
            # OVERRIDE EXPIRED! Revert to Auto automatically and restart the clock
            if offset_minutes == 0: 
                ADMIN_WEATHER_OVERRIDE = None
                ADMIN_OVERRIDE_EXPIRY = None
                LAST_AUTO_RESTART_TIME = datetime.utcnow()

    # 2. STANDARD STOCHASTIC RNG (Dynamic Epoch)
    # 🔥 FIX: Calculates exactly how much time has passed since Auto was clicked
    elapsed_seconds = (target_time - LAST_AUTO_RESTART_TIME).total_seconds()
    if elapsed_seconds < 0: elapsed_seconds = 0 
    
    time_chunk = int(elapsed_seconds // 300)
    chunk_rng = random.Random(time_chunk)
    roll = chunk_rng.random()
    
    if roll < 0.60:
        return {"state": "NOMINAL", "risk_percent": 0.05, "pressure": 1013, "color": "#2ecc71"}
    elif roll < 0.90:
        return {"state": "DETERIORATING", "risk_percent": 0.35, "pressure": 998, "color": "#f1c40f"}
    else: 
        return {"state": "CYCLONE IMMINENT", "risk_percent": 0.85, "pressure": 960, "color": "#e74c3c"}

@app.get("/api/analytics/weather")
def get_global_weather():
    global ADMIN_OVERRIDE_EXPIRY, ADMIN_WEATHER_OVERRIDE, LAST_AUTO_RESTART_TIME
    current_weather = get_weather_state(0)
    
    forecast = [
        {"time": "+15m", "data": get_weather_state(15)},
        {"time": "+30m", "data": get_weather_state(30)},
        {"time": "+45m", "data": get_weather_state(45)}
    ]
    
    now = datetime.utcnow()
    
    # CALCULATE THE EXACT EXPIRATION TIMESTAMP FOR THE FRONTEND TIMER
    if ADMIN_WEATHER_OVERRIDE and ADMIN_OVERRIDE_EXPIRY and ADMIN_OVERRIDE_EXPIRY > now:
        next_shift = ADMIN_OVERRIDE_EXPIRY.isoformat() + "Z"
    else:
        # 🔥 FIX: Dynamic 5-minute loop calculation based on Last Restart Epoch
        elapsed = (now - LAST_AUTO_RESTART_TIME).total_seconds()
        if elapsed < 0: elapsed = 0
        remainder_seconds = elapsed % 300
        seconds_to_next = 300 - remainder_seconds
        next_shift = (now + timedelta(seconds=seconds_to_next)).isoformat() + "Z"
    
    return {
        "current": current_weather,
        "forecast": forecast,
        "system_time": now.isoformat() + "Z",
        "next_shift_time": next_shift,
        "admin_override": ADMIN_WEATHER_OVERRIDE
    }

@app.get("/api/analytics/forecast")
def get_congestion_forecast():
    current_live_traffic = len(LIVE_VESSELS) if len(LIVE_VESSELS) > 0 else 91
    day_of_week = datetime.today().weekday()
    port_status = 1 if current_live_traffic > 200 else 0 

    # 🔥 THE ROUTER: Select the correct AI Brain based on current traffic
    active_brain = None
    if current_live_traffic < 300:
        active_brain = CONGESTION_BRAINS.get("low")
        print(f"🤖 Routing to LOW DENSITY Brain (Traffic: {current_live_traffic})")
    elif current_live_traffic < 1000:
        active_brain = CONGESTION_BRAINS.get("medium")
        print(f"🤖 Routing to MEDIUM DENSITY Brain (Traffic: {current_live_traffic})")
    else:
        active_brain = CONGESTION_BRAINS.get("high")
        print(f"🤖 Routing to GLOBAL HUB Brain (Traffic: {current_live_traffic})")

    # Safety Fallback
    if active_brain is None:
        return {"forecast": [], "risk_trend": "AI OFFLINE"}

    # Execute prediction on the selected brain
    live_input = np.array([[day_of_week, port_status, current_live_traffic]])
    predicted_72h_traffic = int(active_brain.predict(live_input)[0])

    # 🔥 THE FIX: Wire DBSCAN directly into the Risk Trend!
    # We call your existing DBSCAN function to check the map for red zones.
    active_red_zones = get_congestion_zones()

    # If DBSCAN found a traffic jam, INSTANTLY elevate the risk to CRITICAL.
    if len(active_red_zones) > 0:
        risk = "CRITICAL"
    elif predicted_72h_traffic > current_live_traffic * 1.5:
        risk = "CRITICAL"
    elif predicted_72h_traffic > current_live_traffic * 1.2:
        risk = "ELEVATED"
    else:
        risk = "NOMINAL"

    step = (predicted_72h_traffic - current_live_traffic) / 3

    return {
        "forecast": [
            {"day": "Day -3", "historical": max(0, current_live_traffic - 45), "predicted": None},
            {"day": "Day -2", "historical": max(0, current_live_traffic - 20), "predicted": None},
            {"day": "Day -1", "historical": max(0, current_live_traffic + 15), "predicted": None},
            {"day": "Today", "historical": current_live_traffic, "predicted": current_live_traffic},
            {"day": "Day +1", "historical": None, "predicted": int(current_live_traffic + step)},
            {"day": "Day +2", "historical": None, "predicted": int(current_live_traffic + (step * 2))},
            {"day": "Day +3", "historical": None, "predicted": predicted_72h_traffic}
        ],
        "risk_trend": risk
    }

@app.get("/api/analytics/congestion_zones")
def get_congestion_zones():
    if len(LIVE_VESSELS) < 5:
        return []
    
    # 1. Extract Lat/Lng of all ships currently out on the water
    coords = [[v["lat"], v["lng"]] for v in LIVE_VESSELS.values() if v["status"] != "Docked"]
    if not coords: return []
    
    # 2. Run DBSCAN AI
    # eps = roughly 25km search radius. min_samples = 4 ships to form a cluster
    coords_rad = np.radians(coords)
    eps_rad = 25 / 6371.0 
    
    db = DBSCAN(eps=eps_rad, min_samples=4, algorithm='ball_tree', metric='haversine')
    labels = db.fit_predict(coords_rad)
    
    zones = []
    unique_labels = set(labels)
    for label in unique_labels:
        if label == -1: continue # -1 means "Noise" (Safe ships sailing alone)
        
        # 3. Find the exact center of the traffic jam
        cluster_coords = [coords[i] for i in range(len(coords)) if labels[i] == label]
        lats = [c[0] for c in cluster_coords]
        lngs = [c[1] for c in cluster_coords]
        
        zones.append({
            "id": int(label),
            "center": [sum(lats) / len(lats), sum(lngs) / len(lngs)],
            "vessel_count": len(cluster_coords),
            "radius_meters": 20000 + (len(cluster_coords) * 1500) # Zone grows larger with more ships
        })
        
    return zones

# ==========================================
# SYSTEM OVERWATCH (ADMIN ENDPOINTS)
# ==========================================

class WeatherOverride(BaseModel):
    state: Optional[str] # "NOMINAL", "DETERIORATING", "CYCLONE IMMINENT", or None
    duration_minutes: Optional[int] = 5 # 🔥 NEW: Accept duration

# 🔥 UPDATED: Now saves to the permanent log database
@app.post("/api/admin/weather/override")
def set_weather_override(data: WeatherOverride, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    global ADMIN_WEATHER_OVERRIDE, ADMIN_OVERRIDE_EXPIRY, LAST_AUTO_RESTART_TIME
    
    ADMIN_WEATHER_OVERRIDE = data.state
    
    if data.state:
        # Lock in the specific duration
        ADMIN_OVERRIDE_EXPIRY = datetime.utcnow() + timedelta(minutes=data.duration_minutes)
    else:
        # 🔥 THE MASTER FIX: When switching to AUTO, reset the 5-minute timer epoch to right NOW!
        ADMIN_OVERRIDE_EXPIRY = None
        LAST_AUTO_RESTART_TIME = datetime.utcnow()
        
    status = ADMIN_WEATHER_OVERRIDE if ADMIN_WEATHER_OVERRIDE else 'AUTO (Stochastic)'
    
    new_log = models.SystemLog(event_type="CLIMATE", description=f"Global weather locked to: {status}")
    db.add(new_log)
    db.commit()
    
    background_tasks.add_task(manager.broadcast, {
        "event": "SYNC_WEATHER",
        "action": f"Global climate shifted to {status}"
    })
    
    return {"message": f"Global weather locked to: {status}"}

# 🔥 NEW: Endpoint to fetch permanent logs for the Admin Dashboard
@app.get("/api/admin/logs")
def get_system_logs(db: Session = Depends(get_db), limit: int = 50):
    logs = db.query(models.SystemLog).order_by(models.SystemLog.timestamp.desc()).limit(limit).all()
    return [
        {
            "id": l.id, 
            "timestamp": l.timestamp.isoformat(), 
            "event_type": l.event_type, 
            "description": l.description
        } for l in logs
    ]

@app.get("/api/admin/users")
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    # Exclude hashed_password from the payload for security
    return [
        {
            "id": u.id, 
            "username": u.username, 
            "money": u.money, 
            "reputation": u.reputation, 
            "status": "Active"
        } for u in users
    ]

@app.post("/api/admin/users")
def provision_commander(data: AdminUserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Commander ID already exists")
        
    new_user = User(
        username=data.username, 
        hashed_password=get_password_hash(data.password),
        money=data.money,
        reputation=data.reputation
    )
    db.add(new_user)
    db.commit()
    return {"message": "New Commander Provisioned"}

@app.put("/api/admin/users/{user_id}")
def update_commander(user_id: int, data: AdminUserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")
        
    user.money = data.money
    user.reputation = data.reputation
    db.commit()
    return {"message": "Commander Data Updated"}

@app.delete("/api/admin/users/{user_id}")
def purge_commander(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Commander not found")
        
    # Cascade: Obliterate all their active and past shipments first
    db.query(Shipment).filter(Shipment.user_id == user.id).delete()
    
    # Erase the user
    db.delete(user)
    db.commit()
    return {"message": "Commander Purged"}
    