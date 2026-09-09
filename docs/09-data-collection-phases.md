# Data collection phases

Everything the product needs, grouped by **when we collect it**.  
Full need inventory: kinds A–H in the chat / mirrored below.  
This is a **need list ordered by deadline**, not “only what is easy.”

**Rule:** every row still required for the full product. Phase = *when*, not *whether*.

---

## Phase D0 — Already started (seed)

| ID | Data | Status | Where |
|---|---|---|---|
| B1–B3 | Blackspot seed (~15/city) + source_url | **Done → grown in D1/D2** | `data/cities/*/blackspots.csv` |
| C1 sample | Open-Meteo sample JSON | **Done** | `data/cities/*/replay/live-sample-open-meteo.json` |
| Provenance | sources.md | **Done** | `data/cities/*/sources.md` |

**Latest run:** see `docs/10-data-phase-report.md` — all D1–D5 automated usability tests PASS (94 checks). Photo *images* and full BMC/PMC GIS still open.

---

## Phase D1 — Must have for Live Link (by 10 Sep)

Collect / create these so the prototype can run end-to-end.

| ID | Data | How we get it | Owner | Done when |
|---|---|---|---|---|
| A1 | City records (pune, mumbai) | Hardcode in seed / DB | AI | Both cities exist in API |
| A2–A3 | Wards + centroids (thin OK) | OSM extract or small hand GeoJSON for demo wards | Geo | Map / rain sampling works for Pune |
| A4–A5 | Spots linked to wards | Expand blackspots.csv → spots table | Geo | `GET /cities/pune/spots` returns rows |
| B1–B3 | Grow Pune seed to ≥25 named spots | Curate + Nominatim; every row has source_url | Geo | CSV count ≥ 25 |
| C1 or C4 | Live rain **or** labelled REPLAY JSON | Open-Meteo adapter **or** stored peak file | Geo | Dashboard shows rain |
| D1–D10 | Report fields | Built by our `/report` API (not scraped) | Vision | Photo → scored row |
| E1–E3 | 3–5 pumps/crews + depots | `assets.seed.json` hand-made | Front | Planner can assign crews |
| F1 | Short SOP action list | Paste NDMA / municipal action bullets into `data/sop/` | AI | SopRulePlanner has vocabulary |
| F3 | Scoring weights | `packages/scoring/weights.json` | AI | Risk returns breakdown |
| F5 | Plan output schema | Code | AI | place→action→crew→why |
| G3 | Demo seed (1–2 fake reports optional) | Script | AI | Cold start not empty |
| H1–H4 | Live URL, repo, PPT, IDs | Deploy + paperwork | Lead | Portal can be submitted |

**D1 gate:** Live Link shows rain → spots → report → ranked plan with why.

---

## Phase D2 — Right after submit (week of 10–20 Sep)

Thicken data quality; still no “drop.”

| ID | Data | How we get it | Done when |
|---|---|---|---|
| A2 | Full ward polygons both cities | OSM / open data portals | Both cities map cleanly |
| B1–B5 | Grow Mumbai toward BMC coverage; Pune toward 40–100 | Curate from BMC PDFs, news, PMC lists | Seed counts documented in sources.md |
| A6 | Terrain low-point scores | Copernicus/SRTM + `tools/terrain/` | Column filled on spots |
| C4 | Peak + moderate replay per city | Build from past Open-Meteo archive / known heavy day | `RAIN_MODE=replay` demo works |
| F1 full | NDMA + municipal SOP chunks | Public PDFs → `data/sop/*.md` | Ready for Nugen align |
| F6 | Planner call log table | Code | Every plan logged |
| G4 | Photo test set 20/20/5 | Collect / label ourselves | Credibility test runnable |

---

## Phase D3 — Accuracy + Nugen (by ~30 Sep / shortlist credits)

| ID | Data | How we get it | Done when |
|---|---|---|---|
| B4 | BMC list as validation ground truth (as many coords as we can digitize) | BMC Flood Preparedness PDFs + named spots | `pnpm validate mumbai` has a real denominator |
| G1–G2 | Validation method + top-N params | Code + `docs` | Overlap % reproducible |
| C3 | Tide series Mumbai | Public tide tables | Risk uses tide when coastal |
| C2 | Soil moisture (optional modifier) | Same Open-Meteo call | Documented in breakdown |
| F2 + Nugen | Aligned model on SOP | Invite / credits / workshop | Nugen primary; SopRules fallback |
| D8 | Water-in-image detector | Small vision model or Nugen vision | Measured ≥ target on G4 set |

---

## Phase D4 — Route + learning (before video / Nov)

| ID | Data | How we get it | Done when |
|---|---|---|---|
| A8 | Road graph | OSM extract into PostGIS | Route check runs |
| A9 | Depots (editable) | Officer form + seed | Route from depot → spot |
| A7 | Catchment neighbours (if not already from DEM) | Terrain tool | Next-at-risk uses it |
| E4–E5 | Outcomes | Dashboard buttons | CSV export works |
| B6 | Prior outcomes linked into history | DB | Next season can read them |
| G3 hardened | Full demo seed script | Script | 15‑min clean clone demo |

---

## Phase D5 — Finale harden (Jan–Feb)

| ID | Data | How we get it | Done when |
|---|---|---|---|
| C4 local | Offline rain snapshots | Cached files on laptop | Demo works with Wi‑Fi cut |
| F5 cached | Last good plan | DB | Nugen down → SopRules still full actions |
| H1 spare | Identical seed on backup laptop | Copy | Venue failure recoverable |

---

## Master checklist (every kind)

### A — Geography
- [ ] A1 City records  
- [ ] A2 Ward polygons  
- [ ] A3 Ward centroids  
- [ ] A4 Spots  
- [ ] A5 Spot→ward  
- [ ] A6 Low-point score  
- [ ] A7 Catchment neighbours  
- [ ] A8 Road graph  
- [ ] A9 Depots  

### B — History
- [ ] B1 Blackspot flag  
- [ ] B2 since_year  
- [ ] B3 source_url  
- [ ] B4 Full BMC list coords  
- [ ] B5 Full PMC list coords  
- [ ] B6 Past outcomes  

### C — Weather
- [ ] C1 Hourly rain  
- [ ] C2 Soil moisture  
- [ ] C3 Tide (Mumbai)  
- [ ] C4 Replay events  
- [ ] C5 Mode + stale flag  

### D — Citizen reports (app-produced)
- [ ] D1–D10 Photo, GPS, time, hash, credibility, severity, spot link  

### E — Operations
- [ ] E1–E3 Assets + availability + depot  
- [ ] E4–E5 Outcomes  

### F — Planning
- [ ] F1 SOP corpus  
- [ ] F2 Action enum  
- [ ] F3 Weights  
- [ ] F4–F6 Plan I/O + logs  

### G — Validation / demo
- [ ] G1–G4 BMC truth, method, demo seed, photo test set  

### H — Submit pack
- [ ] H1 Live Link  
- [ ] H2 Repo  
- [ ] H3 PPT  
- [ ] H4 IDs  

---

## What is *not* a scrape job

| Need | Why scrape won’t fill it |
|---|---|
| D1–D10 | Our app creates these |
| E1–E5 | Officer types / clicks |
| A6 | Computed from DEM |
| C1 | API (Open-Meteo) |
| F5 | Generated by planner |
| H1 | Deploy |

Scraping/curation is mainly **B (blackspots)** + helping **A (wards/roads)** + **F1 (SOP PDFs)**.
