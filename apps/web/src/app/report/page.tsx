"use client";

import Link from "next/link";
import { useState } from "react";

type ReportResult = {
  id: string;
  spotId: string;
  spotName: string;
  credibility: number;
  severity: string;
  hasPhoto: boolean;
  waterDetected: boolean;
  waterScore: number;
  photoUrl: string | null;
  credibilityBreakdown: Record<string, number | string | boolean>;
  severityBreakdown: Record<string, number | string | boolean>;
};

export default function ReportPage() {
  const [city, setCity] = useState("pune");
  const [note, setNote] = useState("");
  const [depthCue, setDepthCue] = useState<"ankle" | "knee" | "vehicle" | "unknown">(
    "unknown",
  );
  const [waterDetected, setWaterDetected] = useState(true);
  const [lat, setLat] = useState(18.4805);
  const [lon, setLon] = useState(73.825);
  const [locationReady, setLocationReady] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | undefined>();
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [showManualCoords, setShowManualCoords] = useState(false);

  function onFile(file: File | null) {
    setError(null);
    if (!file) {
      setPhotoBase64(undefined);
      setPhotoName(null);
      setReadingPhoto(false);
      return;
    }
    setReadingPhoto(true);
    setPhotoName(null);
    setPhotoBase64(undefined);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl.startsWith("data:image/")) {
        setReadingPhoto(false);
        setPhotoBase64(undefined);
        setPhotoName(null);
        setError("That file does not look like an image. Pick a JPG, PNG, or WebP.");
        return;
      }
      setPhotoBase64(dataUrl);
      setPhotoName(file.name);
      setReadingPhoto(false);
    };
    reader.onerror = () => {
      setReadingPhoto(false);
      setPhotoBase64(undefined);
      setPhotoName(null);
      setError("Could not read that photo. Try another image.");
    };
    reader.readAsDataURL(file);
  }

  function useDeviceLocation() {
    setError(null);
    setLocationError(null);
    setLocationNote(null);

    if (typeof window === "undefined") return;

    if (!window.isSecureContext) {
      setLocationError(
        "Open http://localhost:3000 (not a Wi‑Fi IP). Then try again and press Allow.",
      );
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("This browser cannot share location. Enter coordinates manually.");
      setShowManualCoords(true);
      return;
    }

    setLocating(true);
    setLocationNote("Waiting for browser permission…");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = Number(pos.coords.latitude.toFixed(5));
        const nextLon = Number(pos.coords.longitude.toFixed(5));
        setLat(nextLat);
        setLon(nextLon);

        const dPune = Math.hypot(nextLat - 18.5204, nextLon - 73.8567);
        const dMumbai = Math.hypot(nextLat - 19.076, nextLon - 72.8777);
        const nextCity = dMumbai < dPune ? "mumbai" : "pune";
        setCity(nextCity);
        setLocationReady(true);

        setLocationNote(
          `Location received. Matched city: ${nextCity === "pune" ? "Pune" : "Mumbai"}.`,
        );
        setLocationError(null);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationNote(null);
        setShowManualCoords(true);
        const detail =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow it in the address bar, or enter coordinates below."
            : err.code === err.POSITION_UNAVAILABLE
              ? "GPS unavailable. Turn on device location, or enter coordinates below."
              : err.code === err.TIMEOUT
                ? "Location timed out. Try again, or enter coordinates below."
                : err.message || "Could not read location";
        setLocationError(detail);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readingPhoto) {
      setError("Still reading the photo — wait a moment, then submit.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/cities/${city}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          note,
          waterDetected,
          depthCue,
          photoBase64,
        }),
      });
      let json: { report?: ReportResult; error?: string } = {};
      try {
        json = (await res.json()) as { report?: ReportResult; error?: string };
      } catch {
        throw new Error(
          res.ok
            ? "Could not parse the server response."
            : `Could not submit report (HTTP ${res.status}).`,
        );
      }
      if (!res.ok) throw new Error(json.error ?? "Could not submit report");
      if (!json.report) throw new Error("Server returned no report payload");
      setResult(json.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  }

  const cityLabel = city === "pune" ? "Pune" : "Mumbai";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Flood<span>Ops</span>
        </div>
        <nav className="nav-links">
          <Link href="/report" data-active="true">
            Citizen report
          </Link>
          <Link href="/">Home</Link>
        </nav>
      </header>

      <div className="page-pad">
        <section className="pane" style={{ maxWidth: 640, margin: "0 auto" }}>
          <p className="section-label">Public intake</p>
          <h2 className="pane-title">Report flooding</h2>
          <p className="pane-sub">
            Share your location and a photo. The system matches the nearest flood blackspot and
            scores the report for operations staff.
          </p>

          <form className="form-stack" onSubmit={(e) => void submit(e)}>
            <div className="step loc-card">
              <h3>1. Location</h3>
              <p>
                Share your current position so we can place this report on the correct street
                segment. We do not track you afterward.
              </p>

              <div className="loc-status">
                <div className="loc-pin">GPS</div>
                <div>
                  <strong>
                    {locating
                      ? "Requesting permission…"
                      : locationReady
                        ? `Located · ${cityLabel}`
                        : "Location not shared"}
                  </strong>
                  <div className="meta">
                    {locationReady
                      ? `${lat}, ${lon}`
                      : "Default pin is central Pune until you share location."}
                  </div>
                </div>
              </div>

              <button
                className="btn primary wide"
                type="button"
                disabled={locating}
                onClick={useDeviceLocation}
              >
                {locating ? "Getting location…" : "Share my current location"}
              </button>

              {locationNote ? <p className="ok-text">{locationNote}</p> : null}
              {locationError ? <p className="alert">{locationError}</p> : null}

              <button
                className="btn"
                type="button"
                onClick={() => setShowManualCoords((v) => !v)}
              >
                {showManualCoords ? "Hide manual coordinates" : "Enter coordinates manually"}
              </button>

              {showManualCoords ? (
                <div className="detail-panel" style={{ border: "1px solid var(--line)" }}>
                  <div className="coord-row">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="0.0001"
                        value={lat}
                        onChange={(e) => {
                          setLat(Number(e.target.value));
                          setLocationReady(true);
                          setLocationNote(null);
                          setLocationError(null);
                        }}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="0.0001"
                        value={lon}
                        onChange={(e) => {
                          setLon(Number(e.target.value));
                          setLocationReady(true);
                          setLocationNote(null);
                          setLocationError(null);
                        }}
                      />
                    </label>
                  </div>
                  <label style={{ marginTop: "0.65rem" }}>
                    City
                    <select value={city} onChange={(e) => setCity(e.target.value)}>
                      <option value="pune">Pune</option>
                      <option value="mumbai">Mumbai</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="step">
              <h3>2. Photo evidence</h3>
              <p>A clear photo of standing water strengthens the report. Without it, credibility stays low.</p>
              <label>
                Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="meta">
                {readingPhoto
                  ? "Reading photo…"
                  : photoBase64 && photoName
                    ? `Attached: ${photoName}`
                    : "No photo attached"}
              </p>
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Preview" className="soft-img" />
              ) : null}
            </div>

            <div className="step">
              <h3>3. Conditions</h3>
              <label>
                Observed depth
                <select
                  value={depthCue}
                  onChange={(e) =>
                    setDepthCue(e.target.value as "ankle" | "knee" | "vehicle" | "unknown")
                  }
                >
                  <option value="unknown">Unknown — estimate from photo</option>
                  <option value="ankle">Ankle</option>
                  <option value="knee">Knee</option>
                  <option value="vehicle">Vehicle depth</option>
                </select>
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={waterDetected}
                  onChange={(e) => setWaterDetected(e.target.checked)}
                />
                Standing water is visible (counts only with a photo)
              </label>

              <label>
                Note
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional landmark or street detail"
                />
              </label>
            </div>

            <button className="btn primary wide" type="submit" disabled={busy || readingPhoto}>
              {busy ? "Submitting…" : readingPhoto ? "Reading photo…" : "Submit report"}
            </button>
          </form>

          {error ? <p className="alert" style={{ marginTop: "1rem" }}>{error}</p> : null}

          {result ? (
            <div className="step" style={{ marginTop: "1.15rem" }}>
              <h3>Report received · {result.spotName}</h3>
              <p>
                Credibility {result.credibility.toFixed(2)} · Severity {result.severity} · Photo{" "}
                {result.hasPhoto ? "yes" : "no"} · Water{" "}
                {result.waterDetected
                  ? `detected (${(result.waterScore * 100).toFixed(0)}%)`
                  : "not detected"}
                {typeof result.credibilityBreakdown.damageLevel === "number"
                  ? ` · Hazard level ${result.credibilityBreakdown.damageLevel}`
                  : ""}
              </p>
              <p className="meta">
                Operations staff will see this in the dispatch console. You can close this page.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
