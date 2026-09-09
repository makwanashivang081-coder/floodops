import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  credibility,
  nextAtRisk,
  planWithSopRules,
  risk,
  severity,
  type Action,
  type Asset,
  type DispatchItem,
  type Severity,
  type SpotInput,
} from "@floodops/scoring";
import { dataDir, uploadsDir } from "./paths";
import { analyzePhotoCues } from "./water-detect";

const DATA = dataDir();
const UPLOADS = uploadsDir();

export type CityMeta = {
  slug: string;
  name: string;
  coastal: boolean;
  centroid: { lat: number; lon: number };
  demo_role: string;
};

export type SpotRecord = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isBlackspot: boolean;
  blackspotSince?: number;
  lowPointScore: number;
  sourceUrl?: string;
  wardHint?: string;
};

export type StoredReport = {
  id: string;
  city: string;
  spotId: string;
  spotName: string;
  note: string;
  lat: number;
  lon: number;
  photoName: string;
  photoUrl: string | null;
  credibility: number;
  credibilityBreakdown: Record<string, number | string | boolean>;
  severity: Severity;
  severityBreakdown: Record<string, number | string | boolean>;
  createdAt: string;
  waterDetected: boolean;
  waterScore: number;
  hasPhoto: boolean;
  rankScore: number;
};

type RuntimeStore = {
  reports: StoredReport[];
  assets: Record<string, Asset[]>;
  lastPlan: Record<string, DispatchItem[]>;
};

declare global {
  var __floodopsStore: RuntimeStore | undefined;
}

function store(): RuntimeStore {
  if (!globalThis.__floodopsStore) {
    globalThis.__floodopsStore = { reports: [], assets: {}, lastPlan: {} };
  }
  return globalThis.__floodopsStore;
}

