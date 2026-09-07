# FloodOps — Full Architecture (Start → End)

**One diagram. Whole system.**

![FloodOps end-to-end architecture](assets/floodops-architecture.png)

Working name: **FloodOps** — rain + terrain + history + citizen photos → verified, scored, planned dispatch list for the city engineer.

Detail docs (not extra diagrams): `01` problem · `03` phases · `04` data · `05` repo · `06` storage tables · `07` domain/API.

---

## How to read it (left → right)

| Stage | What |
|---|---|
| **Actors** | Citizen = sensor. Officer = decision maker. |
| **Web → API** | Report page + dashboard → use-cases only. |
| **Externals** | Open-Meteo / tide (live or replay) · Nugen (planning). |
| **Engine 1→6** | Verify → severity → risk → next-at-risk → Nugen plan → route. |
| **Git seeds** | Loaded once into PostGIS (`data:load`). |
| **Storage** | PostGIS = all rows. MinIO/S3 = photo bytes only. |
| **Output** | Dispatch list + why → outcomes → next season. |
| **Side path** | Mumbai top-N vs BMC list → overlap %. |

---

## One line

```
Citizen + Officer + Rain/Tide + Git seeds
  → web → api → Engine(1–6) ↔ Nugen
  → PostGIS + MinIO
  → Dispatch list → Outcome log
```

---

## Explainability on each row

```json
{
  "priority": 1,
  "spot": "…",
  "action": "pump",
  "crew": "Pump unit 3",
  "why": {
    "rain_next_3h_mm": 42,
    "terrain_low_point": 0.91,
    "blackspot_since": 2019,
    "verified_reports": 3,
    "severity": "impassable",
    "route_ok": true
  },
  "explanation": "…"
}
```

---

## Words we do not use

| Don't say | Say |
|---|---|
| prediction | next-at-risk |
| fake detection | credibility score |
| all-India | Mumbai validate · Pune demo |
| government uses this | pilot-ready |
| flood forecast | response prioritisation |

---

## Build order = fill these boxes

| Phase | Boxes |
|---|---|
| 0–1 | This diagram + deck + Nugen slide |
| 2.0–2.2 | Git → PostGIS · rain live/replay |
| 2.3–2.4 | Engine 1–3 · citizen → MinIO |
| 2.5–2.6 | Engine 5–6 · Nugen · dashboard |
| 2.7 | BMC validation |
| 2.8–2.9 | Route + outcome (cuttable) |
| 3 | Same diagram, harden only |

If it is not in the image, it is out of scope.
