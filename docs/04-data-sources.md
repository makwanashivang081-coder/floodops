# Data Sources

Every input, its status, its source, and what happens if it is missing. If a source cannot be described in one sentence, it is not used.

## Live

| Input | Source | Access | Resolution | Notes |
|---|---|---|---|---|
| Rain forecast, hourly, 7–16 days | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Free, no key, 10k calls/day | 2–11 km grid | Sampled at ward centroid. Verified working for Pune (18.52, 73.85). Not a radar nowcast. |
| Soil moisture, evapotranspiration | Open-Meteo (same call) | Free | Same | Optional modifier: saturated ground drains slower. |
| Tide level (Mumbai) | Public tide tables (INCOIS / port authority) | Free | Hourly | Coastal cities only. High tide + heavy rain is the known worst case. |
| Citizen photo reports | Our intake (`POST /reports`) | — | Point | Only live when someone submits. In demos, we submit. |
| Crew / pump availability | Officer input in dashboard | — | — | No ULB exposes this. Manual entry is the honest design. |

## Static (computed or curated once per city)

| Input | Source | Access | Notes |
|---|---|---|---|
| Terrain low-point score | Copernicus GLO-30 or SRTM 30 m DEM | Free download | Flow-accumulation / sink detection in `tools/terrain/`. Computed once, stored in PostGIS. |
| Ward boundaries | Open data portals (Mumbai, Pune), OpenStreetMap | Free | GeoJSON in `data/cities/<city>/wards.geojson`. |
| Road graph | OpenStreetMap | Free | For route checks only. Storm drains are mostly absent in OSM — not modelled. |
| Historical blackspots — Mumbai | BMC annual chronic flooding-spot list | Public (news, BMC releases) | ~300–400 spots. Also our **validation ground truth**. |
| Historical blackspots — Pune | PMC PDFs, news archives (2019 Ambil Odha, Sinhagad Rd, Katraj, Baner) | Public, scattered | ~40–100 spots, hand-curated with a `source` column per row. |
| Flood-response SOP corpus | NDMA urban flooding guidelines, municipal SOPs | Public PDFs | Basis for Nugen alignment. Stored under `data/sop/`. |

## Not available (and what we do instead)

| Wanted | Reality | Substitute |
|---|---|---|
| Live ULB complaint feed | Not public | Citizen intake |
| Radar nowcast (next 30–60 min) | IMD radar is imagery, no clean API | Hourly model forecast |
| Live water-level sensors | Exist only in some metros, not open | Verified citizen reports |
| Live road closures | No feed | Roads with verified flooded reports are treated as blocked |
| Multi-year structured flood incident data | Does not exist for Indian cities | Curated blackspot list; scoring is rule-based, not trained |

## Replay mode

`ReplayRainProvider` serves a stored past rain event (e.g. a July peak) through the same interface as the live provider. Used to demonstrate monsoon behaviour outside the season. Always labelled **REPLAY** in the UI. Never mixed with live data in one view.

## Validation

The only accuracy claim we make: **overlap between our top-N ranked spots for Mumbai under a replayed heavy-rain day and BMC's published chronic flooding list.** One number, method documented, reproducible from the repo.

## Per-city folder contract

```
data/cities/<city>/
├── wards.geojson        ward polygons with id, name
├── blackspots.csv       lat, lon, name, since_year, source_url
├── replay/              stored rain events for demo
└── sources.md           where every file came from, when, and how it was cleaned
```

Adding a city means filling this folder. No code changes.
