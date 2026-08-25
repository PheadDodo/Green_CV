import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="logo" href="/dashboard" aria-label="GreenCV dashboard">
      <span className="logoMark" aria-hidden="true">G</span>
      {!compact && <span>GreenCV</span>}
    </Link>
  );
}
