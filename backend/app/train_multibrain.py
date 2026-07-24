import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib

print("🌊 Booting Context-Aware Multi-Brain Forge...")

# Define our three different traffic environments
ENVIRONMENTS = {
    "low_density": {"baseline": 100, "fluctuation": 30},
    "medium_density": {"baseline": 500, "fluctuation": 100},
    "global_hub": {"baseline": 1800, "fluctuation": 300} # Matches your Google Search stats!
}

for env_name, config in ENVIRONMENTS.items():
    print(f"\n🧠 Forging AI Brain: {env_name.upper()}...")
    
    ships_per_day = []
    current_baseline = config["baseline"]
    
    # 1. Generate 365 days of synthetic history for this specific density
    for _ in range(365):
        fluc = np.random.randint(-config["fluctuation"], config["fluctuation"])
        # Keep it within realistic bounds for its tier
        lower_bound = int(config["baseline"] * 0.5)
        upper_bound = int(config["baseline"] * 1.5)
        current_baseline = max(lower_bound, min(upper_bound, current_baseline + fluc))
        ships_per_day.append(current_baseline)

    # 2. Build the Time-Series Dataset
    X_data, y_data = [], []
    for i in range(len(ships_per_day) - 3):
        day_of_week = i % 7  
        current_traffic = ships_per_day[i]
        traffic_in_72h = ships_per_day[i + 3]
        port_status = 1 if current_traffic > (config["baseline"] * 1.2) else 0
        
        X_data.append([day_of_week, port_status, current_traffic])
        y_data.append(traffic_in_72h)

    # 3. Train the specific brain
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(np.array(X_data), np.array(y_data))

    # 4. Save it
    filename = f"{env_name}_rf_model.joblib"
    joblib.dump(model, filename)
    print(f"✅ SUCCESS! {filename} generated.")

print("\n🚀 All 3 WharfIntel AI Engines are ready for deployment!")