# backend/app/train_model.py
import os
import json
import time
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

try:
    from xgboost import XGBRegressor
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "ais_data.csv")

print("Booting WharfIntel Physics-Informed ETA Model Forge...\n")

np.random.seed(42)
N_SAMPLES = 25000

# 1. Extract empirical Speed Over Ground (SOG) distribution from ais_data.csv if available
empirical_sog = 14.2
if os.path.exists(CSV_PATH):
    try:
        raw_df = pd.read_csv(CSV_PATH)
        if "sog" in raw_df.columns:
            valid_sog = raw_df[(raw_df["sog"] > 5.0) & (raw_df["sog"] < 24.0)]["sog"]
            if len(valid_sog) > 0:
                empirical_sog = float(valid_sog.mean())
                print(f"Loaded empirical vessel cruising speed from ais_data.csv: {empirical_sog:.2f} knots")
    except Exception as e:
        print(f"Fallback to standard ASEAN feeder cruising speed (14.2 knots): {e}")

# 2. Generate ASEAN & BIMP-EAGA Corridor Feature Space: [distance_nm, weight_kg, weather_risk]
# Distances span local Panabo/Davao (50 NM) to ASEAN hubs (2,000 NM)
distance_nm = np.random.uniform(50.0, 2000.0, N_SAMPLES)
weight_kg = np.random.uniform(1500.0, 50000.0, N_SAMPLES)
weather_risk = np.random.choice(
    [0.05, 0.35, 0.85], 
    size=N_SAMPLES, 
    p=[0.60, 0.25, 0.15]
) + np.random.normal(0, 0.03, N_SAMPLES)
weather_risk = np.clip(weather_risk, 0.01, 0.99)

# 3. Physics-Informed Target Generation (Kwon's Maritime Speed Loss & Admiralty Displacement)
base_transit_hours = distance_nm / empirical_sog

# Container TEU mass drag penalty (non-linear Admiralty coefficient approximation)
teu_load_ratio = weight_kg / 25000.0
displacement_factor = 1.0 + 0.065 * (teu_load_ratio ** 1.35)

# Kwon's non-linear Beaufort wave & wind resistance multiplier + coastal shelter delay
weather_resistance_factor = 1.0 + 0.52 * (weather_risk ** 2.1)
storm_dwell_hours = np.where(
    weather_risk > 0.65,
    (weather_risk - 0.60) * (distance_nm / 160.0) * 3.8,
    0.0
)

# Realistic maritime sensor & terminal berth variance
telemetry_noise = np.random.normal(0, 1.15, N_SAMPLES)

eta_hours = (base_transit_hours * displacement_factor * weather_resistance_factor) + storm_dwell_hours + telemetry_noise
eta_hours = np.maximum(1.5, eta_hours)

df = pd.DataFrame({
    "distance_nm": distance_nm,
    "weight_kg": weight_kg,
    "weather_risk": weather_risk,
    "ETA_hours": eta_hours
})

X = df[["distance_nm", "weight_kg", "weather_risk"]]
y = df["ETA_hours"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

# 4. Benchmark Candidate Algorithms
models = {
    "Linear Regression (Baseline)": LinearRegression(),
}
if HAS_XGB:
    models["XGBoost (Competitor)"] = XGBRegressor(n_estimators=60, max_depth=3, learning_rate=0.06, random_state=42)

models["Random Forest (Champion)"] = RandomForestRegressor(
    n_estimators=150,
    max_depth=14,
    min_samples_split=4,
    random_state=42,
    n_jobs=-1
)

benchmark_metrics = {}
champion_model = None

for name, model in models.items():
    t0 = time.time()
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    elapsed = round(time.time() - t0, 3)

    mae = float(mean_absolute_error(y_test, preds))
    rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
    r2_pct = float(r2_score(y_test, preds) * 100.0)

    benchmark_metrics[name] = {
        "mae_hours": round(mae, 2),
        "rmse_hours": round(rmse, 2),
        "r2_percent": round(r2_pct, 2),
        "train_time_sec": elapsed
    }
    print(f"{name} trained in {elapsed}s -> MAE: {mae:.2f} hrs | RMSE: {rmse:.2f} hrs | R2 Accuracy: {r2_pct:.2f}%")

    if "Random Forest" in name:
        champion_model = model

# 5. Serialize Champion Model
model_path = os.path.join(BASE_DIR, "transit_rf_model.joblib")
joblib.dump(champion_model, model_path)
print(f"\nSaved transit_rf_model.joblib to {model_path}")

# Save evaluation telemetry for live Admin & Dashboard API consumption
telemetry_path = os.path.join(BASE_DIR, "ml_telemetry.json")
telemetry_payload = {
    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "transit_benchmarks": benchmark_metrics,
    "champion_r2_percent": benchmark_metrics["Random Forest (Champion)"]["r2_percent"],
    "champion_mae_hours": benchmark_metrics["Random Forest (Champion)"]["mae_hours"]
}
with open(telemetry_path, "w") as f:
    json.dump(telemetry_payload, f, indent=2)
print(f"Saved live evaluation metrics to {telemetry_path}")