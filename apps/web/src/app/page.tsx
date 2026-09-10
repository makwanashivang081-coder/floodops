import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default function HomePage() {
  return (
    <main className="shell">
      <AppHeader active="home" />
      <section className="home-hero">
        <h1>
          Flood<span style={{ color: "var(--rain)" }}>Ops</span>
        </h1>
        <p>
          When streets flood, this tells the city which spot to handle first,
          what to send, and why.
        </p>
        <div className="home-actions">
          <Link className="btn primary" href="/admin">
            Admin panel
          </Link>
          <Link className="btn" href="/report">
            Report flood
          </Link>
        </div>
      </section>
    </main>
  );
}
