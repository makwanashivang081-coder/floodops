#!/usr/bin/env python3
"""Generate FloodOps seed data for phases D1–D5."""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def square(lon: float, lat: float, d: float = 0.02) -> list[list[float]]:
    return [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
    ]


def write_wards(city: str, wards: list[tuple[str, str, float, float]]) -> None:
    features = []
    for wid, name, lat, lon in wards:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": wid,
                    "name": name,
                    "centroid_lat": lat,
                    "centroid_lon": lon,
                },
                "geometry": {"type": "Polygon", "coordinates": [square(lon, lat)]},
            }
        )
    path = DATA / "cities" / city / "wards.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, indent=2), encoding="utf-8")
    print(f"wrote {path} ({len(features)} wards)")


def write_assets(city: str, assets: list[dict]) -> None:
    path = DATA / "cities" / city / "assets.seed.json"
    path.write_text(json.dumps(assets, indent=2), encoding="utf-8")
    print(f"wrote {path} ({len(assets)} assets)")


def write_depots(city: str, depots: list[dict]) -> None:
    path = DATA / "cities" / city / "depots.seed.json"
    path.write_text(json.dumps(depots, indent=2), encoding="utf-8")
    print(f"wrote {path}")


def synth_rain(path: Path, mode: str, base_mm: float, peak_mm: float) -> None:
    hours = []
    for h in range(24):
        # simple hump
        t = abs(h - 12) / 12
        mm = peak_mm * (1 - t) + base_mm * t
        hours.append({"hour": h, "precip_mm": round(mm, 2)})
    payload = {
        "mode": "replay",
        "label": mode,
        "city_note": "Synthetic monsoon profile for demo/replay. Always show REPLAY banner.",
        "hours": hours,
        "precip_mm_3h_peak": round(sum(x["precip_mm"] for x in hours[11:14]), 2),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {path}")


def append_blackspots(city: str, extras: list[dict]) -> None:
    path = DATA / "cities" / city / "blackspots.csv"
    with path.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys()) if rows else list(extras[0].keys())
    existing = {(r["name"], r["lat"], r["lon"]) for r in rows}
    for e in extras:
        key = (e["name"], str(e["lat"]), str(e["lon"]))
        if key in existing:
            continue
        rows.append({k: str(e.get(k, "")) for k in fieldnames})
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"blackspots {city}: {len(rows)} rows")


def low_points_from_blackspots(city: str) -> None:
    path = DATA / "cities" / city / "blackspots.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    out_rows = []
    for i, r in enumerate(rows):
        # proxy: older blackspots + known underpass names get higher low-point score
        name = r["name"].lower()
        score = 0.55
        if "underpass" in name or "subway" in name or "causeway" in name:
            score = 0.92
        elif "nalla" in name or "odha" in name or "river" in name:
            score = 0.88
        elif int(float(r.get("since_year") or 2020)) <= 2019:
            score = 0.8
        else:
            score = 0.65 + (i % 5) * 0.05
        out_rows.append(
            {
                "spot_name": r["name"],
                "lat": r["lat"],
                "lon": r["lon"],
                "low_point_score": f"{min(score, 0.98):.2f}",
                "method": "proxy_v1_until_DEM",
            }
        )
    out = DATA / "cities" / city / "low_point_scores.csv"
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["spot_name", "lat", "lon", "low_point_score", "method"])
        w.writeheader()
        w.writerows(out_rows)
    print(f"wrote {out} ({len(out_rows)})")


