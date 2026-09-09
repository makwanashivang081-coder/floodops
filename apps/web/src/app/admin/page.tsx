"use client";

import Link from "next/link";
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
  planner: string;
};

type CitizenReport = {
  id: string;
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

type Dashboard = {
  city: { slug: string; name: string; coastal: boolean };
  rain: {
    mode: string;
    label: string;
    precipMm3h: number;
    precipMm12h?: number;
    source?: string;
    fetchedAt?: string;
    current?: {
      time: string | null;
      precip_mm: number;
      weathercode: number | null;
      temp_c: number | null;
    };
    hours?: Array<{
      time: string;
      precip_mm: number;
      precip_probability: number | null;
      temp_c: number | null;
    }>;
  };
  assets: Array<{ id: string; name: string; kind: string; available: boolean }>;
  reports: CitizenReport[];
  spots: Array<{ id: string; name: string; risk: { value: number } }>;
  plan: {
    rainLabel: string;
    precipMm3h: number;
    planner: string;
    nextAtRisk: Array<{ spotId: string; reason: string }>;
    items: DispatchItem[];
  };
};

function weatherLabel(code: number | null | undefined): string {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code <= 3) return "Clouds";
  if (code <= 48) return "Fog/haze";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow/ice";
  if (code <= 82) return "Showers";
  if (code <= 99) return "Thunder";
  return `Code ${code}`;
}

