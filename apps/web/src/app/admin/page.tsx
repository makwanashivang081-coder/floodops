"use client";

import { AppHeader } from "@/components/app-header";
import {
  actionLabel,
  plannerLabel,
  rainBadgeLabel,
  severityLabel,
} from "@/lib/labels";
import { FALLBACK_CITIES, type CityOption } from "@/lib/cities";
import { loadLocalReports, mergeReports } from "@/lib/local-reports";
import { RAIN_CONTINUING_MM_3H } from "@floodops/scoring";
import { useCallback, useEffect, useMemo, useState } from "react";

type DispatchItem = {
  priority: number;
  spotId: string;
  spotName: string;
  action: string;
  crewName: string | null;
  severity: string;
  risk: number;
  why: Record<string, number | string | boolean>;
  explanation: string;
};

type CitizenReport = {
  id: string;
  city?: string;
  spotId: string;
  spotName: string;
  note: string;
  credibility: number;
  severity: string;
  hasPhoto: boolean;
  waterDetected: boolean;
  waterScore: number;
  photoClass?: string;
  photoClassConfidence?: number;
  photoUrl: string | null;
  rankScore: number;
  createdAt: string;
};

type Dashboard = {
  city: { slug: string; name: string };
  rain: { label: string; precipMm3h: number };
  assets: Array<{ id: string; name: string; kind: string; available: boolean }>;
  reports: CitizenReport[];
  spots: Array<{ id: string; name: string }>;
  plan: {
    planner: string;
    nextAtRisk: Array<{ spotId: string; name?: string; reason: string }>;
    items: DispatchItem[];
  };
};

const DISPATCH_PAGE = 10;

function cityFromUrl(): string {
  if (typeof window === "undefined") return "pune";
  return new URLSearchParams(window.location.search).get("city") ?? "pune";
}

