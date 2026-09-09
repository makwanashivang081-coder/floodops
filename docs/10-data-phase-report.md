# Data phase run report

**Date:** 2026-09-08  
**Command:** `python scripts/generate_phase_data.py` then `python scripts/test_data_phase.py all`  
**Result:** PASS=94  WARN=0  FAIL=0

## Phase results

| Phase | Test | Result | What was collected |
|---|---|---|---|
| D1 | `test_data_phase.py d1` | PASS | cities.json, wards, blackspots≥15, assets, rain, SOP, weights |
| D2 | `test_data_phase.py d2` | PASS | blackspots≥25, peak/moderate replay, low_point_scores, thicker SOP |
| D3 | `test_data_phase.py d3` | PASS | BMC ground-truth CSV, method.md, tide sample, photo manifest 20/20/5 |
| D4 | `test_data_phase.py d4` | PASS | roads.geojson, depots, outcomes.schema.json |
| D5 | `test_data_phase.py d5` | PASS | demo seed_state + OFFLINE_CHECKLIST |

## Honesty — usable vs still incomplete for production claims

| Item | Usable for coding MVP? | Incomplete for accuracy claims? |
|---|---|---|
| Blackspots (27/city) | Yes | Not full BMC 498 / PMC 201 |
| Wards GeoJSON | Yes (bbox placeholders) | Replace with official OSM admin polygons later |
| low_point_scores | Yes (proxy_v1_until_DEM) | Replace with real DEM computation |
| peak/moderate rain | Yes (synthetic REPLAY) | Keep labelled REPLAY; optional real archive later |
| Tide sample | Yes for schema | Replace with INCOIS/port series |
| Photo test set | Manifest slots ready | **Actual images not collected yet** |
| Roads | Yes (seed corridors) | Expand OSM extract for real routing |
| SOP / weights / assets | Yes | Ready for SopRulePlanner |

## Bugs found and fixed during this run

1. Windows console crash on Unicode `≥` / em-dash in test printer → replaced with ASCII; tests now green.
2. Missing D1–D5 seed files → generated via `scripts/generate_phase_data.py`.

## How to re-test

```bash
cd "pccoe hack"
python scripts/generate_phase_data.py   # idempotent extras
python scripts/test_data_phase.py all
```

## Next engineering step (not data)

Wire these files into the API (`pnpm data:load`) and build Live Link on top of D1.
