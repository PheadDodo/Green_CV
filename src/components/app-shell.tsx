"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  FileStack,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from "lucide-react";
import { useState } from "react";
import { Logo } from "./logo";

const links = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/applications", label: "Applications", icon: BriefcaseBusiness },
  { href: "/cvs", label: "CV library", icon: FileStack },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/settings/automation", label: "Automation", icon: Settings2 },
  { href: "/settings/account", label: "Account security", icon: ShieldCheck }
];

export function AppShell({
  children,
  viewer
}: {
  children: React.ReactNode;
  viewer: { email: string; isDemo: boolean };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="appFrame">
      <aside className={`sidebar ${open ? "sidebarOpen" : ""}`}>
        <div className="sidebarTop">
          <Logo />
          <button className="iconButton mobileOnly" onClick={() => setOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <nav className="sideNav" aria-label="Primary navigation">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} className={active ? "active" : ""} onClick={() => setOpen(false)}>
                <Icon size={18} strokeWidth={1.9} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebarNote">
          <Sparkles size={16} />
          <div><b>Evidence first</b><span>Every recommendation stays grounded in your actual CV.</span></div>
        </div>
        <div className="viewerCard">
          <span className="avatar">{viewer.email.slice(0, 1).toUpperCase()}</span>
          <div><b>{viewer.isDemo ? "Demo workspace" : viewer.email}</b><span>{viewer.isDemo ? "Local data" : "Private account"}</span></div>
          <form action="/api/auth/signout" method="post"><button aria-label="Sign out"><LogOut size={16} /></button></form>
        </div>
      </aside>
      {open && <button className="navScrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <div className="contentFrame">
        <header className="mobileHeader"><button className="iconButton" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><Logo compact /><span /></header>
        {children}
      </div>
    </div>
  );
}