export default function AdminPage() {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [city, setCity] = useState("pune");
  const [rain, setRain] = useState<"replay" | "live">("replay");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [dispatchLimit, setDispatchLimit] = useState(DISPATCH_PAGE);

  useEffect(() => {
    const requested = cityFromUrl();
    void fetch("/api/cities")
      .then((res) => res.json() as Promise<{ cities?: CityOption[] }>)
      .then((json) => {
        const list = json.cities ?? [];
        setCities(list);
        const match = list.some((c) => c.slug === requested) ? requested : (list[0]?.slug ?? "pune");
        setCity(match);
      })
      .catch(() => {
        setCities([
          { slug: "pune", name: "Pune", centroid: { lat: 18.5204, lon: 73.8567 } },
          { slug: "mumbai", name: "Mumbai", centroid: { lat: 19.076, lon: 72.8777 } },
        ]);
        setCity(requested === "mumbai" ? "mumbai" : "pune");
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setActiveId(null);
    setActiveReportId(null);
    setPhotoBroken(false);
    try {
      const res = await fetch(`/api/cities/${city}/dashboard?rain=${rain}`);
      let json: Dashboard & { error?: string } = {} as Dashboard & {
        error?: string;
      };
      try {
        json = (await res.json()) as Dashboard & { error?: string };
      } catch {
        throw new Error(
          res.ok
            ? "Could not parse dashboard response."
            : `Could not load dashboard (HTTP ${res.status}).`,
        );
      }
      if (!res.ok) throw new Error(json.error ?? "Could not load dashboard");
      const reports = mergeReports(json.reports, loadLocalReports(city));
      setData({ ...json, reports });
      setDispatchLimit(DISPATCH_PAGE);
      setActiveId(json.plan.items[0]?.spotId ?? null);
      setActiveReportId(reports[0]?.id ?? null);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [city, rain]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankedReports = useMemo(() => {
    return (data?.reports ?? [])
      .slice()
      .sort((a, b) => b.rankScore - a.rankScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data]);

  const nextAtRiskRows = useMemo(() => {
    const spots = data?.spots ?? [];
    return (data?.plan.nextAtRisk ?? []).map((row) => ({
      ...row,
      name: row.name ?? spots.find((s) => s.id === row.spotId)?.name ?? row.spotId,
    }));
  }, [data]);

  async function toggleAsset(id: string, available: boolean) {
    setTogglingId(id);
    setError(null);
    try {
      const assetRes = await fetch(`/api/cities/${city}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, available: !available }),
      });
      const assetJson = (await assetRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!assetRes.ok) {
        throw new Error(assetJson.error ?? "Could not update asset status");
      }

      const dispatchRes = await fetch(`/api/cities/${city}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rain }),
      });
      const dispatchJson = (await dispatchRes.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!dispatchRes.ok) {
        throw new Error(
          dispatchJson.error ?? "Could not rebuild dispatch after asset change",
        );
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not toggle asset");
    } finally {
      setTogglingId(null);
    }
  }

  const busy = loading || togglingId !== null;

  return (
    <main className="shell">
      <AppHeader active="admin" />

      <div className="page-pad">
        <p className="section-label">New here? Read these four boxes, then try the list.</p>
        <section className="walkthrough">
          <article>
            <h3>Demo storm</h3>
            <p>
              A saved heavy-rain day so you can try the system even when it is
              not raining. It is not today’s weather. Switch the dropdown to
              Today’s weather if you want the live forecast.
            </p>
          </article>
          <article>
            <h3>Work list</h3>
            <p>
              Numbered list of flood spots. #1 is first. Tap a row to see what
              to send and why. The city follows this order, not whoever shouted
              last.
            </p>
          </article>
          <article>
            <h3>Action playbook</h3>
            <p>
              The city’s usual flood-response steps. Judges may call this an
              SOP. Example: deep water on a known flood street → send a pump.
              Other steps: clear a drain, close a road, or keep watch.
            </p>
          </article>
          <article>
            <h3>Cities</h3>
            <p>
              Five cities with the easiest public flood-spot lists: Mumbai,
              Bengaluru, Chennai, Pune, Kolkata. Switch the dropdown to try each.
            </p>
          </article>
        </section>

        <div className="toolbar">
          <select
            value={city}
            onChange={(e) => {
              const next = e.target.value;
              setCity(next);
              const url = new URL(window.location.href);
              url.searchParams.set("city", next);
              window.history.replaceState(null, "", url);
            }}
            aria-label="City"
            disabled={busy}
          >
            {(cities.length > 0 ? cities : FALLBACK_CITIES).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={rain}
            onChange={(e) => setRain(e.target.value as "replay" | "live")}
            aria-label="Rain mode"
            disabled={busy}
          >
            <option value="replay">Demo storm</option>
            <option value="live">Today’s weather</option>
          </select>
          <button
            className="btn"
            type="button"
            onClick={() => void load()}
            disabled={busy}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {data ? (
            <span className={`badge ${data.rain.label === "REPLAY" ? "replay" : "live"}`}>
              {rainBadgeLabel(data.rain.label)} · {Number(data.rain.precipMm3h).toFixed(1)} mm / 3h
            </span>
          ) : null}
          {data ? <span className="badge">{plannerLabel(data.plan.planner)}</span> : null}
        </div>

        {error ? (
          <p className="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </p>
        ) : null}

        <div className="layout">
          <section className="pane">
            <h2 className="pane-title">Work list</h2>
            <p className="pane-sub">Who to send first. Tap a row to see why.</p>
            {loading ? <p className="meta">Loading…</p> : null}
            {!loading && data && data.plan.items.length === 0 ? (
              <p className="meta">No work items for this city / rain mode.</p>
            ) : null}
            <div className="dispatch-list">
              {data?.plan.items.slice(0, dispatchLimit).map((item) => {
                const open = item.spotId === activeId;
                return (
                  <div key={item.spotId} className="dispatch-block">
                    <button
                      type="button"
                      className="dispatch-item"
                      data-active={open}
                      onClick={() => setActiveId(open ? null : item.spotId)}
                    >
                      <div className="priority">{item.priority}</div>
                      <div>
                        <div className="spot-name">{item.spotName}</div>
                        <div className="meta">
                          {actionLabel(item.action)}
                          {item.crewName ? ` · ${item.crewName}` : " · no free unit"} ·
                          risk {item.risk.toFixed(2)}
                        </div>
                      </div>
                      <span className={`sev ${item.severity}`}>{severityLabel(item.severity)}</span>
                    </button>
                    {open ? (
                      <div className="detail-panel">
                        <h3>Why this row</h3>
                        <p>{item.explanation}</p>
                        <dl>
                          {Object.entries(item.why).map(([k, v]) => (
                            <div key={k} style={{ display: "contents" }}>
                              <dt>{k}</dt>
                              <dd>{String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {data && data.plan.items.length > dispatchLimit ? (
              <button
                className="btn wide"
                type="button"
                style={{ marginTop: "0.65rem" }}
                onClick={() => setDispatchLimit((n) => n + DISPATCH_PAGE)}
              >
                Show {Math.min(DISPATCH_PAGE, data.plan.items.length - dispatchLimit)} more
              </button>
            ) : null}

            <h3 className="pane-heading">May flood next</h3>
            <p className="pane-sub">
              Nearby low streets if this rain keeps falling — not a weather forecast.
            </p>
            {!loading && data && nextAtRiskRows.length === 0 ? (
              <p className="meta">
                {Number(data.rain.precipMm3h) < RAIN_CONTINUING_MM_3H
                  ? `None flagged — rain is only ${Number(data.rain.precipMm3h).toFixed(1)} mm / 3h. Switch to Demo storm to see the next streets.`
                  : "None flagged near the current top spots."}
              </p>
            ) : null}
            <div className="dispatch-list">
              {nextAtRiskRows.map((row) => (
                <div key={row.spotId} className="dispatch-item static">
                  <div className="priority">→</div>
                  <div>
                    <div className="spot-name">{row.name}</div>
                    <div className="meta">{row.reason}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pane">
            <h2 className="pane-title">Citizen reports</h2>
            <p className="pane-sub">Every accepted report stays here. A rejected photo never appears.</p>
            {!loading && rankedReports.length === 0 ? (
              <p className="meta">None yet. Anyone can send one from Report flood.</p>
            ) : (
              <div className="dispatch-list">
                {rankedReports.map((r) => {
                  const open = r.id === activeReportId;
                  return (
                    <div key={r.id} className="dispatch-block">
                      <button
                        type="button"
                        className="dispatch-item"
                        data-active={open}
                        onClick={() => {
                          if (open) {
                            setActiveReportId(null);
                            return;
                          }
                          setActiveReportId(r.id);
                          setActiveId(r.spotId);
                          setPhotoBroken(false);
                        }}
                      >
                        <div className="priority">#{r.rank}</div>
                        <div>
                          <div className="spot-name">{r.spotName}</div>
                          <div className="meta">
                            trust {r.credibility.toFixed(2)} ·{" "}
                            {r.hasPhoto ? "has photo" : "no photo"}
                          </div>
                        </div>
                        <span className={`sev ${r.severity}`}>{severityLabel(r.severity)}</span>
                      </button>
                      {open ? (
                        <div className="detail-panel">
                          <h3>What they sent</h3>
                          <p>
                            {r.note || "No note"} ·{" "}
                            {new Date(r.createdAt).toLocaleString()}
                          </p>
                          {r.photoUrl && !photoBroken ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.photoUrl}
                              alt="Citizen evidence"
                              className="soft-img"
                              onError={() => setPhotoBroken(true)}
                              style={{ marginBottom: "0.65rem" }}
                            />
                          ) : r.photoUrl && photoBroken ? (
                            <p className="meta">Photo failed to load.</p>
                          ) : (
                            <p className="meta">No photo — this report stays weak.</p>
                          )}
                          <dl>
                            <dt>trust score</dt>
                            <dd>{r.credibility.toFixed(2)}</dd>
                            <dt>water in photo</dt>
                            <dd>
                              {r.waterDetected
                                ? `yes (${(r.waterScore * 100).toFixed(0)}%)`
                                : "no"}
                            </dd>
                            <dt>photo scene</dt>
                            <dd>
                              {r.photoClass && r.photoClass !== "unknown"
                                ? `${r.photoClass.replace(/_/g, " ")}${
                                    r.photoClassConfidence
                                      ? ` (${Math.round(r.photoClassConfidence * 100)}%)`
                                      : ""
                                  }`
                                : "not classified"}
                            </dd>
                          </dl>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <h3 className="pane-heading">Crews and pumps</h3>
            <p className="pane-sub">
              If a pump is already out, mark it busy and the list picks another.
            </p>
            <div className="assets">
              {(data?.assets ?? []).length === 0 && !loading ? (
                <p className="meta">No assets loaded for this city.</p>
              ) : null}
              {data?.assets.map((a) => (
                <div key={a.id} className="asset-row">
                  <div>
                    <div>{a.name}</div>
                    <div className="meta">
                      {a.kind} · {a.available ? "available" : "busy"}
                    </div>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleAsset(a.id, a.available)}
                  >
                    {togglingId === a.id
                      ? "Updating…"
                      : a.available
                        ? "Mark busy"
                        : "Mark available"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