export default function AdminPage() {
  const [city, setCity] = useState("pune");
  const [rain, setRain] = useState<"replay" | "live">("replay");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    setActiveId(null);
    setActiveReportId(null);
    setPhotoBroken(false);
    try {
      const res = await fetch(`/api/cities/${city}/dashboard?rain=${rain}`);
      let json: Dashboard & { error?: string } = {} as Dashboard & { error?: string };
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
      setData(json);
      setActiveId(json.plan.items[0]?.spotId ?? null);
      setActiveReportId(json.reports[0]?.id ?? null);
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

  const active = useMemo(
    () => data?.plan.items.find((i) => i.spotId === activeId) ?? null,
    [data, activeId],
  );

  const rankedReports = useMemo(() => {
    const list = data?.reports ?? [];
    return list
      .slice()
      .sort((a, b) => b.rankScore - a.rankScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data]);

  const nextAtRiskRows = useMemo(() => {
    const rows = data?.plan.nextAtRisk ?? [];
    const spots = data?.spots ?? [];
    return rows.map((row) => ({
      ...row,
      name: spots.find((s) => s.id === row.spotId)?.name ?? row.spotId,
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
        throw new Error(dispatchJson.error ?? "Could not rebuild dispatch after asset change");
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not toggle asset");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Flood<span>Ops</span>
        </div>
        <nav className="nav-links">
          <Link href="/admin" data-active="true">
            Operations
          </Link>
          <Link href="/report">Citizen report</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>

      <div className="page-pad">
        <div className="toolbar">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="City"
            disabled={loading || togglingId !== null}
          >
            <option value="pune">Pune</option>
            <option value="mumbai">Mumbai</option>
          </select>
          <select
            value={rain}
            onChange={(e) => setRain(e.target.value as "replay" | "live")}
            aria-label="Rain mode"
            disabled={loading || togglingId !== null}
          >
            <option value="replay">REPLAY · peak storm (demo)</option>
            <option value="live">LIVE · Open-Meteo</option>
          </select>
          <button
            className="btn"
            type="button"
            onClick={() => void load()}
            disabled={loading || togglingId !== null}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {data ? (
            <span className={`badge ${data.rain.label === "REPLAY" ? "replay" : "live"}`}>
              {data.rain.label} · {Number(data.rain.precipMm3h).toFixed(1)} mm / 3h
            </span>
          ) : null}
          {data ? <span className="badge">{data.plan.planner}</span> : null}
          {data ? <span className="badge">{data.reports.length} reports</span> : null}
        </div>

        {error ? <p className="alert" style={{ marginBottom: "1rem" }}>{error}</p> : null}

        {data?.rain ? (
          <section className="pane" style={{ marginBottom: "1rem" }}>
            <p className="section-label">Rain input</p>
            {data.rain.label === "LIVE" ? (
              <>
                <h2 className="pane-title">Live rain forecast · {data.city.name}</h2>
                <p className="pane-sub">
                  Open-Meteo · fetched{" "}
                  {data.rain.fetchedAt
                    ? new Date(data.rain.fetchedAt).toLocaleString()
                    : "n/a"}
                  . Updates on refresh.
                </p>
                <div className="map-grid">
                  <div className="spot-chip">
                    <strong>Next 3h</strong>
                    {Number(data.rain.precipMm3h).toFixed(1)} mm
                  </div>
                  <div className="spot-chip">
                    <strong>Next 12h</strong>
                    {data.rain.precipMm12h != null
                      ? `${Number(data.rain.precipMm12h).toFixed(1)} mm`
                      : "n/a"}
                  </div>
                  <div className="spot-chip">
                    <strong>Current</strong>
                    {weatherLabel(data.rain.current?.weathercode)}
                    {data.rain.current?.temp_c != null
                      ? ` · ${Number(data.rain.current.temp_c).toFixed(1)}°C`
                      : ""}
                    {data.rain.current?.precip_mm != null
                      ? ` · ${Number(data.rain.current.precip_mm).toFixed(1)} mm`
                      : ""}
                  </div>
                </div>
                {data.rain.hours && data.rain.hours.length > 0 ? (
                  <>
                    <h3 style={{ marginTop: "1rem", marginBottom: "0.45rem", fontSize: "0.98rem" }}>
                      Hourly forecast
                    </h3>
                    <div className="rain-hours">
                      {data.rain.hours.slice(0, 8).map((h) => (
                        <div key={h.time} className="asset-row">
                          <div>
                            <div>{h.time.replace("T", " ")}</div>
                            <div className="meta">
                              {h.temp_c != null ? `${Number(h.temp_c).toFixed(1)}°C` : ""}
                              {h.temp_c != null && h.precip_probability != null ? " · " : ""}
                              {h.precip_probability != null
                                ? `${h.precip_probability}% chance`
                                : ""}
                            </div>
                          </div>
                          <strong>{Number(h.precip_mm).toFixed(1)} mm</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <h2 className="pane-title">Replay storm scenario · {data.city.name}</h2>
                <p className="pane-sub">
                  Curated peak-monsoon rainfall for demonstrations. Switch to LIVE for the real
                  forecast.
                </p>
                <div className="map-grid">
                  <div className="spot-chip">
                    <strong>Peak 3h</strong>
                    {Number(data.rain.precipMm3h).toFixed(1)} mm
                  </div>
                  <div className="spot-chip">
                    <strong>First 12h</strong>
                    {data.rain.precipMm12h != null
                      ? `${Number(data.rain.precipMm12h).toFixed(1)} mm`
                      : "n/a"}
                  </div>
                  <div className="spot-chip">
                    <strong>Type</strong>
                    Heavy monsoon replay
                  </div>
                </div>
                {data.rain.hours && data.rain.hours.length > 0 ? (
                  <>
                    <h3 style={{ marginTop: "1rem", marginBottom: "0.45rem", fontSize: "0.98rem" }}>
                      Hourly rainfall (scenario)
                    </h3>
                    <p className="meta" style={{ marginBottom: "0.5rem" }}>
                      Replay includes rainfall only — no live temperature fields.
                    </p>
                    <div className="rain-hours">
                      {data.rain.hours.slice(0, 8).map((h, i) => (
                        <div key={h.time} className="asset-row">
                          <div>
                            <div>Hour {i}</div>
                            <div className="meta">+{i}h into peak scenario</div>
                          </div>
                          <strong>{Number(h.precip_mm).toFixed(1)} mm</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <p className="section-label" style={{ marginBottom: "0.5rem" }}>
          Risk and dispatch
        </p>
        <div className="layout">
          <section className="pane">
            <h2 className="pane-title">Dispatch queue</h2>
            <p className="pane-sub">
              Select a row to open rationale and scoring factors below it.
            </p>
            {loading ? <p className="meta">Loading…</p> : null}
            {!loading && data && data.plan.items.length === 0 ? (
              <p className="meta">No dispatch items for this city / rain mode.</p>
            ) : null}
            <div className="dispatch-list">
              {data?.plan.items.map((item) => {
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
                          {item.action}
                          {item.crewName ? ` · ${item.crewName}` : " · unassigned"} · risk{" "}
                          {item.risk.toFixed(2)}
                        </div>
                      </div>
                      <span className={`sev ${item.severity}`}>{item.severity}</span>
                    </button>
                    {open ? (
                      <div className="detail-panel">
                        <h3>Rationale</h3>
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

            <h3 style={{ marginTop: "1.35rem", marginBottom: "0.4rem", fontSize: "0.98rem" }}>
              Next at risk
            </h3>
            <p className="pane-sub" style={{ marginTop: 0 }}>
              Nearby lower ground while rain continues.
            </p>
            {!loading && data && nextAtRiskRows.length === 0 ? (
              <p className="meta">None flagged for this rain intensity.</p>
            ) : null}
            <div className="dispatch-list">
              {nextAtRiskRows.map((row) => {
                const open = row.spotId === activeId;
                return (
                  <div key={row.spotId} className="dispatch-block">
                    <button
                      type="button"
                      className="dispatch-item"
                      data-active={open}
                      onClick={() => setActiveId(open ? null : row.spotId)}
                    >
                      <div className="priority">→</div>
                      <div>
                        <div className="spot-name">{row.name}</div>
                        <div className="meta">{row.reason}</div>
                      </div>
                    </button>
                    {open && active ? (
                      <div className="detail-panel">
                        <h3>Linked dispatch · {active.spotName}</h3>
                        <p>{active.explanation}</p>
                      </div>
                    ) : open ? (
                      <div className="detail-panel">
                        <p style={{ margin: 0 }}>{row.reason}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="pane">
            <h2 className="pane-title">Citizen reports</h2>
            <p className="pane-sub">
              Select a report to view evidence and scores below the row.
            </p>

            {!loading && !rankedReports.length ? (
              <p className="meta">No reports yet. Citizens submit from the report page.</p>
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
                            score {r.rankScore.toFixed(2)} · cred {r.credibility.toFixed(2)} ·{" "}
                            {r.hasPhoto ? "photo" : "no photo"} · water{" "}
                            {r.waterDetected ? "yes" : "no"}
                          </div>
                        </div>
                        <span className={`sev ${r.severity}`}>{r.severity}</span>
                      </button>
                      {open ? (
                        <div className="detail-panel">
                          <h3>Report detail</h3>
                          <p>
                            {r.note || "No note"} · {new Date(r.createdAt).toLocaleString()}
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
                            <p className="meta">No photo — credibility capped.</p>
                          )}
                          <dl>
                            <dt>rank score</dt>
                            <dd>{r.rankScore.toFixed(2)}</dd>
                            <dt>credibility</dt>
                            <dd>{r.credibility.toFixed(2)}</dd>
                            <dt>water score</dt>
                            <dd>{(r.waterScore * 100).toFixed(0)}%</dd>
                            <dt>has photo</dt>
                            <dd>{r.hasPhoto ? "yes" : "no"}</dd>
                          </dl>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <h3 style={{ marginTop: "1.35rem", marginBottom: "0.45rem", fontSize: "0.98rem" }}>
              Spot risk
            </h3>
            <div className="map-grid">
              {(data?.spots ?? [])
                .slice()
                .sort((a, b) => b.risk.value - a.risk.value)
                .slice(0, 8)
                .map((s) => (
                  <div key={s.id} className="spot-chip">
                    <strong>{s.name}</strong>
                    {s.risk.value.toFixed(2)}
                    <div className="bar">
                      <i style={{ width: `${Math.round(s.risk.value * 100)}%` }} />
                    </div>
                  </div>
                ))}
            </div>

            <h3 style={{ marginTop: "1.35rem", marginBottom: "0.45rem", fontSize: "0.98rem" }}>
              Assets
            </h3>
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
                    disabled={togglingId !== null || loading}
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
