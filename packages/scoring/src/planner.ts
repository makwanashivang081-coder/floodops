import type { Action, Asset, DispatchItem, Severity, SpotInput } from "./types";
import { risk } from "./risk";

function pickSeverity(spot: SpotInput): Severity {
  if (spot.latestSeverity) return spot.latestSeverity;
  if (spot.verifiedReportCount >= 3 || spot.rainNext3hMm >= 40) return "impassable";
  if (spot.verifiedReportCount >= 1 || spot.rainNext3hMm >= 15) return "moderate";
  return "minor";
}

function pickAction(sev: Severity, spot: SpotInput): Action {
  if (sev === "impassable") return spot.rainNext3hMm >= 25 ? "pump" : "barricade";
  if (sev === "moderate") return spot.isBlackspot ? "desilt" : "pump";
  return "monitor";
}

function assignAsset(action: Action, assets: Asset[]): Asset | null {
  const preferKind = action === "pump" || action === "desilt" ? "pump" : "crew";
  const primary = assets.find((a) => a.available && a.kind === preferKind);
  if (primary) return primary;
  return assets.find((a) => a.available) ?? null;
}

/** Deterministic planner — same schema as future Nugen planner. */
export function planWithSopRules(
  spots: SpotInput[],
  assets: Asset[],
): DispatchItem[] {
  const pool = assets.map((a) => ({ ...a }));
  const ranked = spots
    .map((spot) => {
      const r = risk(spot);
      const sev = pickSeverity(spot);
      return { spot, riskValue: r.value, why: r.breakdown, sev };
    })
    .sort((a, b) => b.riskValue - a.riskValue);

  const items: DispatchItem[] = [];
  ranked.forEach((row, index) => {
    const action = pickAction(row.sev, row.spot);
    const asset = assignAsset(action, pool);
    if (asset) {
      const idx = pool.findIndex((a) => a.id === asset.id);
      if (idx >= 0 && (action === "pump" || action === "barricade")) {
        pool[idx] = { ...asset, available: false };
      }
    }

    const explanation = [
      `${row.spot.name}: severity ${row.sev}, risk ${row.riskValue}.`,
      `Rain next 3h ${row.spot.rainNext3hMm} mm; terrain ${row.spot.lowPointScore}.`,
      row.spot.isBlackspot
        ? `Chronic blackspot since ${row.spot.blackspotSince ?? "unknown"}.`
        : "Not a listed blackspot.",
      `${row.spot.verifiedReportCount} verified report(s).`,
      `Action ${action}${asset ? ` → ${asset.name}` : " → no free unit"}.`,
    ].join(" ");

    items.push({
      priority: index + 1,
      spotId: row.spot.id,
      spotName: row.spot.name,
      action,
      crewId: asset?.id ?? null,
      crewName: asset?.name ?? null,
      severity: row.sev,
      risk: row.riskValue,
      why: {
        ...row.why,
        severity: row.sev,
        action,
        verified_reports: row.spot.verifiedReportCount,
      },
      explanation,
      planner: "sop-rules",
    });
  });

  return items;
}
