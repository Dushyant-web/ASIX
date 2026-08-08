"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ProjectSummary, type Usage } from "../../lib/api.ts";

export default function Projects() {
  const [rows, setRows] = useState<ProjectSummary[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.projects().then((r) => setRows(r.projects)).catch((e) => setErr(String(e)));
    api.usage().then(setUsage).catch(() => {});
  };
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try { await api.createProject(name.trim()); setName(""); load(); }
    catch (x) { setErr((x as { error?: { message?: string } })?.error?.message ?? "could not create"); }
  }

  return (
    <main>
      <h1>Projects</h1>
      <p>Group your runs into projects, then see each project&apos;s spend and refunds. Pick a project on the Run or Autonomous-agent page to tag a run to it.</p>

      {usage && (
        <p><b>Your usage (all projects):</b> {usage.runs} runs · {usage.settled} settled · {usage.partial} partial · spent <b>${usage.netUSDC}</b> net (gross ${usage.grossUSDC}, refunded ${usage.refundedUSDC}).</p>
      )}

      <form onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new project name" />
        <button type="submit">create project</button>
      </form>
      {err && <p>error: {err}</p>}

      {!rows ? <p>loading…</p> : rows.length === 0 ? <p>No projects yet — create one above.</p> : (
        <table border={1} cellPadding={4}>
          <thead><tr><th>project</th><th>runs</th><th>net spent</th><th>refunded</th><th>created</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/projects/${p.id}`}>{p.name}</Link></td>
                <td>{p.runs}</td>
                <td>${p.netUSDC}</td>
                <td>{Number(p.refundedUSDC) > 0 ? `$${p.refundedUSDC}` : "—"}</td>
                <td>{new Date(p.createdAt).toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
