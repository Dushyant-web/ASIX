"use client";
/** Left nav — connects every page. UX structure only. */
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Run workflow", hint: "the demo — quote → settle → receipt" },
  { href: "/failure", label: "Test failure", hint: "watch a refund happen on chain" },
  { href: "/attack", label: "Start attack", hint: "fire the 5 x402 attacks, see them blocked" },
  { href: "/receipts", label: "Receipts", hint: "look up any run by id" },
  { href: "/protocol", label: "How it works", hint: "the 8-step x402 flow" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <nav style={{ width: 240, borderRight: "1px solid var(--border)", padding: 16, minHeight: "100vh", position: "sticky", top: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>AXIS</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 20 }}>Atomic X402 Integrated Settlement</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} className="node" data-active={active}
                style={{ display: "block", textDecoration: "none" }}>
                <div className={active ? "strong" : ""}>{n.label}</div>
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{n.hint}</div>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="muted" style={{ fontSize: 10, marginTop: 24, lineHeight: 1.6 }}>
        Algorand testnet · USDC ASA<br />4 live x402 providers
      </div>
    </nav>
  );
}