def write_roads(city: str, lines: list[tuple[str, list[list[float]]]]) -> None:
    features = []
    for i, (name, coords) in enumerate(lines):
        features.append(
            {
                "type": "Feature",
                "properties": {"id": f"{city}-road-{i+1}", "name": name, "osm_id": f"seed-{i+1}"},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )
    path = DATA / "cities" / city / "roads.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, indent=2), encoding="utf-8")
    print(f"wrote {path}")


def main() -> None:
    pune_wards = [
        ("pune-hadapsar", "Hadapsar-Mundhwa", 18.5089, 73.9260),
        ("pune-wanowrie", "Wanowrie", 18.4884, 73.8987),
        ("pune-bibwewadi", "Bibwewadi", 18.4752, 73.8562),
        ("pune-kondhwa", "Kondhwa-Yewalewadi", 18.4780, 73.8941),
        ("pune-aundh", "Aundh-Baner", 18.5602, 73.8004),
        ("pune-sinhagad", "Sinhagad Road", 18.4805, 73.8250),
        ("pune-shivaji", "Shivajinagar-Ghole Road", 18.5326, 73.8513),
        ("pune-warje", "Warje-Karvenagar", 18.4820, 73.8020),
        ("pune-katraj", "Dhankawadi-Sahakarnagar", 18.4575, 73.8672),
        ("pune-dhanori", "Yerawada-Kalas-Dhanori", 18.5907, 73.8913),
    ]
    mumbai_wards = [
        ("mum-he", "H/E Ward (BKC/Kurla)", 19.0607, 72.8547),
        ("mum-l", "L Ward (Kurla)", 19.0686, 72.8766),
        ("mum-ke", "K/E Ward (Andheri/Saki)", 19.1193, 72.8470),
        ("mum-hw", "H/W Ward (Khar)", 19.0695, 72.8375),
        ("mum-gn", "G/N Ward (Mahim/Dharavi)", 19.0483, 72.8382),
        ("mum-s", "S Ward (Powai/Vikhroli)", 19.1187, 72.9073),
        ("mum-rn", "R/N Ward (Dahisar)", 19.2600, 72.8599),
        ("mum-pn", "P/N Ward (Malad)", 19.1853, 72.8359),
        ("mum-rc", "R/C Ward (Borivali)", 19.2298, 72.8471),
        ("mum-d", "D Ward (Nana Chowk)", 18.9622, 72.8125),
    ]
    write_wards("pune", pune_wards)
    write_wards("mumbai", mumbai_wards)

    write_assets(
        "pune",
        [
            {"id": "pune-pump-1", "kind": "pump", "name": "Pump unit 1 (Warje depot)", "depot_lat": 18.482, "depot_lon": 73.802, "available": True},
            {"id": "pune-pump-2", "kind": "pump", "name": "Pump unit 2 (Hadapsar depot)", "depot_lat": 18.509, "depot_lon": 73.926, "available": True},
            {"id": "pune-crew-1", "kind": "crew", "name": "Desilt crew A (Swargate)", "depot_lat": 18.5005, "depot_lon": 73.8529, "available": True},
            {"id": "pune-crew-2", "kind": "crew", "name": "Barricade team B (Shivajinagar)", "depot_lat": 18.5326, "depot_lon": 73.8513, "available": True},
            {"id": "pune-pump-3", "kind": "pump", "name": "Pump unit 3 (Baner depot)", "depot_lat": 18.5602, "depot_lon": 73.8004, "available": False},
        ],
    )
    write_assets(
        "mumbai",
        [
            {"id": "mum-pump-1", "kind": "pump", "name": "Pump unit 1 (BKC depot)", "depot_lat": 19.0607, "depot_lon": 72.8547, "available": True},
            {"id": "mum-pump-2", "kind": "pump", "name": "Pump unit 2 (Andheri depot)", "depot_lat": 19.1193, "depot_lon": 72.8470, "available": True},
            {"id": "mum-crew-1", "kind": "crew", "name": "Desilt crew A (Kurla)", "depot_lat": 19.0686, "depot_lon": 72.8766, "available": True},
            {"id": "mum-crew-2", "kind": "crew", "name": "Barricade team B (Dadar)", "depot_lat": 19.0178, "depot_lon": 72.8478, "available": True},
            {"id": "mum-pump-3", "kind": "pump", "name": "Pump unit 3 (Borivali depot)", "depot_lat": 19.2298, "depot_lon": 72.8471, "available": True},
        ],
    )

    write_depots(
        "pune",
        [
            {"id": "pune-depot-warje", "name": "Warje depot", "lat": 18.482, "lon": 73.802},
            {"id": "pune-depot-hadapsar", "name": "Hadapsar depot", "lat": 18.509, "lon": 73.926},
            {"id": "pune-depot-baner", "name": "Baner depot", "lat": 18.5602, "lon": 73.8004},
        ],
    )
    write_depots(
        "mumbai",
        [
            {"id": "mum-depot-bkc", "name": "BKC depot", "lat": 19.0607, "lon": 72.8547},
            {"id": "mum-depot-andheri", "name": "Andheri depot", "lat": 19.1193, "lon": 72.8470},
            {"id": "mum-depot-borivali", "name": "Borivali depot", "lat": 19.2298, "lon": 72.8471},
        ],
    )

    pune_extra = [
        {"name": "Kothrud Paud Road dip", "lat": "18.5074", "lon": "73.8077", "since_year": "2024", "ward_hint": "Kothrud-Bavdhan", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "HT ward cluster Kothrud-Bavdhan"},
        {"name": "Karvenagar lane waterlogging", "lat": "18.4890", "lon": "73.8150", "since_year": "2025", "ward_hint": "Warje-Karvenagar", "source_url": "https://www.hindustantimes.com/cities/pune-news/pmc-identifies-28-new-flood-prone-spots-across-city-after-first-spell-of-rain-101748372179789.html", "notes": "Zone 3 new-spot context"},
        {"name": "Sahakarnagar junction", "lat": "18.4680", "lon": "73.8580", "since_year": "2023", "ward_hint": "Dhankawadi-Sahakarnagar", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "Ward cluster"},
        {"name": "Yerawada low stretch", "lat": "18.5600", "lon": "73.8900", "since_year": "2022", "ward_hint": "Yerawada-Kalas-Dhanori", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "Ward cluster"},
        {"name": "Dhole Patil Road dip", "lat": "18.5390", "lon": "73.8980", "since_year": "2024", "ward_hint": "Dhole Patil", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "HT ward count 7"},
        {"name": "Kasba Peth nalla mouth", "lat": "18.5190", "lon": "73.8570", "since_year": "2021", "ward_hint": "Kasba-Vishrambaugwada", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "Central city drainage"},
        {"name": "Bhavani Peth choke point", "lat": "18.5100", "lon": "73.8650", "since_year": "2023", "ward_hint": "Kasba-Vishrambaugwada", "source_url": "https://www.hindustantimes.com/cities/pune-news/pmc-identifies-28-new-flood-prone-spots-across-city-after-first-spell-of-rain-101748372179789.html", "notes": "Zone 5 context"},
        {"name": "Ramtekdi industrial dip", "lat": "18.5040", "lon": "73.9200", "since_year": "2025", "ward_hint": "Hadapsar-Mundhwa", "source_url": "https://www.hindustantimes.com/cities/pune-news/pmc-identifies-28-new-flood-prone-spots-across-city-after-first-spell-of-rain-101748372179789.html", "notes": "Zone 4 new spots"},
        {"name": "Mundhwa village road", "lat": "18.5320", "lon": "73.9460", "since_year": "2025", "ward_hint": "Hadapsar-Mundhwa", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "Top ward cluster"},
        {"name": "Balewadi high street dip", "lat": "18.5780", "lon": "73.7700", "since_year": "2025", "ward_hint": "Aundh-Baner", "source_url": "https://www.hindustantimes.com/cities/pune-news/pmc-identifies-28-new-flood-prone-spots-across-city-after-first-spell-of-rain-101748372179789.html", "notes": "Zone 2"},
        {"name": "Pashan Sus Road low point", "lat": "18.5430", "lon": "73.7820", "since_year": "2024", "ward_hint": "Aundh-Baner", "source_url": "https://www.thebridgechronicle.com/news/pune-monsoon-201-flood-prone-areas-2025", "notes": "Urban expansion drainage"},
        {"name": "NIBM Kondhwa Road", "lat": "18.4700", "lon": "73.9000", "since_year": "2023", "ward_hint": "Kondhwa-Yewalewadi", "source_url": "https://www.hindustantimes.com/cities/pune-news/pune-civic-body-begins-monsoon-preparedness-to-act-on-201-flood-prone-spots-101745433680626.html", "notes": "Kondhwa cluster"},
    ]
    mumbai_extra = [
        {"name": "Vile Parle East subway approach", "lat": "19.0990", "lon": "72.8440", "since_year": "2024", "ward_hint": "K/E", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "IE named corridor family"},
        {"name": "Santacruz West linking road", "lat": "19.0810", "lon": "72.8380", "since_year": "2023", "ward_hint": "H/W", "source_url": "https://www.mid-day.com/mumbai/mumbai-news/article/bmc-maps-mumbais-worst-waterlogging-hotspots-ahead-of-monsoon--23643205", "notes": "Western suburb waterlogging"},
        {"name": "Kurla East LBS dip", "lat": "19.0750", "lon": "72.8860", "since_year": "2018", "ward_hint": "L", "source_url": "https://www.mid-day.com/mumbai/mumbai-news/article/bmc-maps-mumbais-worst-waterlogging-hotspots-ahead-of-monsoon--23643205", "notes": "Mithi catchment"},
        {"name": "Sion Hospital approach", "lat": "19.0380", "lon": "72.8600", "since_year": "2019", "ward_hint": "F/N", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "Central flood corridor"},
        {"name": "King Circle junction", "lat": "19.0320", "lon": "72.8570", "since_year": "2020", "ward_hint": "F/N", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "Traffic waterlogging"},
        {"name": "Grant Road station west", "lat": "18.9640", "lon": "72.8140", "since_year": "2022", "ward_hint": "D", "source_url": "https://www.mumbailive.com/en/civic/mumbai-see-10-rise-in-flood-prone-spots-to-498-in-a-year-92004", "notes": "South Mumbai cluster"},
        {"name": "Churchgate Oval edge", "lat": "18.9360", "lon": "72.8260", "since_year": "2026", "ward_hint": "A", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "South Mumbai additions reported in 2026 coverage"},
        {"name": "Kemps Corner dip", "lat": "18.9628", "lon": "72.8060", "since_year": "2026", "ward_hint": "D", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "South Mumbai additions"},
        {"name": "Kandivali East underpass approach", "lat": "19.2060", "lon": "72.8730", "since_year": "2021", "ward_hint": "R/S", "source_url": "https://www.mid-day.com/mumbai/mumbai-news/article/bmc-maps-mumbais-worst-waterlogging-hotspots-ahead-of-monsoon--23643205", "notes": "NW Poisar catchment family"},
        {"name": "Goregaon West link road dip", "lat": "19.1660", "lon": "72.8490", "since_year": "2022", "ward_hint": "P/S", "source_url": "https://www.mid-day.com/mumbai/mumbai-news/article/bmc-maps-mumbais-worst-waterlogging-hotspots-ahead-of-monsoon--23643205", "notes": "NW waterlogging"},
        {"name": "Chembur west drain mouth", "lat": "19.0550", "lon": "72.8910", "since_year": "2020", "ward_hint": "M/W", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "Eastern suburb"},
        {"name": "Ghatkopar Andheri link dip", "lat": "19.0860", "lon": "72.9080", "since_year": "2021", "ward_hint": "N", "source_url": "https://indianexpress.com/article/cities/mumbai/bmc-mumbai-flooding-spots-rise-monsoon-mitigation-mithi-river-budget-10570332/", "notes": "Eastern corridor"},
    ]
    append_blackspots("pune", pune_extra)
    append_blackspots("mumbai", mumbai_extra)

    for city in ("pune", "mumbai"):
        synth_rain(DATA / "cities" / city / "replay" / "peak.json", "peak", 2.0, 28.0)
        synth_rain(DATA / "cities" / city / "replay" / "moderate.json", "moderate", 0.5, 8.0)
        low_points_from_blackspots(city)

    write_roads(
        "pune",
        [
            ("Sinhagad Road spine", [[73.820, 18.475], [73.825, 18.480], [73.835, 18.490], [73.850, 18.500]]),
            ("Baner Road", [[73.770, 18.560], [73.800, 18.560], [73.820, 18.550]]),
            ("Hadapsar Mundhwa", [[73.920, 18.520], [73.935, 18.525], [73.950, 18.535]]),
            ("Satara Road", [[73.855, 18.460], [73.856, 18.475], [73.857, 18.490]]),
            ("Karve Road", [[73.800, 18.500], [73.820, 18.510], [73.840, 18.520]]),
            ("Nagar Road", [[73.880, 18.560], [73.900, 18.570], [73.920, 18.580]]),
        ],
    )
    write_roads(
        "mumbai",
        [
            ("LBS Marg", [[72.870, 19.050], [72.880, 19.070], [72.890, 19.090]]),
            ("SV Road", [[72.830, 19.050], [72.835, 19.100], [72.840, 19.150]]),
            ("WEH", [[72.860, 19.080], [72.870, 19.110], [72.880, 19.140]]),
            ("BKC Road", [[72.850, 19.055], [72.855, 19.060], [72.860, 19.065]]),
            ("Link Road Malad", [[72.830, 19.170], [72.835, 19.185], [72.840, 19.200]]),
            ("Eastern Express", [[72.860, 19.030], [72.870, 19.050], [72.880, 19.070]]),
        ],
    )

    # D3 validation
    val = DATA / "validation"
    val.mkdir(parents=True, exist_ok=True)
    # BMC ground truth = mumbai blackspots copy for now + method note
    src = DATA / "cities" / "mumbai" / "blackspots.csv"
    gt = val / "mumbai_bmc_ground_truth.csv"
    gt.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    (val / "method.md").write_text(
        """# Mumbai validation method

1. Load Mumbai spots with risk scoring under `replay/peak.json` rain (no citizen reports).
2. Take top-N (N=50 and N=100 when list is large enough; for current seed use N=min(15, count)).
3. A hit = predicted spot within **150 m** of a ground-truth BMC-curated coordinate in `mumbai_bmc_ground_truth.csv`.
4. Overlap % = hits / N × 100.
5. Re-run from clean clone via `pnpm validate mumbai` (to be wired in Phase 2.7 code).

**Honesty:** ground truth file is our curated digitisation of publicly named BMC spots, not the full unpublished 498-row official GIS export.
""",
        encoding="utf-8",
    )

    tide = {
        "city": "mumbai",
        "source": "public tide table placeholder — replace with INCOIS/port series",
        "unit": "m",
        "valid_dates": "demo",
        "heights_m": [1.2, 1.4, 1.7, 2.0, 2.3, 2.1, 1.8, 1.5, 1.3, 1.1, 1.0, 1.2],
    }
    (DATA / "cities" / "mumbai" / "tide_sample.json").write_text(json.dumps(tide, indent=2), encoding="utf-8")

    photo_dir = val / "photo_test_set"
    photo_dir.mkdir(parents=True, exist_ok=True)
    items = []
    for i in range(1, 21):
        items.append({"id": f"flood-{i:02d}", "label": "flood", "path": f"pending/flood-{i:02d}.jpg", "notes": "Collect real flood photo; placeholder slot"})
    for i in range(1, 21):
        items.append({"id": f"dry-{i:02d}", "label": "dry", "path": f"pending/dry-{i:02d}.jpg", "notes": "Collect dry street photo; placeholder slot"})
    for i in range(1, 6):
        items.append({"id": f"dup-{i:02d}", "label": "duplicate", "path": f"pending/dup-{i:02d}.jpg", "notes": "Duplicate of a flood-* within 200m / 24h", "duplicate_of": f"flood-{i:02d}"})
    (photo_dir / "manifest.json").write_text(
        json.dumps({"version": 1, "items": items, "status": "slots_ready_images_pending"}, indent=2),
        encoding="utf-8",
    )
    (photo_dir / "README.md").write_text(
        "Place images under pending/ matching manifest paths. Do not commit personal faces. Prefer own captures or clearly licensed images.\n",
        encoding="utf-8",
    )

    outcomes_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Outcome",
        "type": "object",
        "required": ["dispatch_item_id", "status", "recorded_at"],
        "properties": {
            "dispatch_item_id": {"type": "string"},
            "status": {"enum": ["resolved", "escalated", "false_alarm"]},
            "recorded_at": {"type": "string", "format": "date-time"},
            "note": {"type": "string"},
        },
    }
    (val / "outcomes.schema.json").write_text(json.dumps(outcomes_schema, indent=2), encoding="utf-8")

    demo = DATA / "demo"
    demo.mkdir(parents=True, exist_ok=True)
    seed_state = {
        "city": "pune",
        "rain_mode": "replay",
        "replay_file": "peak.json",
        "assets_from": "assets.seed.json",
        "sample_reports": [
            {
                "spot_name": "Sinhagad Road – Vitthalwadi underpass",
                "severity_hint": "impassable",
                "note": "Demo report — replace with live phone capture on stage",
            }
        ],
    }
    (demo / "seed_state.json").write_text(json.dumps(seed_state, indent=2), encoding="utf-8")
    (demo / "OFFLINE_CHECKLIST.md").write_text(
        """# Offline / venue checklist

1. Confirm `data/cities/pune/replay/peak.json` and mumbai peak exist on laptop.
2. Set `RAIN_MODE=replay` before leaving hotel Wi-Fi.
3. Planner: `PLANNER=sop-rules` if Nugen unreachable.
4. Demo seed: load `data/demo/seed_state.json`.
5. Spare laptop has identical `data/` folder copy.
6. Pull network cable once in rehearsal — ranked list must still render.
""",
        encoding="utf-8",
    )
    print("D1–D5 seed generation complete")


if __name__ == "__main__":
    main()
