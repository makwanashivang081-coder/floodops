# Architecture (detail views)

**Prefer the single end-to-end doc:** [`00-full-architecture.md`](00-full-architecture.md).

This file keeps four zoomed-in views: context, data pipeline, code layers, and runtime sequences.

---

## 1. System context

Who and what touches the system.

```mermaid
flowchart TB
    OFFICER([City engineer / disaster cell])
    CITIZEN([Citizen])

    subgraph FloodOps
        WEB[Web app<br/>officer dashboard · citizen report]
        API[API<br/>use-cases · scoring · planning]
        DB[(PostgreSQL + PostGIS)]
        BLOB[(Photo storage)]
    end

    OPENMETEO[Open-Meteo<br/>rain forecast]
    TIDE[Tide tables]
    NUGEN[Nugen aligned model]
    DEM[DEM tiles<br/>Copernicus / SRTM]
    OSM[OpenStreetMap<br/>roads, wards]
    CITYDATA[City blackspot lists<br/>BMC · PMC]

    OFFICER --> WEB
    CITIZEN --> WEB
    WEB --> API
    API --> DB
    API --> BLOB
    API --> OPENMETEO
    API --> TIDE
    API --> NUGEN
    DEM -.offline preprocessing.-> DB
    OSM -.offline preprocessing.-> DB
    CITYDATA -.curated once.-> DB
```

---

## 2. Data pipeline

How one dispatch list is produced. Left to right, every hour or on every new report.

```mermaid
flowchart LR
    subgraph Static["Static layer (per city, loaded once)"]
        WARDS[Ward polygons]
        LOW[Terrain low-point score]
        BLACK[Blackspot history]
        ROADS[Road graph]
    end

    subgraph Live["Live layer"]
        RAIN[Hourly rain per ward]
        TIDEL[Tide level]
        REPORTS[Citizen reports]
        CREWS[Crew / pump availability]
    end

    subgraph Scoring["packages/scoring — pure functions"]
        CRED[Credibility score<br/>water detected · geofence · EXIF age · duplicate hash]
        SEV[Severity estimate<br/>depth cues · report count · rain intensity]
        RISK[Spot risk = f(low, black, rain, tide, verified reports)]
        NEXT[Next-at-risk<br/>same catchment · lower elevation · rain continuing]
    end

    subgraph Planning["apps/api — use-cases"]
        NUGENP[Nugen aligned model<br/>SOP → action · crew · priority · explanation]
        ROUTE[Route check<br/>road graph minus reported flooded segments]
    end

    OUT[Dispatch list<br/>JSON + UI]
    LOGDB[(Incident & outcome log)]

    REPORTS --> CRED --> SEV --> RISK
    RAIN --> RISK
    TIDEL --> RISK
    LOW --> RISK
    BLACK --> RISK
    RISK --> NEXT --> NUGENP
    CREWS --> NUGENP
    NUGENP --> ROUTE
    ROADS --> ROUTE
    ROUTE --> OUT --> LOGDB
```

### Where Nugen sits, precisely

Nugen does **not** compute risk. Scoring is deterministic code so every number is explainable.

Nugen's aligned model receives the scored, ranked spots plus crew availability and the city's flood SOP corpus, and returns a **structured plan**: for each spot — action (`pump` / `desilt` / `barricade` / `monitor`), crew assignment, priority, and a one-paragraph justification an officer can read. Alignment on SOPs is what makes it output municipal actions instead of generic advice.

Output is validated against a schema before it reaches the UI. If the model returns something unparseable, the officer sees the ranked list without actions rather than a broken screen.

---

## 3. Code layers (clean architecture)

Dependencies point inward only. Nothing in `domain` imports from anywhere else.

```mermaid
flowchart TB
    subgraph interfaces["interfaces/  — HTTP routes, controllers, DTO mapping"]
        R1[reports.routes]
        R2[dispatch.routes]
        R3[cities.routes]
    end

    subgraph application["application/  — use-cases (service layer)"]
        U1[SubmitCitizenReport]
        U2[RefreshRainForecast]
        U3[GenerateDispatchPlan]
        U4[RecordOutcome]
    end

    subgraph domain["domain/  — entities, value objects, rules"]
        D1[Spot · Ward · Report · Crew · DispatchItem]
        D2[Ports: RainProvider · Planner · ReportRepo · SpotRepo · PhotoStore]
    end

    subgraph infrastructure["infrastructure/  — adapters"]
        I1[OpenMeteoRainProvider]
        I2[NugenPlanner]
        I3[PostgisSpotRepo]
        I4[S3PhotoStore]
        I5[ReplayRainProvider]
    end

    interfaces --> application --> domain
    infrastructure --> domain
    application -.injected.-> infrastructure
```

`packages/scoring` is pure TypeScript with no I/O — `domain` calls it, tests cover it exhaustively, and it is the same code for every city.

`ReplayRainProvider` implements the same port as `OpenMeteoRainProvider`. Switching to replay mode is a config flag, not a code path.

---

## 4. Runtime sequences

### 4a. Citizen submits a report

```mermaid
sequenceDiagram
    actor C as Citizen
    participant W as Web
    participant A as API
    participant S as scoring
    participant P as PhotoStore
    participant D as DB

    C->>W: photo + location + note
    W->>A: POST /reports
    A->>P: store photo
    A->>S: credibility(photo, exif, geofence, recentHashes)
    S-->>A: score, flags
    A->>S: severity(photo, nearbyReports, rainNow)
    S-->>A: level
    A->>D: save Report{credibility, severity}
    A-->>W: 201 {reportId, credibility, severity}
    A->>A: enqueue GenerateDispatchPlan(city)
```

### 4b. Dispatch plan is generated

```mermaid
sequenceDiagram
    participant J as Scheduler / trigger
    participant A as API (GenerateDispatchPlan)
    participant R as RainProvider
    participant D as DB
    participant S as scoring
    participant N as NugenPlanner
    participant W as Officer dashboard

    J->>A: run(city)
    A->>R: hourly forecast per ward
    A->>D: static layers + verified reports + crews
    A->>S: riskPerSpot(...) → nextAtRisk(...)
    S-->>A: ranked spots
    A->>N: plan(rankedSpots, crews, sopContext)
    N-->>A: structured plan (validated)
    A->>A: route check vs reported flooded roads
    A->>D: save DispatchPlan
    W->>A: GET /dispatch/latest
    A-->>W: list with explanations
```

---

## 5. Explainability contract

Every dispatch item carries its own evidence. This is the thing judges and officers will click on.

```json
{
  "spot": "Sinhagad Rd – Vitthalwadi underpass",
  "priority": 1,
  "action": "pump",
  "crew": "Pump unit 3 (Warje depot)",
  "why": {
    "rain_next_3h_mm": 42,
    "terrain_low_point": 0.91,
    "blackspot_since": 2019,
    "verified_reports": 3,
    "severity": "impassable",
    "route_ok": true
  },
  "explanation": "Three verified reports show vehicle-depth water; 42 mm forecast in next 3h; chronic blackspot; route via Karve Rd is clear."
}
```
