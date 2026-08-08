"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { session } from "../lib/api";

const NAV = [
  { href: "/", label: "Run workflow" },
  { href: "/agent", label: "Autonomous agent" },
  { href: "/failure", label: "Test failure" },
  { href: "/attack", label: "Start attack" },
  { href: "/receipts", label: "Receipts" },
  { href: "/protocol", label: "How it works" },
];

export function Sidebar() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();

  // Read the session on the client only (localStorage is not on the server).
  useEffect(() => { setEmail(session.email()); }, []);

  function logout() {
    session.clear();
    setEmail(null);
    router.push("/login");
  }

  return (
    <nav>
      <h2>AXIS</h2>
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
