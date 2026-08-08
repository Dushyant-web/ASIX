export default function PolicyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-3 p-8 font-mono">
      <h1 className="text-xl font-bold">Spend policy</h1>
      <p className="text-sm text-neutral-400">
        The guard runs before every signature. Live headroom bars and the editor
        land in Phase 6; this page will read and update the calling agent&apos;s policy.
      </p>
      <ul className="space-y-1 text-xs text-neutral-500">
        <li>per-workflow ceiling · per-provider cap</li>
        <li>rolling hourly spend + call velocity</li>
        <li>provider trust threshold · global kill switch</li>
      </ul>
    </main>
  );
}
