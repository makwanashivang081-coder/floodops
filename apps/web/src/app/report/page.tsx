"use client";

import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { FALLBACK_CITIES, nearestCity, type CityOption } from "@/lib/cities";
import { rememberLocalReport } from "@/lib/local-reports";
import { useEffect, useState } from "react";

type ReportDialog = {
  kind: "ok" | "false";
  title: string;
  message: string;
};

export default function ReportPage() {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [city, setCity] = useState("pune");
  const [note, setNote] = useState("");
  const [depthCue, setDepthCue] = useState<"ankle" | "knee" | "vehicle" | "unknown">(
    "unknown",
  );
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
  const [dialog, setDialog] = useState<ReportDialog | null>(null);
  const [showManualCoords, setShowManualCoords] = useState(false);

  useEffect(() => {
    void fetch("/api/cities")
      .then((res) => res.json() as Promise<{ cities?: CityOption[] }>)
      .then((json) => {
        if (json.cities?.length) setCities(json.cities);
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

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

        const matched = nearestCity(nextLat, nextLon, cities);
        setCity(matched.slug);
        setLocationReady(true);
        setLocationNote(`Location received. Matched city: ${matched.name}.`);
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
    if (!photoBase64) {
      setDialog({
        kind: "false",
        title: "False report",
        message:
          "Add a photo of standing water or a broken road. Without it this is not sent to the city.",
      });
      return;
    }
    setBusy(true);
    setError(null);
    setDialog(null);
    try {
      const res = await fetch(`/api/cities/${city}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat,
          lon,
          note,
          depthCue,
          photoBase64,
        }),
      });
      let json: {
        accepted?: boolean;
        verdict?: string;
        report?: {
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
        error?: string;
      } = {};
      try {
        json = (await res.json()) as typeof json;
      } catch {
        throw new Error(
          res.ok
            ? "Could not parse the server response."
            : `Could not submit report (HTTP ${res.status}).`,
        );
      }
      if (json.accepted === false || json.verdict === "false_report" || res.status === 422) {
        setDialog({
          kind: "false",
          title: "False report",
          message:
            json.error ??
            "This photo does not look like flooding or road damage. It was not sent to the city.",
        });
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Could not submit report");
      if (!json.report) throw new Error("Server returned no report payload");
      rememberLocalReport({
        ...json.report,
        city,
        photoUrl: photoBase64 ?? json.report.photoUrl,
      });
      setDialog({
        kind: "ok",
        title: "Report submitted",
        message: `The city will see this near ${json.report.spotName}.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  }

  const cityOptions = cities.length > 0 ? cities : FALLBACK_CITIES;
  const cityLabel = cityOptions.find((c) => c.slug === city)?.name ?? city;

  return (
    <main className="shell">
      <AppHeader active="report" />

      <div className="page-pad">
        <section className="pane" style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2 className="pane-title">Report flooding</h2>
          <p className="pane-sub">
            Send your location and a photo of the water. The city uses this to
            decide who to send.
          </p>

          <form className="form-stack" onSubmit={(e) => void submit(e)}>
            <div className="step loc-card">
              <h3>1. Location</h3>
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
                      {cityOptions.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="step">
              <h3>2. Photo</h3>
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
                    : "Photo of standing water or a broken road. Clothes, selfies, and random objects are rejected."}
              </p>
              {photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoBase64} alt="Preview" className="soft-img" />
              ) : null}
            </div>

            <div className="step">
              <h3>3. Depth and note</h3>
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
        </section>
      </div>

      {dialog ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-dialog-title"
        >
          <div className="modal" data-kind={dialog.kind}>
            <h3 id="report-dialog-title">{dialog.title}</h3>
            <p>{dialog.message}</p>
            {dialog.kind === "ok" ? (
              <Link
                className="btn primary wide"
                href={`/admin?city=${city}`}
                onClick={() => setDialog(null)}
              >
                Open admin panel
              </Link>
            ) : (
              <button className="btn primary wide" type="button" onClick={() => setDialog(null)}>
                Try another photo
              </button>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
