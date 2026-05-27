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
import heapq
import math
import joblib
import os

from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import DBSCAN # 🔥 STRIKE 1: Import DBSCAN
from datetime import datetime, timedelta
from . import models, database, pathfinder
from .database import engine, get_db, Base
from .models import User, Shipment
from .auth import get_password_hash, verify_password

# --- PRE-TRAINED ML ENGINES ---
print("🧠 Booting WharfIntel Predictive ML Engines...")

# 1. Load the Kaggle-Trained ETA Brain
if os.path.exists("transit_rf_model.joblib"):
    transit_rf_model = joblib.load("transit_rf_model.joblib")
    print("✅ ETA Model Loaded from Disk (Real AIS Data)")
else:
    print("⚠️ WARNING: transit_rf_model.joblib not found. Run train_model.py first!")
    # Fallback just in case
    transit_rf_model = RandomForestRegressor(n_estimators=10, random_state=42)

# 2. Keep the Congestion Model (We can upgrade this one later if needed)
congestion_rf_model = RandomForestRegressor(n_estimators=50, random_state=42)
X_cong = np.array([[0, 0, 300], [1, 1, 600], [2, 0, 900], [3, 2, 1200], [4, 1, 1500], [5, 0, 500], [6, 1, 800]])
y_cong = np.array([320, 650, 910, 1250, 1550, 510, 840])
congestion_rf_model.fit(X_cong, y_cong)
print("✅ Congestion Model Online.")

# --- BACKEND SIMULATION CONSTANTS ---
DESTINATION_PRICING = {
    "Panabo Wharf": 500, "Davao City Port": 800,
    "Manila, Philippines": 5000, "Cebu Port": 3500,
    "Batangas Terminal": 4200, "Singapore": 20000,
    "Ho Chi Minh, Vietnam": 12000, "Bangkok, Thailand": 15000,
    "Jakarta, Indonesia": 19000, "Muara, Brunei": 11000, 
    "Yangon, Myanmar": 17000, "Dili, Timor-Leste": 6000
}

# --- A-STAR MARITIME NAVMESH ---
WAYPOINTS = {
    "Panabo North Facility": (7.300, 125.650),
    "Central Cold Storage": (7.285, 125.660),
    "Export Processing Zone": (7.270, 125.680),
    "Road_Curve_1": (7.290, 125.658),
    "Road_Curve_2": (7.280, 125.670),

    "DAVAO_PORT": (7.284, 125.681),
    "WP_SARANGANI": (5.3, 125.4),        # South of Mindanao
    "WP_SIBUTU": (4.8, 119.4),           # Near Tawi-Tawi
    "WP_BALABAC": (7.5, 117.0),          # South of Palawan
    "WP_SOUTH_CHINA_SEA": (12.0, 114.0),
    "WP_PHILIPPINE_SEA": (10.5, 127.5),
    "WP_MALACCA": (3.0, 101.0),

    "Singapore": (1.290, 103.850),
    "Bangkok, Thailand": (13.756, 100.501),
    "Manila, Philippines": (14.599, 120.984),
    "Jakarta, Indonesia": (-6.208, 106.845),
    "Ho Chi Minh, Vietnam": (10.823, 106.629),
    "Yangon, Myanmar": (16.840, 96.145),
    "Muara, Brunei": (5.027, 115.064),
    "Dili, Timor-Leste": (-8.558, 125.573)
}

GRAPH = {
    "Panabo North Facility": ["Road_Curve_1"],
    "Central Cold Storage": ["Road_Curve_1"],
    "Road_Curve_1": ["Road_Curve_2"],
    "Road_Curve_2": ["Export Processing Zone"],
    "Export Processing Zone": ["DAVAO_PORT"],

    "DAVAO_PORT": ["WP_SARANGANI", "WP_PHILIPPINE_SEA"],
    "WP_PHILIPPINE_SEA": ["Manila, Philippines"],
    "WP_SARANGANI": ["WP_SIBUTU", "Jakarta, Indonesia", "Dili, Timor-Leste"],
    "WP_SIBUTU": ["WP_BALABAC", "Manila, Philippines", "Muara, Brunei"],
    "WP_BALABAC": ["WP_SOUTH_CHINA_SEA", "WP_MALACCA"],
    "WP_SOUTH_CHINA_SEA": ["Ho Chi Minh, Vietnam", "Bangkok, Thailand", "Manila, Philippines"],
    "WP_MALACCA": ["Singapore", "Yangon, Myanmar"]
}

def haversine(coord1, coord2):
    return math.sqrt((coord1[0] - coord2[0])**2 + (coord1[1] - coord2[1])**2)

