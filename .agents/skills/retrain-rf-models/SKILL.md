---
name: retrain-rf-models
description: Procedure for modifying training scripts or updating the Random Forest .joblib models.
---

1. Inspect the dataset ais_data.csv and the target script (e.g., train_congestion.py or train_multibrain.py).
2. Ensure changes to backend schemas (schemas.py) are reflected in the model features.
3. Do not manually edit .joblib files; always generate them via the training scripts.
4. Verify that the FastAPI endpoints in main.py correctly load the updated models without throwing startup errors.