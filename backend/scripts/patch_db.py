# patch_db.py
from sqlalchemy import text
from app.database import engine # Adjust this import if your engine is located elsewhere

def patch_database():
    print("🔧 Initiating Database Schema Patch...")
    
    with engine.connect() as conn:
        try:
            # 1. Rename the old buildings column to our new boosters column
            print("Updating users table...")
            conn.execute(text("ALTER TABLE users RENAME COLUMN owned_buildings TO active_boosters;"))
        except Exception as e:
            print(f"Note: active_boosters might already exist or owned_buildings is missing. ({e})")

        try:
            # 2. Add the Chaos Engine & Two-Strike fields to shipments
            print("Updating shipments table...")
            conn.execute(text("ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shelter_count INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE shipments ADD COLUMN IF NOT EXISTS storm_time TIMESTAMP;"))
            conn.execute(text("ALTER TABLE shipments ADD COLUMN IF NOT EXISTS total_duration_ms FLOAT DEFAULT 432000000.0;"))
            conn.execute(text("ALTER TABLE shipments ADD COLUMN IF NOT EXISTS storm_event_handled BOOLEAN DEFAULT FALSE;"))
        except Exception as e:
            print(f"Error updating shipments: {e}")

        conn.commit()
        print("✅ Database successfully patched! You are cleared for login.")

if __name__ == "__main__":
    patch_database()