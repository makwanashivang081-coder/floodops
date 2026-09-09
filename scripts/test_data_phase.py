#!/usr/bin/env python3
"""FloodOps data usability tests — run after each collection phase."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ERRORS: list[str] = []
WARNS: list[str] = []
PASSES: list[str] = []


def ok(msg: str) -> None:
    PASSES.append(msg)
    print(f"  PASS  {msg}")


def warn(msg: str) -> None:
    WARNS.append(msg)
    print(f"  WARN  {msg}")


def fail(msg: str) -> None:
    ERRORS.append(msg)
    print(f"  FAIL  {msg}")


def require_file(path: Path, label: str) -> bool:
    if path.is_file() and path.stat().st_size > 0:
        ok(f"{label}: {path.relative_to(ROOT)}")
        return True
    fail(f"{label} missing or empty: {path.relative_to(ROOT)}")
    return False


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def validate_blackspots(city: str, min_rows: int) -> None:
    path = DATA / "cities" / city / "blackspots.csv"
    if not require_file(path, f"{city} blackspots"):
        return
    rows = load_csv(path)
    if len(rows) < min_rows:
        fail(f"{city} blackspots: need >={min_rows}, got {len(rows)}")
    else:
        ok(f"{city} blackspots: {len(rows)} rows (>={min_rows})")
    required = {"name", "lat", "lon", "since_year", "source_url"}
    for i, row in enumerate(rows, start=2):
        missing = required - {k for k, v in row.items() if v and str(v).strip()}
        if missing:
            fail(f"{city} blackspots L{i}: missing {sorted(missing)}")
            continue
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except ValueError:
            fail(f"{city} blackspots L{i}: bad lat/lon")
            continue
        if not (15.0 <= lat <= 22.0 and 70.0 <= lon <= 80.0):
            warn(f"{city} blackspots L{i}: lat/lon outside western-India box ({lat},{lon})")
        if not str(row["source_url"]).startswith("http"):
            fail(f"{city} blackspots L{i}: source_url must be http(s)")


def validate_json(path: Path, label: str) -> dict | list | None:
    if not require_file(path, label):
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"{label}: invalid JSON ({e})")
        return None
    ok(f"{label}: JSON parses")
    return data


def validate_geojson(path: Path, label: str, min_features: int) -> None:
    data = validate_json(path, label)
    if data is None:
        return
    if data.get("type") != "FeatureCollection":
        fail(f"{label}: must be FeatureCollection")
        return
    feats = data.get("features") or []
    if len(feats) < min_features:
        fail(f"{label}: need >={min_features} features, got {len(feats)}")
    else:
        ok(f"{label}: {len(feats)} features")
    for i, feat in enumerate(feats):
        props = feat.get("properties") or {}
        if not props.get("id") and not props.get("name"):
            fail(f"{label} feature[{i}]: needs id or name")
        geom = feat.get("geometry") or {}
        if geom.get("type") not in {"Polygon", "MultiPolygon", "Point", "LineString", "MultiLineString"}:
            fail(f"{label} feature[{i}]: bad geometry type {geom.get('type')}")


def validate_assets(city: str) -> None:
    path = DATA / "cities" / city / "assets.seed.json"
    data = validate_json(path, f"{city} assets")
    if not isinstance(data, list):
        if data is not None:
            fail(f"{city} assets: must be a JSON array")
        return
    if len(data) < 3:
        fail(f"{city} assets: need >=3 units, got {len(data)}")
    else:
        ok(f"{city} assets: {len(data)} units")
    for i, a in enumerate(data):
        for key in ("id", "kind", "name", "depot_lat", "depot_lon", "available"):
            if key not in a:
                fail(f"{city} assets[{i}]: missing {key}")


def validate_rain(city: str) -> None:
    replay_dir = DATA / "cities" / city / "replay"
    files = list(replay_dir.glob("*.json")) if replay_dir.is_dir() else []
    if not files:
        fail(f"{city} rain: no replay/*.json")
        return
    ok(f"{city} rain: {len(files)} replay file(s)")
    for path in files:
        data = validate_json(path, f"{city} rain {path.name}")
        if not isinstance(data, dict):
            continue
        hourly = data.get("hourly") or {}
        if "precipitation" not in hourly and "precip_mm" not in data:
            # allow our peak format
            if "hours" not in data:
                fail(f"{city} rain {path.name}: need hourly.precipitation or hours[]")
            else:
                ok(f"{city} rain {path.name}: custom hours format ({len(data['hours'])} rows)")
        else:
            precip = hourly.get("precipitation") or []
            if len(precip) < 12:
                warn(f"{city} rain {path.name}: fewer than 12 hourly points")
            else:
                ok(f"{city} rain {path.name}: {len(precip)} hourly precip points")


def validate_sop() -> None:
    sop_dir = DATA / "sop"
    files = list(sop_dir.glob("*.md")) if sop_dir.is_dir() else []
    if len(files) < 2:
        fail(f"SOP: need >=2 markdown files, got {len(files)}")
        return
    ok(f"SOP: {len(files)} files")
    joined = "\n".join(p.read_text(encoding="utf-8").lower() for p in files)
    for word in ("pump", "desilt", "barricade", "monitor"):
        if word not in joined:
            fail(f"SOP: vocabulary missing '{word}'")
        else:
            ok(f"SOP: contains action '{word}'")


def validate_weights() -> None:
    path = ROOT / "packages" / "scoring" / "weights.json"
    data = validate_json(path, "scoring weights")
    if not isinstance(data, dict):
        return
    for key in ("terrain", "blackspot", "rain_3h", "tide", "verified_reports"):
        if key not in data:
            fail(f"weights: missing {key}")
        else:
            try:
                float(data[key])
                ok(f"weights.{key}={data[key]}")
            except (TypeError, ValueError):
                fail(f"weights.{key} not numeric")


def validate_cities_index() -> None:
    path = DATA / "cities.json"
    data = validate_json(path, "cities index")
    if not isinstance(data, list):
        if data is not None:
            fail("cities.json must be an array")
        return
    slugs = {c.get("slug") for c in data}
    for need in ("pune", "mumbai"):
        if need not in slugs:
            fail(f"cities.json missing slug={need}")
        else:
            ok(f"cities.json has {need}")


def phase_d1() -> None:
    print("\n=== PHASE D1 - MVP Live Link data ===")
    validate_cities_index()
    for city in ("pune", "mumbai"):
        validate_blackspots(city, min_rows=15)
        validate_geojson(DATA / "cities" / city / "wards.geojson", f"{city} wards", min_features=3)
        validate_assets(city)
        validate_rain(city)
        require_file(DATA / "cities" / city / "sources.md", f"{city} sources.md")
    validate_sop()
    validate_weights()


def phase_d2() -> None:
    print("\n=== PHASE D2 - thicken ===")
    validate_blackspots("pune", min_rows=25)
    validate_blackspots("mumbai", min_rows=25)
    for city in ("pune", "mumbai"):
        validate_geojson(DATA / "cities" / city / "wards.geojson", f"{city} wards full", min_features=8)
        peak = DATA / "cities" / city / "replay" / "peak.json"
        moderate = DATA / "cities" / city / "replay" / "moderate.json"
        require_file(peak, f"{city} peak replay")
        require_file(moderate, f"{city} moderate replay")
        low = DATA / "cities" / city / "low_point_scores.csv"
        if require_file(low, f"{city} low_point_scores"):
            rows = load_csv(low)
            if len(rows) < 15:
                fail(f"{city} low_point_scores: need >=15 rows")
            else:
                ok(f"{city} low_point_scores: {len(rows)} rows")
    sop_files = list((DATA / "sop").glob("*.md"))
    if sum(p.stat().st_size for p in sop_files) < 1500:
        fail("SOP corpus too thin (<1.5KB total)")
    else:
        ok(f"SOP corpus size OK ({sum(p.stat().st_size for p in sop_files)} bytes)")


def phase_d3() -> None:
    print("\n=== PHASE D3 - validation + tide + photos ===")
    require_file(DATA / "validation" / "mumbai_bmc_ground_truth.csv", "BMC ground truth")
    require_file(DATA / "validation" / "method.md", "validation method")
    tide = DATA / "cities" / "mumbai" / "tide_sample.json"
    data = validate_json(tide, "Mumbai tide sample")
    if isinstance(data, dict) and "heights_m" in data:
        ok(f"tide points: {len(data['heights_m'])}")
    elif data is not None:
        fail("tide_sample.json needs heights_m array")
    photos = DATA / "validation" / "photo_test_set" / "manifest.json"
    man = validate_json(photos, "photo test manifest")
    if isinstance(man, dict):
        items = man.get("items") or []
        floods = sum(1 for x in items if x.get("label") == "flood")
        dry = sum(1 for x in items if x.get("label") == "dry")
        dup = sum(1 for x in items if x.get("label") == "duplicate")
        if floods < 20 or dry < 20 or dup < 5:
            fail(f"photo manifest needs 20/20/5, got {floods}/{dry}/{dup}")
        else:
            ok(f"photo manifest counts {floods}/{dry}/{dup}")


def phase_d4() -> None:
    print("\n=== PHASE D4 - roads + depots + outcomes ===")
    for city in ("pune", "mumbai"):
        validate_geojson(DATA / "cities" / city / "roads.geojson", f"{city} roads", min_features=5)
        require_file(DATA / "cities" / city / "depots.seed.json", f"{city} depots")
    require_file(DATA / "validation" / "outcomes.schema.json", "outcomes schema")


def phase_d5() -> None:
    print("\n=== PHASE D5 - offline / demo pack ===")
    require_file(DATA / "demo" / "seed_state.json", "demo seed state")
    require_file(DATA / "demo" / "OFFLINE_CHECKLIST.md", "offline checklist")
    for city in ("pune", "mumbai"):
        require_file(DATA / "cities" / city / "replay" / "peak.json", f"{city} offline peak rain")


def main() -> int:
    phase = (sys.argv[1] if len(sys.argv) > 1 else "all").lower()
    runners = {
        "d1": phase_d1,
        "d2": phase_d2,
        "d3": phase_d3,
        "d4": phase_d4,
        "d5": phase_d5,
    }
    if phase == "all":
        for fn in runners.values():
            fn()
    elif phase in runners:
        runners[phase]()
    else:
        print("Usage: python scripts/test_data_phase.py [d1|d2|d3|d4|d5|all]")
        return 2

    print("\n=== SUMMARY ===")
    print(f"PASS={len(PASSES)}  WARN={len(WARNS)}  FAIL={len(ERRORS)}")
    if ERRORS:
        print("FAILED CHECKS:")
        for e in ERRORS:
            print(f"  - {e}")
        return 1
    print("DATA USABLE for requested phase(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
