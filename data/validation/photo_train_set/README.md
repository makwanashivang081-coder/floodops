# Photo scene training set

Stored **10500** labelled images across 8 classes.

| Class | Count | Used as |
|---|---:|---|
| flood | 1700 | accept (incident) |
| pothole | 1700 | accept (incident) |
| dry_road | 2300 | reject |
| indoor | 1150 | reject |
| clothing | 1150 | reject |
| nature | 950 | reject |
| object | 850 | reject |
| sky | 700 | reject |

## Files

- `images/{class}/*.jpg` — full training photos (gitignored; regenerate with `pnpm train:photos`)
- `samples/` — 8 examples per class, kept in git
- `labels.csv` — id, label, split, path, accept
- `features.csv` — the exact feature vectors used to train the model
- `../../models/photo-scene/weights.json` — MLP weights loaded at report time

A plain dry road is labelled `dry_road` and must not receive high credibility.
