"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { session } from "../lib/api";

const NAV: { href: string; label: string; ico: string; section: string }[] = [
  { href: "/dashboard", label: "Run workflow", ico: "▶", section: "Run" },
  { href: "/agent", label: "Autonomous agent", ico: "◆", section: "Run" },
  { href: "/failure", label: "Test failure", ico: "↺", section: "Prove it" },
  { href: "/attack", label: "Start attack", ico: "⚔", section: "Prove it" },
  { href: "/receipts", label: "Receipts", ico: "≣", section: "Ledger" },
  { href: "/refunds", label: "Refunds", ico: "↩", section: "Ledger" },
  { href: "/projects", label: "Projects", ico: "▦", section: "Ledger" },
  { href: "/protocol", label: "How it works", ico: "?", section: "Learn" },
];

const SECTIONS = ["Run", "Prove it", "Ledger", "Learn"];

/** The AXIS ribbon mark, inlined so it needs no network fetch. */
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 1024 1024" aria-hidden>
      <defs>
        <linearGradient id="sbg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B30000" />
          <stop offset="100%" stopColor="#4D0000" />
        </linearGradient>
        <linearGradient id="sbg2" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#E60000" />
          <stop offset="100%" stopColor="#FF4D4D" />
        </linearGradient>
      </defs>
      <path d="M 453 200 L 203 820 L 821 450" fill="none" stroke="url(#sbg1)" strokeWidth="140" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 821 450 L 703 820 L 453 200" fill="none" stroke="url(#sbg2)" strokeWidth="140" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Read the session on the client only (localStorage is not on the server).
  useEffect(() => { setEmail(session.email()); }, []);

  function logout() {
    session.clear();
    setEmail(null);
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav>
      <h2>
        <img src="/axis_logo.svg" alt="AXIS" width={26} height={26} style={{ verticalAlign: "middle", marginRight: 8 }} />
        AXIS
      </h2>
      <ul>
        {NAV.map((n) => (
          <li key={n.href}><Link href={n.href}>{n.label}</Link></li>
        ))}
      </ul>
      {email ? (
        <p>{email} · <button type="button" onClick={logout}>log out</button></p>
      ) : (
        <p><Link href="/login">Log in</Link> · <Link href="/signup">Sign up</Link></p>
      )}
    </nav>
  );
}