def a_star_route(start_node, target_node):
    if target_node not in WAYPOINTS: 
        return [WAYPOINTS[start_node], (0,0)] # Fallback
        
    queue = [(0, start_node, [])]
    seen = set()
    
    while queue:
        (cost, current, path) = heapq.heappop(queue)
        if current in seen: continue
        seen.add(current)
        path = path + [WAYPOINTS[current]]
        
        if current == target_node: return path
            
        for next_node in GRAPH.get(current, []):
            if next_node in seen: continue
            g_cost = cost + haversine(WAYPOINTS[current], WAYPOINTS[next_node])
            f_cost = g_cost + haversine(WAYPOINTS[next_node], WAYPOINTS[target_node])
            heapq.heappush(queue, (f_cost, next_node, path))
            
    return [WAYPOINTS[start_node], WAYPOINTS[target_node]] # Fallback if no path

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
    db.commit()
    return {"message": "Commander registered"}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"message": "Login successful", "user": db_user.username}

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

    # 🔥 DYNAMIC A-STAR ORIGIN ROUTING
    origin_facility = "Panabo North Facility" # Default for Electronics / Raw Materials
    if "Perishable" in ticket.category:
        origin_facility = "Central Cold Storage"
        
    smart_route = a_star_route(origin_facility, ticket.destination_country)
    
    # --- REPLACE THE HARDCODED TOTAL_DURATION WITH THIS ---
    base_distance = DESTINATION_PRICING.get(ticket.destination_country, 1000) / 10 
    weather_risk = 0.8 if True else 0.1 # Simulated risk
        
    # Feed data into the AI: [Distance, Weight, Risk]
    features = np.array([[base_distance, ticket.weight_kg, weather_risk]])
    predicted_hours = transit_rf_model.predict(features)[0]
    
    # 🔥 THE FIX: Wrap the entire calculation in float() to strip the Numpy data type
    total_duration = float(predicted_hours * 60 * 60 * 500)  

    generated_storm_time = None
    if True: # ⚠️ STORM TIMING ⚠️
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
            # 🔥 REWARD FOR SUCCESS
            user.money += 15000
            user.reputation += 10
        else:
            # 🔥 PENALTY FOR FAILURE
            user.money -= 5000
            user.reputation -= 10
            ship.shelter_count += 1
            
            if ship.shelter_count >= 2:
                ship.status = "Failed"
            else:
                ship.status = "Sheltered"
                
                # Cut the waypoints array so they start from the previous dot!
                current_idx = data.get("current_index", 0)
                safe_idx = max(0, current_idx - 1)
                
                original_segments = len(ship.route_waypoints) - 1
                new_waypoints = ship.route_waypoints[safe_idx:]
                new_segments = max(1, len(new_waypoints) - 1)
                
                if original_segments > 0:
                    ship.total_duration_ms = ship.total_duration_ms * (new_segments / original_segments)
                    
                ship.route_waypoints = new_waypoints
            
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
    today_vessels = min(len(LIVE_VESSELS), 1000) if LIVE_VESSELS else 300
    today_index = datetime.utcnow().weekday()
    
    # Predict future traffic
    pred_day1 = int(congestion_rf_model.predict(np.array([[(today_index + 1) % 7, 0, today_vessels]]))[0])
    pred_day2 = int(congestion_rf_model.predict(np.array([[(today_index + 2) % 7, 1, today_vessels + 10]]))[0])
    pred_day3 = int(congestion_rf_model.predict(np.array([[(today_index + 3) % 7, 0, today_vessels - 5]]))[0])

    # Calculate 72H Risk Trend based on AI predictions
    avg_future = (pred_day1 + pred_day2 + pred_day3) / 3
    if avg_future > today_vessels * 0.2:
        risk = "CRITICAL"
    elif avg_future > today_vessels * 0.5:
        risk = "ELEVATED"
    else:
        risk = "NORMAL"

    return {
        "risk_trend": risk,
        "forecast": [
            {"day": "Day -3", "historical": max(0, today_vessels - 45), "predicted": None},
            {"day": "Day -2", "historical": max(0, today_vessels - 20), "predicted": None},
            {"day": "Day -1", "historical": max(0, today_vessels + 15), "predicted": None},
            {"day": "Today", "historical": today_vessels, "predicted": today_vessels},
            {"day": "Day +1", "historical": None, "predicted": pred_day1},
            {"day": "Day +2", "historical": None, "predicted": pred_day2},
            {"day": "Day +3", "historical": None, "predicted": pred_day3},
        ]
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
    