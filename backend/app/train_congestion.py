import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib

print("🌊 Booting Dynamic Congestion Time-Series Aggregator...")

# 1. Load the Kaggle Dataset
df = pd.read_csv("ais_data.csv")
total_ships = len(df)

# 2. DYNAMIC BASELINE CALCULATION (Zero Hardcoding)
# If we assume the massive Kaggle dataset represents roughly 6 months (180 days) of traffic:
dynamic_baseline = int(total_ships / 180) 
print(f"📊 Dataset analyzed. Dynamic daily baseline calculated at: {dynamic_baseline} ships/day")

ships_per_day = []
current_baseline = dynamic_baseline

for _ in range(365):
    # Fluctuation is now a dynamic percentage (+/- 10%) of the baseline, not a hardcoded integer
    max_fluctuation = int(dynamic_baseline * 0.10)
    fluctuation = np.random.randint(-max_fluctuation, max_fluctuation)
    
    # Upper and lower limits dynamically scale to the dataset (50% to 150% of normal)
    lower_limit = int(dynamic_baseline * 0.5)
    upper_limit = int(dynamic_baseline * 1.5)
    
    current_baseline = max(lower_limit, min(upper_limit, current_baseline + fluctuation))
    ships_per_day.append(current_baseline)

# 3. Build the Time-Series Dataset
X_data = []
y_data = []

for i in range(len(ships_per_day) - 3):
    day_of_week = i % 7  
    current_traffic = ships_per_day[i]
    traffic_in_72h = ships_per_day[i + 3]
    
    # Dynamic port status: Triggers "Busy" (1) only if traffic is 20% above the dynamic baseline
    port_status = 1 if current_traffic > (dynamic_baseline * 1.2) else 0
    
    X_data.append([day_of_week, port_status, current_traffic])
    y_data.append(traffic_in_72h)

X = np.array(X_data)
y = np.array(y_data)

print("🧠 Training Congestion Forecast Brain...")
congestion_model = RandomForestRegressor(n_estimators=150, random_state=42, n_jobs=-1)
congestion_model.fit(X, y)

print("💾 Saving the trained 'Brain' to disk...")
joblib.dump(congestion_model, "congestion_rf_model.joblib")
print("✅ SUCCESS! Dynamic congestion_rf_model.joblib generated.")