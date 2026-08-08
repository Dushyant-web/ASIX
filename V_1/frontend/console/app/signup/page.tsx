"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, session } from "../../lib/api";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      session.save(await api.signup(email, password));
      router.push("/receipts");
    } catch (x) {
      setErr((x as { error?: { message?: string } })?.error?.message ?? "signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign up</h1>
      <form onSubmit={submit}>
        <p><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required /></p>
        <p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password (min 8 chars)" required minLength={8} /></p>
        <button type="submit" disabled={busy}>{busy ? "…" : "create account"}</button>
      </form>
      {err && <p>{err}</p>}
      <p>Already have an account? <Link href="/login">Log in</Link></p>
    </main>
  );
}
