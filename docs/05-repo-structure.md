# Repository Structure and Conventions

Goal: someone opening the repo understands what each folder is for without asking. No clutter, no orphan files.

## Layout

```
.
├── README.md
├── docs/
│   ├── 01-problem-statement.md
│   ├── 02-architecture.md
│   ├── 03-phases.md
│   ├── 04-data-sources.md
│   └── 05-repo-structure.md
│
├── apps/
│   ├── api/                          Node + TypeScript backend
│   │   └── src/
│   │       ├── domain/               entities, value objects, ports (interfaces)
│   │       ├── application/          use-cases — one file per use-case
│   │       ├── infrastructure/       adapters: open-meteo, nugen, postgis, storage, replay
│   │       ├── interfaces/           HTTP routes, controllers, DTOs
│   │       └── main.ts               composition root — wires adapters into use-cases
│   │
│   └── web/                          Next.js — officer dashboard + citizen report page
│       └── src/
│           ├── app/                  routes
│           ├── features/             dashboard/, report/ — UI grouped by feature
│           ├── services/             typed API client, one function per endpoint
│           └── components/           shared UI only
│
├── packages/
│   ├── scoring/                      pure functions: credibility, severity, risk, next-at-risk
│   └── shared/                       types + zod schemas used by api and web
│
├── data/
│   ├── cities/
│   │   ├── mumbai/
│   │   └── pune/
│   └── sop/                          SOP corpus for Nugen alignment
│
└── tools/
    └── terrain/                      DEM → low-point score (one-off, documented)
```

## Layer rules (`apps/api`)

| Layer | May import from | Never imports |
|---|---|---|
| `domain` | `packages/scoring`, `packages/shared` | anything else |
| `application` | `domain` | `infrastructure`, `interfaces` |
| `infrastructure` | `domain` (to implement ports) | `application`, `interfaces` |
| `interfaces` | `application`, `packages/shared` | `infrastructure` |
| `main.ts` | everything | — |

Enforced with an ESLint import-boundary rule, not by trust.

## Service layer

One use-case = one class = one `execute()` method. Names are verbs:

```
application/
├── SubmitCitizenReport.ts
├── RefreshRainForecast.ts
├── GenerateDispatchPlan.ts
├── RecordOutcome.ts
└── ValidateAgainstBlackspots.ts
```

Use-cases receive ports via constructor injection. No use-case touches HTTP, SQL, or a third-party SDK directly.

## Ports (in `domain/ports`)

```
RainProvider        getHourly(wardCentroids, hours): RainSeries[]
Planner             plan(rankedSpots, crews, sopContext): DispatchPlan
ReportRepository    save / findRecentNear / findVerifiedInCity
SpotRepository      findByCity / saveRiskSnapshot
PhotoStore          put(buffer): PhotoRef
```

`OpenMeteoRainProvider` and `ReplayRainProvider` both implement `RainProvider`. `NugenPlanner` implements `Planner`; a `NoopPlanner` returns the ranked list without actions when Nugen is unavailable.

## Error handling

- Adapters throw typed errors (`RainProviderError`, `PlannerError`, `StorageError`).
- Use-cases catch adapter errors and decide: degrade (e.g. planner down → ranked list only) or fail.
- Controllers map errors to HTTP codes in one place. No `try/catch` scattered across routes.
- Nugen output is validated with a zod schema before use. Invalid → `PlannerError`, never a partial render.

## TypeScript

- `strict: true` everywhere, including `packages/`.
- No `any`. Unknown external JSON is `unknown` until parsed by a schema.
- Shared types live in `packages/shared` and are imported by both apps; never duplicated.

## Testing

- `packages/scoring`: exhaustive unit tests — this is the part judges can't see but will ask about.
- `application`: use-case tests with in-memory ports.
- `infrastructure`: one contract test per adapter against recorded responses.
- No end-to-end test suite for the hackathon; the demo script is the e2e test.

## Naming

- Files: `PascalCase.ts` for classes/use-cases, `kebab-case.ts` for everything else.
- Folders: `kebab-case`.
- Cities: lowercase folder names, `mumbai`, `pune`.
- No `utils/` dumping ground. A helper belongs to the layer that uses it or to `packages/shared`.

## What does not go in the repo

- Secrets (`.env` is gitignored; `.env.example` is committed).
- Raw DEM tiles (hundreds of MB). `tools/terrain/README.md` says how to fetch them.
- Photos submitted during demos.
- Generated slide decks. Link them from the README instead.

## Commits and branches

- `main` is always demoable.
- Feature branches: `feat/<area>-<thing>`, e.g. `feat/scoring-credibility`.
- Commit messages: imperative, one line, what and why.
