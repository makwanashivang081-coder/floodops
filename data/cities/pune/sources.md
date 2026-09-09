# Pune data sources

Collected: 2026-09-08 for FloodOps MVP.

## blackspots.csv

| Source | What we took | Status |
|---|---|---|
| Hindustan Times, 24 Apr 2025 — PMC 201 flood-prone spots | Ward-level counts + named corridors (Hadapsar-Mundhwa 18, Wanowrie 14, Bibwewadi 13, Kondhwa 12, Aundh-Baner 9, Sinhagad Rd 5, …) | Seeded representative spots per cluster |
| Hindustan Times, May 2025 — 28/29 new spots after first rains | Zone 2 (Aundh/Baner/Shivajinagar) emphasis | Added Aundh–Baner / Shivajinagar rows |
| Bridge Chronicle / local monsoon coverage | Extra urban corridors (Kharadi, Hinjewadi) | Named rows with source_url |
| OpenStreetMap Nominatim | lat/lon for named places | Some underpasses hand-placed; flagged in `notes` |

**Honesty:** PMC does not publish a public CSV of all 201 lat/lon points. We curate a **seed set** (~15) with `source_url` per row. Expand toward 40–100 before validation claims on Pune.

## replay/

| File | Source |
|---|---|
| `live-sample-open-meteo.json` | Open-Meteo Forecast API, Pune 18.5204, 73.8567 — sample pull 2026-09-08 |

## Still to collect

- [ ] Official ward polygons GeoJSON (PMC open data / OSM admin boundaries)
- [ ] More named spots from PMC PDFs if released
- [ ] DEM-derived `low_point_score` via `tools/terrain/`
- [ ] Peak monsoon replay JSON (historical heavy-rain day)
