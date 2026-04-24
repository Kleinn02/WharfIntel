# app/main.py
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import asyncio
import websockets
import json

from .database import engine, get_db, Base
from .models import User, Shipment
from .auth import get_password_hash, verify_password

Base.metadata.create_all(bind=engine)

app = FastAPI(title="WharfIntel API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AISStream Live Traffic Engine ---
# We inject one permanent "Ghost Ship" at Panabo Wharf so we know the frontend is working!
LIVE_VESSELS = {
    "TEST_001": {
        "id": "TEST_001", "name": "GHOST SHIP (SYSTEM CHECK)", "type": "Cargo",
        "lat": 7.280, "lng": 125.685, "status": "Docked", "heading": 0
    }
}

async def fetch_ais_stream():
    api_key = "0c7e24bd5f030997f83f24e7af7c97ea5e6ad73d" 
    # Bounding box for Southeast Asia
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
                print("📡 Connected to AISStream Live Satellite! Listening for ships...")

                async for message_json in websocket:
                    message = json.loads(message_json)
                    if message["MessageType"] == "PositionReport":
                        meta = message["MetaData"]
                        report = message["Message"]["PositionReport"]
                        mmsi = meta["MMSI"]

                        lat = report.get("Latitude", 0)
                        lng = report.get("Longitude", 0)

                        # FIX: Filter out impossible coordinates that crash React-Leaflet
                        if lat > 90 or lat < -90 or lng > 180 or lng < -180:
                            continue

                        raw_name = meta.get("ShipName")
                        clean_name = raw_name.strip() if raw_name else f"Unknown Vessel {mmsi}"

                        LIVE_VESSELS[mmsi] = {
                            "id": str(mmsi),
                            "name": clean_name,
                            "type": "Cargo", 
                            "lat": lat,
                            "lng": lng,
                            "status": "Inbound" if report.get("Sog", 0) > 0.5 else "Docked", 
                            "heading": report.get("TrueHeading", 0) if report.get("TrueHeading") != 511 else 0
                        }
                        
                        # Print a terminal update every time we collect 50 new ships
                        if len(LIVE_VESSELS) % 50 == 0:
                            print(f"🚢 Radar Update: Tracking {len(LIVE_VESSELS)} live ships... (Last seen: {clean_name})")

        except Exception as e:
            print(f"⚠️ AISStream error: {e}. Reconnecting in 5s...")
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(fetch_ais_stream())

# --- Schemas & Endpoints Below ---
class UserAuth(BaseModel):
    username: str
    password: str

class ShipmentCreate(BaseModel):
    cargo_name: str
    weight_kg: int
    destination_country: str
    scale: str

@app.post("/register")
def register(user: UserAuth, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    hashed = get_password_hash(user.password)
    new_user = User(username=user.username, hashed_password=hashed)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully!"}

@app.post("/login")
def login(user: UserAuth, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"message": "Login successful!", "user": db_user.username}

@app.get("/api/vessels/active")
def get_active_vessels():
    # Return the dictionary values, capped at 300 to prevent browser lag
    return list(LIVE_VESSELS.values())[:300]

@app.post("/api/ticketing/create")
def create_ticket(ticket: ShipmentCreate, db: Session = Depends(get_db)):
    new_shipment = Shipment(**ticket.dict())
    db.add(new_shipment)
    db.commit()
    db.refresh(new_shipment)
    return {"message": "Export protocol initiated", "ticket_id": new_shipment.id}

@app.get("/api/analytics/forecast")
def get_traffic_forecast():
    return [
        {"day": "Day -3", "historical": 85, "predicted": None, "risk": "Low"},
        {"day": "Day -2", "historical": 92, "predicted": None, "risk": "Low"},
        {"day": "Day -1", "historical": 110, "predicted": None, "risk": "Medium"},
        {"day": "Today", "historical": 105, "predicted": 105, "risk": "Medium"},
        {"day": "Day +1", "historical": None, "predicted": 125, "risk": "High"},
        {"day": "Day +2", "historical": None, "predicted": 140, "risk": "Severe"},
        {"day": "Day +3", "historical": None, "predicted": 115, "risk": "Medium"},
    ]