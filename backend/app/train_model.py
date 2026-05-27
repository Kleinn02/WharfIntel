import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
import random

print("📂 Loading Kaggle AIS Dataset...")
# Load the real dataset you downloaded
df = pd.read_csv("ais_data.csv")

# We sample 50,000 rows so your MacBook trains it quickly without overheating
print("📊 Processing 50,000 real maritime voyages...")
df = df.sample(n=50000, random_state=42)

print("⚙️ Augmenting data with WharfIntel Features (Weight & Weather)...")
# The Kaggle dataset has 'dist_km'. We convert it to Nautical Miles (NM)
df['distance_nm'] = df['dist_km'] * 0.539957

# We inject our specific system variables into the real data
df['weight_kg'] = [random.randint(1000, 25000) for _ in range(len(df))]
df['weather_risk'] = [round(random.uniform(0.0, 1.0), 2) for _ in range(len(df))]

# Define our 3 WharfIntel features and our Target (ETA in hours)
X = df[['distance_nm', 'weight_kg', 'weather_risk']].values
y = df['ETA_hours'].values

print("🧠 Training Random Forest Regressor (This might take 30-60 seconds)...")
# n_jobs=-1 tells the AI to use all available CPU cores on your Mac
rf_model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1) 
rf_model.fit(X, y)

print("💾 Saving the trained 'Brain' to disk...")
joblib.dump(rf_model, "transit_rf_model.joblib")
print("✅ SUCCESS! transit_rf_model.joblib generated. FastAPI is ready to use it.")