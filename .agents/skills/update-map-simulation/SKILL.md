---
name: update-map-simulation
description: Plan, implement, or review Leaflet map and pathfinding features in the WharfIntel simulation.
---

1. Read knowledge.md to understand the maritime simulation architecture.
2. Inspect /frontend/src/pages/Simulation.jsx and /frontend/src/components/Map.jsx.
3. If pathfinding logic is changing, trace the request to /backend/app/pathfinder.py.
4. Preserve map telemetry data integrity and ensure React state updates do not break Leaflet rendering.
5. Run frontend build checks to verify the UI compiles.