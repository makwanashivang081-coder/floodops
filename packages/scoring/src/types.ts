export type Severity = "minor" | "moderate" | "impassable";
export type Action = "pump" | "desilt" | "barricade" | "monitor";

export type Breakdown = Record<string, number | string | boolean>;

export type ScoredValue<T> = {
  value: T;
  breakdown: Breakdown;
};

export type SpotInput = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isBlackspot: boolean;
  blackspotSince?: number;
  lowPointScore: number;
  rainNext3hMm: number;
  tideHeightM?: number;
  coastal?: boolean;
  verifiedReportCount: number;
  latestSeverity?: Severity;
};

export type ReportCredibilityInput = {
  hasPhoto: boolean;
  waterDetected: boolean;
  /** False when the photo is not a flood / pothole scene. Defaults to true. */
  sceneMatch?: boolean;
  distanceMeters: number;
  ageMinutes: number;
  duplicateHit: boolean;
  hasGps: boolean;
};

export type SeverityInput = {
  depthCue: "ankle" | "knee" | "vehicle" | "unknown";
  nearbyVerifiedReports: number;
  rainIntensityMm1h: number;
};

export type Asset = {
  id: string;
  kind: "pump" | "crew";
  name: string;
  available: boolean;
};

export type DispatchItem = {
  priority: number;
  spotId: string;
  spotName: string;
  action: Action;
  crewId: string | null;
  crewName: string | null;
  severity: Severity;
  risk: number;
  why: Breakdown;
  explanation: string;
  planner: "sop-rules" | "nugen";
};
