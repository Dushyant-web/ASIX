"use client";
import Link from "next/link";

const NAV = [
  { href: "/", label: "Run workflow" },
  { href: "/failure", label: "Test failure" },
  { href: "/attack", label: "Start attack" },
  { href: "/receipts", label: "Receipts" },
  { href: "/protocol", label: "How it works" },
];

export function Sidebar() {
  return (
    <nav>
      <h2>AXIS</h2>
      <ul>
        {NAV.map((n) => (
          <li key={n.href}><Link href={n.href}>{n.label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
