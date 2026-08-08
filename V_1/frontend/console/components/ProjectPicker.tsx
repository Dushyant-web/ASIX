"use client";
import { useEffect, useState } from "react";
import { api, type ProjectSummary } from "../lib/api.ts";

/** Pick an existing project or create one inline. Reports the chosen id up. */
export function ProjectPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState("");

  const load = () => api.projects().then((r) => setProjects(r.projects)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    try {
      const p = await api.createProject(newName.trim());
      setNewName("");
      await load();
      onChange(p.id);
    } catch { /* ignore */ }
  }

  return (
    <span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— no project —</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {"  or new: "}
      <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="project name" />
      <button type="button" onClick={create}>create</button>
    </span>
  );
}
