import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="pageHeader"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="headerActions">{actions}</div>}</header>;
}

export function Badge({ tone = "neutral", children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "green" | "blue" | "amber" | "red" | "purple" }) {
  return <span className={`badge badge-${tone}`} {...props}>{children}</span>;
}

export function Button({ variant = "primary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="emptyState"><span className="emptyIcon">{icon}</span><h2>{title}</h2><p>{description}</p>{action}</div>;
}

export function LoadingBlock() {
  return <div className="loadingBlock" aria-label="Loading"><i /><i /><i /></div>;
}
