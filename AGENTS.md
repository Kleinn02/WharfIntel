# WharfIntel Agent Rules

1. **Keep Changes Small**: Propose the smallest safe change and edit only the files needed for the task.
2. **Respect Boundaries**: Do not mix frontend React state logic with backend FastAPI database logic in the same step.
3. **Model Safety**: Do not overwrite `.joblib` models without running the associated `train_model.py` scripts and verifying metrics.
4. **Required Checks**:
   - Frontend: Run `npm run build` in the `/frontend` directory to verify UI builds.
   - Backend: Ensure Python scripts parse correctly and database patches (`patch_db.py`) run safely.