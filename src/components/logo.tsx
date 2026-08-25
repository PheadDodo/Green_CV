import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="logo" href="/dashboard" aria-label="Pathfinder dashboard">
      <span className="logoMark" aria-hidden="true">P</span>
      {!compact && <span>Pathfinder</span>}
    </Link>
  );
}
