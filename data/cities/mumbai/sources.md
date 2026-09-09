# Mumbai data sources

Collected: 2026-09-08 for FloodOps MVP.

## blackspots.csv

| Source | What we took | Status |
|---|---|---|
| Mid-Day / BMC Flood Preparedness Guidelines 2026 coverage | Mithi catchment chronic clusters: BKC, Kurla, Santacruz, Powai, Dharavi, Mahim; NW: Malad, Borivali, Dahisar | Seeded |
| Indian Express / Mumbai Live — 498 flooding spots (~10% rise vs 453) | Named works-lag spots: Andheri subway, Khar subway, Saki Naka, Nana Chowk, Vikhroli, Parel | Seeded |
| OpenStreetMap Nominatim | lat/lon | Khar subway approx hand-placed |

**Honesty:** BMC publishes ~498 spots as civic inventory; full official lat/lon master list is **not** a clean public download. Our CSV is a **curated validation seed**. Expand by digitising more named spots from BMC guideline PDFs on [dm.mcgm.gov.in](https://dm.mcgm.gov.in/flood-preparedness-guidelines) before claiming top-N overlap %.

## replay/

| File | Source |
|---|---|
| `live-sample-open-meteo.json` | Open-Meteo Forecast API, Mumbai 19.0760, 72.8777 — sample pull 2026-09-08 |

## Still to collect

- [ ] Digitize more of the 498 list from BMC PDFs / RTI / published annexures
- [ ] Ward polygons GeoJSON
- [ ] Tide series for coastal worst-case
- [ ] DEM low-point scores
- [ ] Peak monsoon replay JSON
