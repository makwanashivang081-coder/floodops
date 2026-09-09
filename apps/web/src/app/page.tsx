import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          Flood<span>Ops</span>
        </div>
        <nav className="nav-links">
          <Link href="/admin">Operations</Link>
          <Link href="/report">Citizen report</Link>
        </nav>
      </header>

      <section className="home-hero">
        <p className="section-label">Municipal flood operations</p>
        <h1>
          Flood<span style={{ color: "var(--rain)" }}>Ops</span>
        </h1>
        <p>
          Turns live rainfall, terrain, historical blackspots, and photo-verified
          citizen reports into an explainable dispatch plan for the city engineer.
        </p>
        <div className="home-actions">
          <Link className="btn primary" href="/admin">
            Open operations console
          </Link>
          <Link className="btn" href="/report">
            File a flood report
          </Link>
        </div>
      </section>
    </main>
  );
}
