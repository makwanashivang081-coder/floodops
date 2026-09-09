# Mumbai validation method

1. Load Mumbai spots with risk scoring under `replay/peak.json` rain (no citizen reports).
2. Take top-N (N=50 and N=100 when list is large enough; for current seed use N=min(15, count)).
3. A hit = predicted spot within **150 m** of a ground-truth BMC-curated coordinate in `mumbai_bmc_ground_truth.csv`.
4. Overlap % = hits / N × 100.
5. Re-run from clean clone via `pnpm validate mumbai` (to be wired in Phase 2.7 code).

**Honesty:** ground truth file is our curated digitisation of publicly named BMC spots, not the full unpublished 498-row official GIS export.
