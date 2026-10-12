# WharfIntel Architecture & Data Model

## System Overview
WharfIntel is a web-based maritime simulation and predictive analytics system.
- **Frontend**: React (Vite) application located in `/frontend`. Uses Leaflet for map rendering (`Map.jsx`, `Simulation.jsx`).
- **Backend**: FastAPI Python application located in `/backend/app`. Uses PostgreSQL for data storage (`database.py`, `models.py`).
- **Machine Learning**: Utilizes Random Forest models (`.joblib` files) for congestion, global hub, low/medium density, and transit predictions.

## Contracts & Routing
- Frontend communicates with the backend REST API.
- Pathfinder logic is handled in `/backend/app/pathfinder.py`.
- Model retraining scripts are isolated in `train_model.py` and `train_multibrain.py`.