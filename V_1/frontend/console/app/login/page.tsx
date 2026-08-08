"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, session } from "../../lib/api";

export default function Login() {
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
      session.save(await api.login(email, password));
      router.push("/receipts");
    } catch (x) {
      setErr((x as { error?: { message?: string } })?.error?.message ?? "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={submit}>
        <p><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" required /></p>
        <p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" required /></p>
        <button type="submit" disabled={busy}>{busy ? "…" : "log in"}</button>
      </form>
      {err && <p>{err}</p>}
      <p>No account? <Link href="/signup">Sign up</Link></p>
    </main>
  );
}
