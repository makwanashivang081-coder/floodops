# Accuracy and data (what we train vs what we curate)

## Do we train an ML model for steps 1–4?

| Step | Train a model? | What we actually do | How accuracy is judged |
|---|---|---|---|
| Credibility | Optional small **vision** model later for “water in photo” | Rules + vision flag + GPS + age + duplicate hash | Hold-out set: 20 flood / 20 dry / 5 dupes |
| Severity | **No** | Rules from depth cues + report count + rain | Officer-readable labels; not a % claim |
| Risk | **No** | Weighted formula: terrain + blackspot + rain + tide + verified reports | Mumbai top-N overlap vs BMC list |
| Next-at-risk | **No** | Same catchment, lower elevation, rain continuing | Heuristic; never call it prediction |
| Planning | **Nugen align** on SOP text (after invite) + SopRulePlanner now | Schema-validated actions | Valid plan rate; SOP vocabulary only |

**Why we do not scrape the web to train a flood model:** there is no multi-year labelled “this lat/lon flooded at this hour” dataset for Indian ULBs. A scraped news model would be inaccurate, unexplainable, and easy to destroy in Q&A. Accuracy for FloodOps = **good curated ground truth + live signals + explainable weights**, validated against BMC’s published list.

## Data we collect (this is the main accuracy work)

1. **Blackspots** — curated CSV with lat, lon, name, year, `source_url` (started in `data/cities/*/blackspots.csv`)
2. **Rain** — Open-Meteo live + stored replay JSON
3. **Terrain** — DEM low-point score (compute once)
4. **Wards / roads** — OSM / open portals
5. **Citizen photos** — our intake (creates the live labelled signal over time)
6. **SOP text** — for Nugen / rule planner

## Collection rules

- Prefer official or citeable news/PDF sources; every blackspot row needs `source_url`
- Do not scrape behind logins or ignore site blocks
- Expand seed CSVs; do not invent coordinates without a note
- Mumbai seed grows toward BMC list coverage before we print an overlap %