async function readText(rel: string): Promise<string> {
  return fs.readFile(path.join(DATA, rel), "utf8");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

export async function listCities(): Promise<CityMeta[]> {
  return JSON.parse(await readText("cities.json")) as CityMeta[];
}

export async function getCity(slug: string): Promise<CityMeta> {
  const cities = await listCities();
  const city = cities.find((c) => c.slug === slug);
  if (!city) throw new Error(`Unknown city: ${slug}`);
  return city;
}

export async function loadSpots(city: string): Promise<SpotRecord[]> {
  await getCity(city);
  const black = parseCsv(await readText(`cities/${city}/blackspots.csv`));
  let lowMap = new Map<string, number>();
  try {
    const low = parseCsv(await readText(`cities/${city}/low_point_scores.csv`));
    lowMap = new Map(low.map((r) => [r.spot_name ?? "", Number(r.low_point_score)]));
  } catch {
    /* optional */
  }

  return black.map((row, i) => {
    const name = row.name ?? `Spot ${i + 1}`;
    const id = `${city}-${createHash("sha1").update(name).digest("hex").slice(0, 10)}`;
    return {
      id,
      name,
      lat: Number(row.lat),
      lon: Number(row.lon),
      isBlackspot: true,
      blackspotSince: row.since_year ? Number(row.since_year) : undefined,
      lowPointScore: lowMap.get(name) ?? 0.7,
      sourceUrl: row.source_url,
      wardHint: row.ward_hint,
    };
  });
}

export async function loadRain(city: string, mode: "live" | "replay" = "replay") {
  if (mode === "live") {
    const cityMeta = await getCity(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(cityMeta.centroid.lat));
    url.searchParams.set("longitude", String(cityMeta.centroid.lon));
    url.searchParams.set(
      "hourly",
      "precipitation,precipitation_probability,weathercode,temperature_2m",
    );
    url.searchParams.set("current", "precipitation,weathercode,temperature_2m");
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("timezone", "Asia/Kolkata");
    const res = await fetch(url.toString(), { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Open-Meteo failed: ${res.status}`);
    const json = (await res.json()) as {
      current?: {
        time?: string;
        precipitation?: number;
        weathercode?: number;
        temperature_2m?: number;
      };
      hourly?: {
        time?: string[];
        precipitation?: number[];
        precipitation_probability?: number[];
        weathercode?: number[];
        temperature_2m?: number[];
      };
    };
    const precip = json.hourly?.precipitation ?? [];
    const probs = json.hourly?.precipitation_probability ?? [];
    const codes = json.hourly?.weathercode ?? [];
    const temps = json.hourly?.temperature_2m ?? [];
    const times = json.hourly?.time ?? [];
    const nowKey = json.current?.time ?? "";
    let start = 0;
    if (nowKey) {
      const idx = times.findIndex((t) => t >= nowKey);
      start = idx >= 0 ? idx : 0;
    }
    const window = precip.slice(start, start + 12);
    const next3 = precip.slice(start, start + 3).reduce((a, b) => a + (b ?? 0), 0);
    const next12 = window.reduce((a, b) => a + (b ?? 0), 0);
    const hours = times.slice(start, start + 24).map((t, i) => {
      const hi = start + i;
      return {
        time: t,
        precip_mm: precip[hi] ?? 0,
        precip_probability: probs[hi] ?? null,
        weathercode: codes[hi] ?? null,
        temp_c: temps[hi] ?? null,
      };
    });
    return {
      mode: "live" as const,
      label: "LIVE",
      source: "Open-Meteo",
      fetchedAt: new Date().toISOString(),
      precipMm3h: Number(next3.toFixed(2)),
      precipMm12h: Number(next12.toFixed(2)),
      current: {
        time: json.current?.time ?? times[start] ?? null,
        precip_mm: json.current?.precipitation ?? 0,
        weathercode: json.current?.weathercode ?? null,
        temp_c: json.current?.temperature_2m ?? null,
      },
      hours,
    };
  }

  const raw = JSON.parse(
    await readText(`cities/${city}/replay/peak.json`),
  ) as {
    label: string;
    precip_mm_3h_peak: number;
    hours: Array<{ hour: number; precip_mm: number }>;
  };
  return {
    mode: "replay" as const,
    label: "REPLAY",
    source: "local peak.json",
    fetchedAt: new Date().toISOString(),
    precipMm3h: Number(raw.precip_mm_3h_peak.toFixed(2)),
    precipMm12h: Number(
      raw.hours
        .slice(0, 12)
        .reduce((a, h) => a + (h.precip_mm ?? 0), 0)
        .toFixed(2),
    ),
    current: {
      time: null as string | null,
      precip_mm: Number((raw.precip_mm_3h_peak / 3).toFixed(2)),
      weathercode: null as number | null,
      temp_c: null as number | null,
    },
    hours: raw.hours.map((h) => ({
      time: `storm-hour-${h.hour}`,
      precip_mm: h.precip_mm,
      precip_probability: null as number | null,
      weathercode: null as number | null,
      temp_c: null as number | null,
    })),
  };
}

export async function loadAssets(city: string): Promise<Asset[]> {
  const s = store();
  if (!s.assets[city]) {
    const seeded = JSON.parse(
      await readText(`cities/${city}/assets.seed.json`),
    ) as Array<Asset & { depot_lat?: number; depot_lon?: number }>;
    s.assets[city] = seeded.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      available: a.available,
    }));
  }
  return s.assets[city]!;
}

export async function updateAssetAvailability(
  city: string,
  assetId: string,
  available: boolean,
): Promise<Asset[]> {
  const assets = await loadAssets(city);
  const next = assets.map((a) => (a.id === assetId ? { ...a, available } : a));
  store().assets[city] = next;
  return next;
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestSpot(spots: SpotRecord[], lat: number, lon: number): SpotRecord {
  let best = spots[0]!;
  let bestD = Infinity;
  for (const s of spots) {
    const d = haversineM(lat, lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export async function listReports(city: string): Promise<StoredReport[]> {
  return store()
    .reports.filter((r) => r.city === city)
    .slice()
    .sort((a, b) => b.rankScore - a.rankScore || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function severityWeight(sev: Severity): number {
  if (sev === "impassable") return 1;
  if (sev === "moderate") return 0.65;
  return 0.35;
}

function rankReport(credibilityScore: number, sev: Severity, hasPhoto: boolean): number {
  return Number(
    (credibilityScore * 0.55 + severityWeight(sev) * 0.35 + (hasPhoto ? 0.1 : 0)).toFixed(3),
  );
}

function depthFromDamage(
  level: 1 | 2 | 3 | 4 | 5,
  waterDetected: boolean,
): "ankle" | "knee" | "vehicle" | "unknown" {
  if (level >= 5 || (level >= 4 && waterDetected)) return "vehicle";
  if (level >= 3) return "knee";
  if (level >= 2) return "ankle";
  return "unknown";
}

export async function submitReport(input: {
  city: string;
  lat: number;
  lon: number;
  note: string;
  waterDetected: boolean;
  depthCue: "ankle" | "knee" | "vehicle" | "unknown";
  photoBase64?: string;
  rainMode?: "live" | "replay";
}): Promise<StoredReport> {
  const spots = await loadSpots(input.city);
  let rain;
  try {
    rain = await loadRain(input.city, input.rainMode ?? "live");
  } catch {
    rain = await loadRain(input.city, "replay");
  }
  const spot = nearestSpot(spots, input.lat, input.lon);
  const distance = haversineM(input.lat, input.lon, spot.lat, spot.lon);

  const recent = store().reports.filter(
    (r) =>
      r.city === input.city &&
      Date.now() - Date.parse(r.createdAt) < 24 * 3600 * 1000 &&
      haversineM(r.lat, r.lon, input.lat, input.lon) < 200,
  );
  const duplicateHit = recent.length > 0;

  const hasPhoto = Boolean(input.photoBase64 && input.photoBase64.length > 32);
  let waterDetected = false;
  let waterScore = 0;
  let damageScore = 0;
  let damageLevel: 1 | 2 | 3 | 4 | 5 = 1;
  let waterReason = "No photo attached";
  let photoName = "";
  const id = randomUUID();

  if (hasPhoto && input.photoBase64) {
    await fs.mkdir(UPLOADS, { recursive: true });
    const mimeMatch = /^data:(image\/[\w.+-]+);base64,/i.exec(input.photoBase64);
    const mime = (mimeMatch?.[1] ?? "image/jpeg").toLowerCase();
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : "jpg";
    photoName = `${id}.${ext}`;
    const buf = Buffer.from(
      input.photoBase64.replace(/^data:image\/[\w.+-]+;base64,/i, ""),
      "base64",
    );
    await fs.writeFile(path.join(UPLOADS, photoName), buf);
    const detected = await analyzePhotoCues(buf);
    waterScore = detected.waterScore;
    damageScore = detected.damageScore;
    damageLevel = detected.damageLevel;
    waterReason = detected.reason;
    // Photo analysis is primary; checkbox can only boost when photo already looks wet.
    waterDetected = detected.waterDetected || (input.waterDetected && detected.waterScore >= 0.12);
  }

  const cred = credibility({
    hasPhoto,
    waterDetected,
    distanceMeters: distance,
    ageMinutes: 5,
    duplicateHit,
    hasGps: true,
  });
  cred.breakdown.waterScore = waterScore;
  cred.breakdown.damageScore = damageScore;
  cred.breakdown.damageLevel = damageLevel;
  cred.breakdown.waterReason = waterReason;
  cred.breakdown.nearestSpot = spot.name;
  cred.breakdown.rainMode = rain.mode;
  cred.breakdown.precipMm3h = rain.precipMm3h;

  // Without a photo, do not trust a harsh depth claim alone.
  // With a photo, unknown depth falls back to image damage level.
  let depthCue: "ankle" | "knee" | "vehicle" | "unknown" = hasPhoto
    ? input.depthCue
    : "unknown";
  if (hasPhoto && (depthCue === "unknown" || input.depthCue === "unknown")) {
    depthCue = depthFromDamage(damageLevel, waterDetected);
  }
  const sev = severity({
    depthCue,
    nearbyVerifiedReports:
      store().reports.filter(
        (r) => r.spotId === spot.id && r.credibility >= 0.55,
      ).length + (cred.value >= 0.55 ? 1 : 0),
    rainIntensityMm1h: rain.precipMm3h / 3,
  });
  sev.breakdown.damageLevel = damageLevel;
  sev.breakdown.photoDepthCue = depthCue;

  const report: StoredReport = {
    id,
    city: input.city,
    spotId: spot.id,
    spotName: spot.name,
    note: input.note,
    lat: input.lat,
    lon: input.lon,
    photoName,
    photoUrl: photoName ? `/api/uploads/${photoName}` : null,
    credibility: cred.value,
    credibilityBreakdown: cred.breakdown,
    severity: sev.value,
    severityBreakdown: sev.breakdown,
    createdAt: new Date().toISOString(),
    waterDetected,
    waterScore,
    hasPhoto,
    rankScore: rankReport(cred.value, sev.value, hasPhoto),
  };
  store().reports.unshift(report);
  await generateDispatch(input.city, rain.mode);
  return report;
}

function toSpotInputs(
  city: CityMeta,
  spots: SpotRecord[],
  rainMm3h: number,
  reports: StoredReport[],
): SpotInput[] {
  return spots.map((s) => {
    const verified = reports.filter(
      (r) => r.spotId === s.id && r.credibility >= 0.55,
    );
    const latest = verified[0];
    return {
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      isBlackspot: s.isBlackspot,
      blackspotSince: s.blackspotSince,
      lowPointScore: s.lowPointScore,
      rainNext3hMm: rainMm3h,
      coastal: city.coastal,
      tideHeightM: city.coastal ? 2.1 : undefined,
      verifiedReportCount: verified.length,
      latestSeverity: latest?.severity,
    };
  });
}

export async function generateDispatch(
  citySlug: string,
  rainMode: "live" | "replay" = "replay",
): Promise<{
  city: string;
  rainMode: string;
  rainLabel: string;
  precipMm3h: number;
  nextAtRisk: Array<{ spotId: string; reason: string }>;
  items: DispatchItem[];
  planner: "sop-rules";
}> {
  const city = await getCity(citySlug);
  const spots = await loadSpots(citySlug);
  const rain = await loadRain(citySlug, rainMode);
  const reports = await listReports(citySlug);
  const assets = await loadAssets(citySlug);
  const inputs = toSpotInputs(city, spots, rain.precipMm3h, reports);
  const items = planWithSopRules(inputs, assets);
  const nar = nextAtRisk(inputs, rain.precipMm3h >= 8);
  store().lastPlan[citySlug] = items;
  return {
    city: citySlug,
    rainMode: rain.mode,
    rainLabel: rain.label,
    precipMm3h: rain.precipMm3h,
    nextAtRisk: nar,
    items,
    planner: "sop-rules",
  };
}

export async function getDashboard(citySlug: string, rainMode: "live" | "replay") {
  const city = await getCity(citySlug);
  const spots = await loadSpots(citySlug);
  const rain = await loadRain(citySlug, rainMode);
  const reports = await listReports(citySlug);
  const assets = await loadAssets(citySlug);
  const plan = await generateDispatch(citySlug, rainMode);
  const scored = toSpotInputs(city, spots, rain.precipMm3h, reports).map((s) => ({
    ...s,
    risk: risk(s),
  }));

  return {
    city,
    rain,
    spots: scored,
    reports,
    assets,
    plan,
  };
}

export type { Action, DispatchItem };
