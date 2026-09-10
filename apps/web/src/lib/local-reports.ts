export type LocalCitizenReport = {
  id: string;
  city: string;
  spotId: string;
  spotName: string;
  note: string;
  credibility: number;
  severity: string;
  hasPhoto: boolean;
  waterDetected: boolean;
  waterScore: number;
  photoUrl: string | null;
  rankScore: number;
  createdAt: string;
};

const KEY = "floodops-accepted-reports";

export function loadLocalReports(city: string): LocalCitizenReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalCitizenReport[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && r.city === city && typeof r.id === "string");
  } catch {
    return [];
  }
}

export function rememberLocalReport(report: LocalCitizenReport): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const existing = raw ? (JSON.parse(raw) as LocalCitizenReport[]) : [];
    const list = Array.isArray(existing) ? existing : [];
    const next = [report, ...list.filter((r) => r.id !== report.id)].slice(0, 80);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function mergeReports<
  T extends { id: string; rankScore: number; createdAt: string; photoUrl?: string | null },
>(api: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of api) map.set(row.id, row);
  for (const row of local) {
    const prev = map.get(row.id);
    if (!prev) {
      map.set(row.id, row);
      continue;
    }
    const localPhoto = row.photoUrl?.startsWith("data:image/") ?? false;
    const apiPhoto = prev.photoUrl?.startsWith("data:image/") ?? false;
    map.set(row.id, localPhoto && !apiPhoto ? { ...prev, photoUrl: row.photoUrl } : prev);
  }
  return [...map.values()].sort(
    (a, b) => b.rankScore - a.rankScore || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}
