# FloodOps — Full Architecture (Start → End)

**This is the single document.** One diagram below is the whole system. Everything else is labels for that diagram.

Working name: **FloodOps**. Product in one line: rain + terrain + history + citizen photos → verified, scored, planned dispatch list for the city engineer.

Related docs (detail only): `01` problem · `03` phases · `04` data sources · `05` repo tree · `06` storage tables · `07` domain/API.

---

## The architecture (all in one)

```mermaid
flowchart TB
    %% ── ACTORS ──
    CITIZEN([Citizen<br/>uploads photo + GPS])
    OFFICER([City engineer<br/>reads plan · edits crews · logs outcome])

    %% ── APPS ──
    WEB[apps/web<br/>Citizen report page · Officer dashboard]

    CITIZEN --> WEB
    OFFICER --> WEB

    %% ── API + ENGINE ──
    API[apps/api<br/>use-cases]

    WEB -->|HTTP| API

    subgraph ENGINE["ENGINE — packages/scoring + infrastructure"]
        direction TB
        V[1 Verification<br/>water · geofence · EXIF · dup hash<br/>→ credibility]
        S[2 Severity<br/>minor / moderate / impassable]
        K[3 Risk score<br/>low-point × blackspot × rain × tide × reports]
        N[4 Next-at-risk<br/>same catchment · lower · rain continuing]
        L[5 Planning<br/>Nugen aligned model + SOP<br/>or NoopPlanner if down]
        U[6 Route check<br/>avoid verified impassable roads]
        V --> S --> K --> N --> L --> U
    end

    API --> ENGINE

    %% ── EXTERNAL LIVE INPUTS ──
    OM[Open-Meteo<br/>hourly rain live / replay]
    TIDE[Tide tables<br/>Mumbai]
    NUGEN[Nugen API<br/>aligned on data/sop]

    OM -->|RefreshRainForecast| API
    TIDE -->|RefreshTide| API
    L <-->|plan JSON| NUGEN

    %% ── STATIC SEEDS → DB ──
    subgraph GIT["GIT — versioned seeds"]
        SEED[data/cities/mumbai · pune<br/>wards · blackspots · replay · assets]
        SOP[data/sop<br/>NDMA + municipal actions]
        DEM[tools/terrain<br/>DEM → low_point_score]
        OSM[OSM roads<br/>offline extract]
    end

    %% ── THREE STORES ──
    subgraph STORES["STORAGE — one fact → one place"]
        PG[(PostgreSQL + PostGIS<br/>wards · spots · reports meta<br/>rain/tide snapshots · assets<br/>dispatch_plans · items · outcomes<br/>validation_runs · planner_calls)]
        OBJ[(MinIO / S3<br/>photos only<br/>photos/city/yyyy/mm/id.jpg)]
    end

    SEED -->|pnpm data:load| PG
    DEM -->|scores once| PG
    OSM -->|load once| PG
    SOP -.->|context at plan time| L

    API -->|photo bytes| OBJ
    API -->|all rows| PG
    ENGINE -->|read scores inputs · write plan| PG

    %% ── OUTPUT ──
    OUT[DISPATCH LIST<br/>priority · spot · action · crew · why<br/>+ REPLAY banner when rain is replayed]
    LOG[OUTCOME LOG<br/>resolved / escalated / false_alarm]

    U --> OUT
    OUT --> WEB
    OFFICER -->|RecordOutcome| LOG
    LOG --> PG
    LOG -.next monsoon curated.-> SEED

    %% ── VALIDATION SIDE PATH ──
    VAL[ValidateAgainstBlackspots<br/>Mumbai top-N vs BMC list<br/>→ overlap %]
    API --> VAL
    VAL --> PG
```

---

## How to read it (left → right / top → bottom)

| Stage | What |
|---|---|
| **Actors** | Citizen = sensor. Officer = decision maker. |
| **Web** | Two screens only: report form + dashboard. |
| **API** | Use-cases wire everything; no business logic in routes. |
| **Engine 1→6** | Verify → severity → risk → anticipate → Nugen plan → route. Scoring is code; Nugen is planning only. |
| **Externals** | Open-Meteo + tide = live/replay weather. Nugen = structured actions + explanations. |
| **Git seeds** | Loaded once into PostGIS. SOP text fed to Nugen at plan time. |
| **Stores** | PostGIS = all structured state. Object storage = photo files only. |
| **Output** | Ranked dispatch list with a `why` panel. Outcomes write back. Mumbai validation is a side path for the accuracy number. |

---

## Same path as a single line

```
Citizen photo + Officer crews
        + Open-Meteo/Tide (+ optional REPLAY)
        + Git seeds (wards, blackspots, terrain, roads, SOP)
                ↓
apps/web → apps/api → Engine(1–6) → Nugen
                ↓
        PostGIS + MinIO
                ↓
   Dispatch list → Officer → Outcome log → (next season) seeds
```

---

## Explainability (what sits on each dispatch row)

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
| prediction | next-at-risk / anticipation |
| fake detection | credibility score |
| all-India | Mumbai validate · Pune demo · engine city-agnostic |
| government uses this | pilot-ready |
| flood forecast | response prioritisation |

---

## Build order (when boxes get filled)

| Phase | Boxes you actually build |
|---|---|
| 0–1 | This doc + deck + Nugen slide |
| 2.0–2.2 | Git load → PostGIS · rain live/replay |
| 2.3–2.4 | Engine steps 1–3 · citizen → MinIO |
| 2.5–2.6 | Engine 5–6 · Nugen · dashboard |
| 2.7 | Validation side path |
| 2.8–2.9 | Route + outcome (cuttable) |
| 3 | Harden the same diagram — no new boxes |

If a feature does not appear in the diagram above, it is out of scope.
