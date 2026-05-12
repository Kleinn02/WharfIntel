# backend/app/clean_db.py
from app.database import SessionLocal
from app.models import Shipment

def wipe_corrupted_ships():
    db = SessionLocal()
    try:
        # This counts how many ships exist before deleting them
        ghost_ships = db.query(Shipment).count()
        
        print(f"⚠️ Found {ghost_ships} shipments in the database...")
        
        # Execute the deletion
        db.query(Shipment).delete()
        db.commit()
        
        print(f"✅ SUCCESS: {ghost_ships} corrupted shipments have been permanently wiped!")
        print("🚢 Your WharfIntel oceans are now completely clear.")
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    wipe_corrupted_ships()