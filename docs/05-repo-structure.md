# Repository Structure

Clean tree. Every folder has one job. Inspired by PortSense’s *clarity*, not its *size*.

**Principle:** PortSense failed for us under time because it modelled a whole data platform. FloodOps models one product. If a folder is not needed for flood dispatch, it is not created.

---

## Target tree (create in Phase 2)

```
FloodOps/                          # rename when name is locked
├── README.md
├── package.json                   # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml             # postgis + minio + api + web
├── .env.example
├── .gitignore
│
├── docs/
│   ├── 01-problem-statement.md
│   ├── 02-architecture.md
│   ├── 03-phases.md
│   ├── 04-data-sources.md
│   ├── 05-repo-structure.md       # this file (conventions)
│   ├── 06-storage-architecture.md
│   ├── 07-domain-model.md
│   └── mockups/                   # Phase 1 PNGs
│
├── apps/
│   ├── api/                       # HTTP + composition root
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts            # wire ports → use-cases → routes
│   │       ├── app.ts             # create server
│   │       ├── config/
│   │       │   ├── env.ts
│   │       │   ├── database.ts
│   │       │   └── storage.ts
│   │       ├── interfaces/        # HTTP only
│   │       │   ├── middleware/
│   │       │   │   ├── error-handler.ts
│   │       │   │   ├── request-id.ts
│   │       │   │   └── logging.ts
│   │       │   ├── routes/
│   │       │   │   ├── health.routes.ts
│   │       │   │   ├── cities.routes.ts
│   │       │   │   ├── reports.routes.ts
│   │       │   │   ├── assets.routes.ts
│   │       │   │   ├── dispatch.routes.ts
│   │       │   │   └── validation.routes.ts
│   │       │   ├── controllers/
│   │       │   └── presenters/    # domain → HTTP DTO
│   │       └── application/       # use-cases (service layer)
│   │           ├── LoadCityData.ts
│   │           ├── RefreshRainForecast.ts
│   │           ├── RefreshTide.ts
│   │           ├── SubmitCitizenReport.ts
│   │           ├── UpdateAssetAvailability.ts
│   │           ├── GenerateDispatchPlan.ts
│   │           ├── GetLatestDispatch.ts
│   │           ├── RecordOutcome.ts
│   │           └── ValidateAgainstBlackspots.ts
│   │
│   └── web/                       # Next.js — officer + citizen
│       ├── package.json
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx                 # redirect → dashboard
│           │   ├── dashboard/page.tsx
│           │   └── report/page.tsx
│           ├── features/
│           │   ├── dashboard/
│           │   │   ├── DispatchList.tsx
│           │   │   ├── WhyPanel.tsx
│           │   │   ├── WardMap.tsx
│           │   │   ├── AssetForm.tsx
│           │   │   └── ReplayBanner.tsx
│           │   └── report/
│           │       ├── ReportForm.tsx
│           │       └── CredibilityResult.tsx
│           ├── services/          # one fn per API endpoint
│           │   └── api.ts
│           └── components/        # shared UI only
│
├── packages/
│   ├── domain/                    # entities + ports ONLY (no SQL, no HTTP)
│   │   ├── package.json
│   │   └── src/
│   │       ├── entities/
│   │       │   ├── city.ts
│   │       │   ├── ward.ts
│   │       │   ├── spot.ts
│   │       │   ├── report.ts
│   │       │   ├── asset.ts
│   │       │   ├── dispatch-plan.ts
│   │       │   └── outcome.ts
│   │       ├── value-objects/
│   │       │   ├── credibility.ts
│   │       │   ├── severity.ts
│   │       │   └── risk-breakdown.ts
│   │       ├── ports/
│   │       │   ├── rain-provider.ts
│   │       │   ├── tide-provider.ts
│   │       │   ├── photo-store.ts
│   │       │   ├── planner.ts
│   │       │   └── repositories.ts
│   │       └── errors.ts
│   │
│   ├── scoring/                   # pure functions, no I/O
│   │   ├── package.json
│   │   ├── weights.json
│   │   └── src/
│   │       ├── credibility.ts
│   │       ├── severity.ts
│   │       ├── risk.ts
│   │       ├── next-at-risk.ts
│   │       └── index.ts
│   │
│   ├── database/                  # migrations + SQL repos (implements domain ports)
│   │   ├── package.json
│   │   ├── migrations/
│   │   │   ├── 001_extensions.sql
│   │   │   ├── 002_cities_wards.sql
│   │   │   ├── 003_spots_blackspots.sql
│   │   │   ├── 004_roads.sql
│   │   │   ├── 005_reports.sql
│   │   │   ├── 006_assets.sql
│   │   │   ├── 007_snapshots_rain_tide.sql
│   │   │   ├── 008_dispatch.sql
│   │   │   ├── 009_outcomes.sql
│   │   │   ├── 010_planner_calls.sql
│   │   │   ├── 011_validation_runs.sql
│   │   │   └── 012_indexes.sql
│   │   ├── seeds/
│   │   └── src/
│   │       ├── client.ts
│   │       ├── transaction.ts
│   │       └── repositories/
│   │           ├── city.repository.ts
│   │           ├── report.repository.ts
│   │           ├── asset.repository.ts
│   │           ├── plan.repository.ts
│   │           ├── snapshot.repository.ts
│   │           ├── outcome.repository.ts
│   │           └── validation.repository.ts
│   │
│   ├── infrastructure/            # external adapters (not SQL)
│   │   ├── package.json
│   │   └── src/
│   │       ├── rain/
│   │       │   ├── open-meteo.provider.ts
│   │       │   └── replay.provider.ts
│   │       ├── tide/
│   │       │   └── public-tide.provider.ts
│   │       ├── planner/
│   │       │   ├── nugen.planner.ts
│   │       │   └── noop.planner.ts
│   │       ├── photo/
│   │       │   ├── s3.photo-store.ts
│   │       │   └── local-disk.photo-store.ts
│   │       └── vision/
│   │           └── water-detector.ts
│   │
│   └── shared/                    # zod contracts shared by api + web
│       ├── package.json
│       └── src/
│           ├── report.contract.ts
│           ├── dispatch.contract.ts
│           └── city.contract.ts
│
├── data/                          # git-versioned seeds ONLY
│   ├── cities/
│   │   ├── mumbai/
│   │   │   ├── wards.geojson
│   │   │   ├── blackspots.csv
│   │   │   ├── assets.seed.json
│   │   │   ├── replay/
│   │   │   └── sources.md
│   │   └── pune/
│   │       └── (same)
│   └── sop/
│       ├── ndma-urban-flooding.md
│       └── municipal-response-actions.md
│
├── tools/
│   └── terrain/
│       ├── README.md              # how to fetch DEM (not committed)
│       └── compute-low-points.ts
│
├── infrastructure/                # deploy glue, not business logic
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   └── web.Dockerfile
│   ├── postgres/
│   │   └── init.sql               # create db / extensions bootstrap
│   └── minio/
│       └── buckets.sh
│
└── scripts/
    ├── data-load.ts               # pnpm data:load <city>
    └── validate.ts                # pnpm validate <city>
```

