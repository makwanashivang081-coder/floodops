import Link from "next/link";

type AppHeaderProps = {
  active?: "home" | "report" | "admin";
};

export function AppHeader({ active }: AppHeaderProps) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Flood<span>Ops</span>
      </Link>
      <nav className="nav-links">
        <Link href="/report" data-active={active === "report" ? "true" : undefined}>
          Report flood
        </Link>
        <Link href="/admin" data-active={active === "admin" ? "true" : undefined}>
          Admin panel
        </Link>
      </nav>
    </header>
  );
}