---

## Dependency direction (no cycles, no overlap)

```mermaid
flowchart TB
    web[apps/web] --> shared[packages/shared]
    web --> api_http[apps/api HTTP]

    api[apps/api application] --> domain[packages/domain]
    api --> scoring[packages/scoring]
    api --> shared

    db[packages/database] --> domain
    infra[packages/infrastructure] --> domain
    infra --> shared

    api -.wires at main.ts.-> db
    api -.wires at main.ts.-> infra
    scoring --> domain
```

| Package | May depend on | Must not depend on |
|---|---|---|
| `domain` | nothing product-specific | database, infrastructure, apps |
| `scoring` | `domain` (types only) | database, infrastructure, apps |
| `shared` | nothing (zod only) | domain implementations |
| `database` | `domain` | infrastructure, apps, scoring |
| `infrastructure` | `domain`, `shared` | database, apps |
| `apps/api` | all packages | — |
| `apps/web` | `shared` only (via HTTP to api) | domain, database, infrastructure |

---

## What PortSense had that we will **not** create

| PortSense folder | Why skip |
|---|---|
| `packages/pipeline` + parsers + stages | Fixed inputs; no CSV/PDF/HTML ingestion platform |
| `packages/domain/schema`, `mapping`, `provenance` | Not our product |
| `workers/python` | Not needed at prototype scale |
| Dual domain (packages/domain **and** apps copying entities) | One domain package only |
| OpenAPI for 8 resource types (source, dataset, artifact…) | Thin API in `docs/07` |
| `.next` / build artefacts in repo trees | gitignored; never documented as architecture |

---

## Layer rules inside `apps/api`

| Layer | Contains | Imports |
|---|---|---|
| `interfaces/` | routes, controllers, presenters, middleware | `application`, `shared` |
| `application/` | use-cases | `domain`, `scoring`, `shared` |
| `main.ts` | composition | everything (only place adapters are constructed) |

SQL stays in `packages/database`. HTTP stays in `interfaces`. Scoring stays in `packages/scoring`. Nugen stays in `packages/infrastructure/planner`.

---

## Naming

- Use-cases: `VerbNoun.ts` (`GenerateDispatchPlan.ts`)
- Repositories: `*.repository.ts` implementing domain ports
- Providers/adapters: `*.provider.ts` / `*.planner.ts` / `*.photo-store.ts`
- Cities: lowercase slugs `mumbai`, `pune`
- No `utils/` dump — helpers live next to the only caller, or in `shared` if both apps need them

---

## When folders appear

| When | What exists |
|---|---|
| Now (Phase 0–1) | `docs/`, `README`, `.gitignore` |
| Phase 2.0 | empty `apps/`, `packages/`, `data/` scaffolds + Compose |
| Phase 2.1+ | fill packages in build order from `03-phases.md` |

Do not create empty PortSense-scale trees “for later.” Create a folder the week you fill it.
