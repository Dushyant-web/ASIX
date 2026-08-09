/**
 * AXIS Live Monitor — an animated flowchart of the real stack.
 *
 * Follows the router's live event stream and turns each step into motion:
 * branded service boxes (Cloudflare, NVIDIA, Neon, Algorand, GoPlausible) light
 * up as they act, arrows flow, and streams of GOLDEN COINS travel the edges when
 * money moves — forward on settle, and ALL the way back to the agent on failure.
 * Logos are inline SVG (extensions can't fetch CDNs), so they always render.
 */

const DEFAULT_ROUTER = "http://localhost:8080";
const SVGNS = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const scene = $("scene");

let router = DEFAULT_ROUTER;
let followedRunId = null, es = null, view = null;
let slotOf = {}, providerCount = 4;

// ── Brand logos — simplified inline SVG marks in each brand's colour ─────────
const LOGO = {
  agent: `<rect width="24" height="24" rx="6" fill="#f6c344"/><rect x="4.5" y="8" width="15" height="9.5" rx="2" fill="#5c440d"/><path d="M4.5 8.5 L14 5 L16 8" stroke="#5c440d" stroke-width="1.6" fill="none"/><circle cx="16" cy="12.6" r="2" fill="#f6c344"/>`,
  axis: `<rect width="24" height="24" rx="6" fill="#0e2a33"/><path d="M12 4.5 L19 18 H5 Z" fill="none" stroke="#22d3ee" stroke-width="2"/><path d="M9 14 h6" stroke="#22d3ee" stroke-width="2"/>`,
  guard: `<path d="M12 2.5 L20 5.5 V12 q0 6.5 -8 9.5 q-8 -3 -8 -9.5 V5.5 Z" fill="#1c1206" stroke="#f59e0b" stroke-width="1.6"/><path d="M8.5 12 l2.3 2.3 L15.5 9.5" stroke="#f59e0b" stroke-width="1.8" fill="none"/>`,
  neon: `<rect width="24" height="24" rx="6" fill="#00e599"/><path d="M6.5 17 V7 l11 10 V7" fill="none" stroke="#00281b" stroke-width="2.2" stroke-linejoin="round"/>`,
  algorand: `<rect width="24" height="24" rx="6" fill="#000"/><path d="M5.5 18 L11 6 L13 10.2 L9.2 18 Z" fill="#fff"/><path d="M12.6 11 L14 8 L16.8 18 L14 18 Z" fill="#fff"/><path d="M13.6 6 h2.4 l.7 2.4 Z" fill="#fff"/>`,
  goplausible: `<path d="M12 2.5 L20.5 7 V17 L12 21.5 L3.5 17 V7 Z" fill="#151033" stroke="#8b6cf6" stroke-width="1.5"/><path d="M9 15 V9 h3.2 a2.4 2.4 0 0 1 0 4.8 H9" fill="none" stroke="#a78bfa" stroke-width="1.8"/>`,
  cloudflare: `<path d="M17.5 17 H7 a3.2 3.2 0 0 1 -.4 -6.36 A5 5 0 0 1 16 9.2 a3.6 3.6 0 0 1 1.5 7.8 Z" fill="#f6821f"/><path d="M6.6 13.6 H19" stroke="#fff" stroke-width="1.1" opacity=".55"/>`,
  nvidia: `<rect width="24" height="24" rx="6" fill="#76b900"/><path d="M6 12.4 q3.2 -4.2 10 -2.6 q-4.8 .1 -6.6 3.3 q2.6 -1.7 6.6 -.8 q-6.1 .6 -10 .1z" fill="#fff"/>`,
  receipt: `<rect width="24" height="24" rx="6" fill="#0e1b16"/><path d="M7 3.5 h10 v17 l-2 -1.4 -2 1.4 -2 -1.4 -2 1.4 -2 -1.4 V3.5 Z" fill="#eef2f8"/><path d="M9 8 h6 M9 11 h6 M9 14 h4" stroke="#0e1b16" stroke-width="1.3" stroke-linecap="round"/>`,
};

// ── Scene geometry (viewBox 380 x 404) ──────────────────────────────────────
// role2 = a second small line (used for the "powered by" service tag)
const N = {
  agent: { cx: 190, cy: 34, w: 210, h: 46, logo: "agent", name: "Agent", role: "your USDC wallet" },
  router:{ cx: 190, cy: 128, w: 150, h: 46, logo: "axis", name: "AXIS Router", role: "orchestrator" },
  guard: { cx: 56,  cy: 128, w: 96,  h: 46, logo: "guard", name: "Guard", role: "spend policy" },
  neon:  { cx: 324, cy: 128, w: 104, h: 46, logo: "neon", name: "Neon", role: "Postgres store" },
  group: { cx: 150, cy: 230, w: 182, h: 50, logo: "algorand", name: "Atomic Group", role: "Algorand · all-or-nothing" },
  facil: { cx: 322, cy: 230, w: 110, h: 50, logo: "goplausible", name: "GoPlausible", role: "fee payer" },
  receipt: { cx: 190, cy: 448, w: 234, h: 48, logo: "receipt", name: "Receipt", role: "unified · one per run" },
};
// Provider boxes are laid out DYNAMICALLY per run (N providers, not a fixed 4).
let PROV = [];
const EDGES = [
  ["agent","router"], ["router","guard"], ["router","neon"], ["router","group"],
  ["facil","group"], ["group","neon"],
];
const ctr = (id) => ({ x: N[id].cx, y: N[id].cy });
function anchor(a, b) {
  const A = N[a], B = N[b], dx = B.cx - A.cx, dy = B.cy - A.cy;
  if (Math.abs(dx) > Math.abs(dy)) return { x: A.cx + Math.sign(dx) * A.w / 2, y: A.cy };
  return { x: A.cx, y: A.cy + Math.sign(dy) * A.h / 2 };
}

// ── Build the static scene (as SVG markup, so logos inline cleanly) ──────────
function buildScene() {
  let s = `
    <defs>
      <marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#3a4658"/>
      </marker>
      <radialGradient id="gold" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#fff6d8"/><stop offset="35%" stop-color="#f6c344"/>
        <stop offset="100%" stop-color="#b8801a"/>
      </radialGradient>
      <filter id="cglow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="2.4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>`;

  // Cloudflare lane behind the providers
  s += `<rect class="lane" x="4" y="316" width="372" height="84" rx="10"/>
        <text class="lane-lbl" x="12" y="329">☁ CLOUDFLARE WORKERS</text>`;

  for (const [f, t] of EDGES) {
    const p1 = anchor(f, t), p2 = anchor(t, f);
    s += `<path id="e-${f}-${t}" class="edge" d="M${p1.x},${p1.y} L${p2.x},${p2.y}"/>`;
  }
  s += `<g id="prov-edges"></g>`;                  // provider edges, filled per run
  for (const id in N) s += nodeSvg(id, N[id]);
  s += `<g id="prov-boxes"></g>`;                  // provider boxes, filled per run
  scene.innerHTML = s;
}

/** A horizontal card (logo left, name + role right) — used for the fixed nodes. */
function nodeSvg(id, n) {
  const x = n.cx - n.w / 2, y = n.cy - n.h / 2;
  const lx = x + 9, ly = y + (n.h - 24) / 2, tx = lx + 32;
  return `<g id="n-${id}">
    <rect class="card" id="card-${id}" x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="11"/>
    <g transform="translate(${lx},${ly})">${LOGO[n.logo]}</g>
    <text class="name" id="name-${id}" x="${tx}" y="${n.cy - 2}">${n.name}</text>
    <text class="role" id="role-${id}" x="${tx}" y="${n.cy + 11}">${n.role}</text>
  </g>`;
}

/** A compact card (logo top, name + role centered) — for the N provider boxes. */
function provSvg(id, n) {
  const x = n.cx - n.w / 2, y = n.cy - n.h / 2;
  return `<g id="n-${id}">
    <rect class="card" id="card-${id}" x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="10"/>
    <g transform="translate(${n.cx - 12},${y + 6})">${LOGO.cloudflare}</g>
    <text class="name" id="name-${id}" x="${n.cx}" y="${y + 42}" text-anchor="middle" style="font-size:8.5px">${n.name}</text>
    <text class="role" id="role-${id}" x="${n.cx}" y="${y + 52}" text-anchor="middle" style="font-size:7.5px">${n.role}</text>
  </g>`;
}

/** Lay out N provider boxes across the Cloudflare lane and wire their edges. */
function layoutProviders(nodes) {
  const list = nodes.slice(0, 10);
  providerCount = list.length;
  PROV = list.map((_, i) => `p${i}`);
  const gap = 4, m = 8, cy = 352, h = 56;
  const w = Math.max(34, Math.min(88, (380 - 2 * m - gap * (list.length - 1)) / Math.max(list.length, 1)));
  let edges = "", boxes = "";
  list.forEach((node, i) => {
    const id = `p${i}`;
    N[id] = { cx: m + w / 2 + i * (w + gap), cy, w, h, logo: "cloudflare", name: short(node.provider).slice(0, 10), role: "" };
    slotOf[node.stepId] = i;
    for (const [f, t] of [["group", id], [id, "receipt"]]) {
      const a = anchor(f, t), b = anchor(t, f);
      edges += `<path id="e-${f}-${t}" class="edge" d="M${a.x},${a.y} L${b.x},${b.y}"/>`;
    }
    boxes += provSvg(id, N[id]);
  });
  const pe = $("prov-edges"), pb = $("prov-boxes");
  if (pe) pe.innerHTML = edges;
  if (pb) pb.innerHTML = boxes;
}

// ── Scene mutators ──────────────────────────────────────────────────────────
const setCard = (id, cls) => { const e = $(`card-${id}`); if (e) e.setAttribute("class", "card " + (cls || "")); };
const setName = (id, s) => { const e = $(`name-${id}`); if (e) e.textContent = s; };
const setRole = (id, s, mod) => { const e = $(`role-${id}`); if (e) { e.textContent = s; e.setAttribute("class", "role" + (mod ? " " + mod : "")); } };
const pulse = (f, t, cls) => { const e = $(`e-${f}-${t}`); if (e) e.setAttribute("class", "edge " + (cls || "active")); };

/** A stream of travelling markers: golden coins for MONEY, cyan chips for RESULTS. */
function coins(fromId, toId, { n = 3, dur = 0.9, gap = 0.16, refund = false, record = false } = {}) {
  const a = ctr(fromId), b = ctr(toId);
  for (let i = 0; i < n; i++) {
    const begin = i * gap;
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("filter", "url(#cglow)");
    g.setAttribute("opacity", "0");
    g.innerHTML = record
      ? `<rect x="-4.5" y="-4.5" width="9" height="9" rx="2" fill="#63b3ff" stroke="#0e2a33" stroke-width="1"/>`
      : `<circle r="6" fill="url(#gold)" stroke="${refund ? "#b45309" : "#8a5e12"}" stroke-width="1"/>
         <circle r="2" cx="-1.6" cy="-1.8" fill="#fffbe9" opacity=".85"/>`;
    const mo = document.createElementNS(SVGNS, "animateMotion");
    mo.setAttribute("dur", `${dur}s`); mo.setAttribute("begin", `${begin}s`);
    mo.setAttribute("fill", "freeze"); mo.setAttribute("path", `M${a.x},${a.y} L${b.x},${b.y}`);
    const op = document.createElementNS(SVGNS, "animate");
    op.setAttribute("attributeName", "opacity"); op.setAttribute("values", "0;1;1;0");
    op.setAttribute("dur", `${dur}s`); op.setAttribute("begin", `${begin}s`); op.setAttribute("fill", "freeze");
    g.appendChild(mo); g.appendChild(op);
    scene.appendChild(g);
    setTimeout(() => g.remove(), (begin + dur) * 1000 + 250);
  }
}

const caption = (html) => { $("caption").innerHTML = html; };
const short = (p) => String(p || "").replace(/-(explainer|checker|roaster|summarizer)$/, "");

// ── Live backend terminal — tail every event as a formatted log line ─────────
const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
const clip = (s, n) => String(s || "").slice(0, n);

/** Return { cls, msg } for one event — cls colours the event token. */
function fmt(e) {
  switch (e.type) {
    case "run.started": return { cls: "", msg: `<span class="dim">${clip(e.runId, 20)} · ${esc(e.workflow || "")} · ${(e.nodes || []).length} providers</span>` };
    case "probe.sent": return { cls: "", msg: `→ ${esc(short(e.provider) || e.stepId)} <span class="dim">(unpaid 402 probe)</span>` };
    case "challenge.received": return { cls: "", msg: `← ${esc(short(e.provider) || e.stepId)}  <span class="money">$${esc(e.priceUSDC)}</span> <span class="dim">payTo ${clip(e.payTo, 6)}…</span>` };
    case "quote.ready": return { cls: "", msg: `total <span class="money">$${esc(e.totalUSDC)}</span> → <span class="g">Neon</span> <span class="dim">[OPEN, single-use]</span>` };
    case "policy.evaluated": return e.verdict === "PASS" ? { cls: "ok", msg: `<span class="g">PASS</span> <span class="dim">under every ceiling</span>` } : { cls: "err", msg: `<span class="r">FAIL — nothing will be signed</span>` };
    case "group.composed": return { cls: "", msg: `${e.groupSize} legs · <span class="dim">Algorand atomic group</span>` };
    case "group.simulated": return e.passed ? { cls: "ok", msg: `<span class="g">OK</span> <span class="dim">dry run ${e.durationMs || 0}ms — safe to submit</span>` } : { cls: "err", msg: `<span class="r">SIMULATION FAILED — not submitted</span>` };
    case "settle.retry": return { cls: "warn", msg: `<span class="y">retry ${e.attempt}/${e.maxAttempts - 1}</span> <span class="dim">${esc(clip(e.message, 44))}</span>` };
    case "group.signed": return { cls: "", msg: `<span class="g">1 signature</span> · ${e.legCount} payments <span class="dim">· GoPlausible pays fees</span>` };
    case "group.settled": return { cls: "ok", msg: `<span class="g">round ${e.confirmedRound}</span> · ${(e.txids || []).length} txids · <span class="dim">group ${clip(e.groupId, 10)}…</span>` };
    case "step.started": return { cls: "", msg: `${esc(e.stepId)} <span class="dim">running…</span>` };
    case "step.delivered": return { cls: "ok", msg: `${esc(e.stepId)} <span class="g">✓</span> <span class="dim">${e.latencyMs}ms</span>` };
    case "step.failed": return { cls: "err", msg: `${esc(e.stepId)} <span class="r">FAILED</span> <span class="dim">${esc(clip(e.message, 40))}</span>` };
    case "step.skipped": return { cls: "warn", msg: `${esc(e.stepId)} <span class="y">skipped</span> <span class="dim">(dep failed)</span>` };
    case "node.state": return { cls: "", msg: `<span class="dim">${esc(e.stepId)} → ${esc(e.state)}</span>` };
    case "compensation.issued": return { cls: "warn", msg: `${esc(short(e.provider))} <span class="y">REVERSED</span> <span class="money">$${esc(e.amountUSDC || "")}</span> <span class="dim">refund ${clip(e.txid, 10)}…</span>` };
    case "run.completed": return e.status === "SETTLED"
      ? { cls: "ok", msg: `<span class="g">SETTLED</span> · total <span class="money">$${esc(e.totalUSDC)}</span>` }
      : { cls: "warn", msg: `<span class="y">${esc(e.status)}</span> · refunded <span class="money">$${esc(e.refundedUSDC)}</span> on-chain` };
    case "run.error": return { cls: "err", msg: `<span class="r">${esc(e.code)}</span> <span class="dim">${esc(clip(e.message, 44))}</span>` };
    default: return { cls: "", msg: `<span class="dim">${esc(clip(JSON.stringify(e), 60))}</span>` };
  }
}

function term(e) {
  const body = $("term-body");
  if (!body) return;
  const empty = body.querySelector(".empty");
  if (empty) body.innerHTML = "";
  const t = e.at ? new Date(e.at) : new Date();
  const ts = t.toTimeString().slice(0, 8) + "." + String(t.getMilliseconds()).padStart(3, "0");
  const { cls, msg } = fmt(e);
  const ln = document.createElement("div");
  ln.className = "ln";
  ln.innerHTML = `<span class="ts">${ts}</span> <span class="ev ${cls}">${esc(pad(e.type, 20))}</span> ${msg}`;
  body.appendChild(ln);
  while (body.childNodes.length > 240) body.removeChild(body.firstChild);
  body.scrollTop = body.scrollHeight;
}
function clearTerm() { const b = $("term-body"); if (b) b.innerHTML = `<div class="empty">…</div>`; }

// ── View + event fold ───────────────────────────────────────────────────────
function fresh() { buildScene(); clearTerm(); slotOf = {}; return { runId: null, status: "idle", paidSlots: [] }; }

function apply(e) {
  switch (e.type) {
    case "run.started": {
      view.status = "running";
      setCard("agent", "active"); setCard("router", "active"); pulse("agent", "router");
      layoutProviders(e.nodes || []);   // draw N provider boxes dynamically
      caption(`Agent asks the <b>Router</b> to run the workflow. Nothing paid yet.`);
      break;
    }
    case "probe.sent": {
      const s = slotOf[e.stepId]; if (s != null) { setCard(PROV[s], "active"); pulse("group", PROV[s]); }
      caption(`Router sends <b>unpaid 402 probes</b> to the providers on <b style="color:#f6821f">Cloudflare</b>. Still $0.00.`);
      break;
    }
    case "challenge.received": {
      const s = slotOf[e.stepId];
      if (s != null) { setCard(PROV[s], "active"); setRole(PROV[s], `$${e.priceUSDC}`, "price"); }
      caption(`Each provider answers with its <b>402 price</b>. AXIS reads prices from the protocol — never hardcoded.`);
      break;
    }
    case "quote.ready":
      setCard("neon", "active"); pulse("router", "neon"); setRole("neon", "quote saved");
      coins("router", "neon", { n: 1, dur: 0.6 });
      caption(`Signed <b>quote = $${e.totalUSDC}</b>, stored in <b style="color:#00e599">Neon</b> as OPEN (single-use).`);
      break;
    case "policy.evaluated":
      setCard("guard", e.verdict === "PASS" ? "pass" : "fail"); pulse("router", "guard");
      setRole("guard", e.verdict === "PASS" ? "PASS ✓" : "BLOCKED", e.verdict === "PASS" ? "" : "warn");
      caption(e.verdict === "PASS"
        ? `<b>Spend Guard</b> passes — under every ceiling. A fail here means <b>nothing is ever signed</b>.`
        : `<span class="warn"><b>Spend Guard BLOCKED</b> this workflow — no group, no payment.</span>`);
      break;
    case "group.composed":
      setCard("group", "active"); pulse("router", "group"); setRole("group", `${e.groupSize} legs · Algorand`);
      caption(`<b>One atomic group</b> on <b>Algorand</b> — ${e.groupSize} USDC payments to ${e.groupSize} different payees.`);
      break;
    case "group.simulated":
      setCard("group", e.passed ? "active" : "failed");
      caption(e.passed
        ? `<b>Simulated</b> on-chain first (free dry run). Passed → safe to submit.`
        : `<span class="warn">Simulation failed — <b>nothing submitted</b>, agent pays $0.</span>`);
      break;
    case "settle.retry":
      setCard("group", "failed");
      setRole("group", `retry ${e.attempt}/${e.maxAttempts - 1}`, "warn");
      caption(`<span class="warn">Settlement failed — <b>auto-retrying</b> (attempt ${e.attempt} of ${e.maxAttempts - 1}). After ${e.maxAttempts - 1} it stops. No double-pay — same signed group.</span>`);
      break;
    case "group.signed":
      setCard("facil", "active"); pulse("facil", "group"); setRole("facil", "pays ALGO fees");
      caption(`<b>One signature</b> authorizes all ${e.legCount} payments. <b style="color:#a78bfa">GoPlausible</b> covers the ALGO fees — agent needs only USDC.`);
      break;
    case "group.settled": {
      setCard("group", "paid"); setRole("group", `round ${e.confirmedRound}`);
      pulse("group", "neon", "paid"); setRole("neon", "txids saved");
      // The money moment: agent → group, then group → every provider.
      coins("agent", "group", { n: 4, dur: 0.7, gap: 0.1 });
      (e.txids || []).forEach((t) => {
        const s = slotOf[t.stepId];
        if (s != null) { view.paidSlots.push(s); pulse("group", PROV[s], "paid"); setCard(PROV[s], "paid"); coins("group", PROV[s], { n: 3, dur: 0.85 }); }
      });
      caption(`<span class="paid"><b>SETTLED</b> — golden coins land at all ${(e.txids || []).length} providers in one atomic group. Txids saved to <b style="color:#00e599">Neon</b>.</span>`);
      break;
    }
    case "step.started": { const s = slotOf[e.stepId]; if (s != null) setCard(PROV[s], "running"); break; }
    case "step.delivered": {
      const s = slotOf[e.stepId];
      if (s != null) { setCard(PROV[s], "delivered"); setRole(PROV[s], `✓ delivered ${e.latencyMs}ms`); coins(PROV[s], "receipt", { n: 1, dur: 0.7, record: true }); pulse(PROV[s], "receipt", "paid"); }
      caption(`Provider returns its <span class="paid">resource delivered</span> — the work the agent paid for, recorded into the receipt.`);
      break;
    }
    case "step.failed":
    case "step.skipped": { const s = slotOf[e.stepId]; if (s != null) setCard(PROV[s], "failed"); break; }
    case "node.state": { const s = slotOf[e.stepId]; if (s != null && e.state) setCard(PROV[s], mapState(e.state)); break; }
    case "compensation.issued": {
      const s = slotOf[e.stepId];
      if (s != null) {
        setCard(PROV[s], "refunded"); setRole(PROV[s], "✗ refunded", "warn");
        pulse("group", PROV[s], "refund"); coins(PROV[s], "agent", { n: 3, dur: 1.1, refund: true });
        // The failed leg is NOT left hanging — its refund is recorded into the receipt too.
        pulse(PROV[s], "receipt", "refund"); coins(PROV[s], "receipt", { n: 1, dur: 0.9, record: true });
      }
      caption(`<span class="warn"><b>${short(e.provider)}</b> took payment but failed — leg <b>reversed on-chain</b>, then recorded in the receipt. Nothing left unresolved.</span>`);
      break;
    }
    case "run.completed": {
      view.status = e.status;
      setCard("agent", e.status === "SETTLED" ? "paid" : "refunded");
      if (e.status === "REVERSED" || e.status === "FAILED") {
        // Everything unwinds: ALL coins return to where they started.
        view.paidSlots.forEach((s) => { setCard(PROV[s], "refunded"); pulse("group", PROV[s], "refund"); coins(PROV[s], "agent", { n: 3, dur: 1.1, refund: true }); });
      }
      // The flow ALWAYS ends here: every provider's outcome (delivered or
      // refunded) converges into ONE unified receipt — nothing left hanging.
      for (let i = 0; i < providerCount; i++) { pulse(PROV[i], "receipt", e.status === "SETTLED" ? "paid" : "refund"); coins(PROV[i], "receipt", { n: 1, dur: 0.7, gap: 0.08, record: true }); }
      const rcls = e.status === "SETTLED" ? "paid" : (e.status === "PARTIAL" ? "refunded" : "failed");
      setCard("receipt", rcls);
      setRole("receipt",
        e.status === "SETTLED" ? `✓ created · $${e.totalUSDC}` : `${e.status} · $${e.refundedUSDC} back`,
        e.status === "SETTLED" ? "" : "warn");
      caption(e.status === "SETTLED"
        ? `<span class="paid"><b>Receipt created</b> — all ${providerCount} resources delivered, $${e.totalUSDC} paid, one signature. Opens standalone.</span>`
        : `<span class="warn"><b>Receipt created</b> — delivered + <b>refunded</b> legs both recorded, $${e.refundedUSDC} back on-chain. ${e.status}, nothing left unresolved.</span>`);
      break;
    }
    case "run.error":
      view.status = "FAILED";
      caption(`<span class="warn">Rejected: ${esc(e.message || e.code)}${e.costedNothing ? " — you paid nothing." : ""}</span>`);
      break;
  }
}
const mapState = (s) => ({ running: "running", delivered: "delivered", refunded: "refunded", compensating: "failed", failed: "failed", paid: "paid" }[s] || "active");

// ── Connect + follow the latest live run ────────────────────────────────────
const setConn = (s) => { const el = $("conn"); el.textContent = s; el.className = "status " + s; };
async function pollLatest() {
  try {
    const res = await fetch(`${router}/v1/runs/latest`, { cache: "no-store" });
    if (!res.ok) throw 0;
    const { runId } = await res.json();
    if ($("conn").textContent === "offline") setConn("online");
    if (runId && runId !== followedRunId) follow(runId);
  } catch { setConn("offline"); }
}
function follow(runId) {
  followedRunId = runId; if (es) es.close();
  view = fresh(); view.runId = runId; setConn("running");
  es = new EventSource(`${router}/v1/runs/${runId}/events`);
  es.onmessage = onEvent;
  for (const t of ALL_EVENTS) es.addEventListener(t, onEvent);
  es.onerror = () => setConn("reconnecting");
}
function onEvent(ev) { let e; try { e = JSON.parse(ev.data); } catch { return; } term(e); apply(e); }
const ALL_EVENTS = ["run.started","probe.sent","challenge.received","quote.ready","policy.evaluated","group.composed","group.simulated","settle.retry","group.signed","group.settled","step.started","step.delivered","step.failed","step.skipped","compensation.issued","node.state","run.completed","run.error"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]));

// ── URL persistence + boot ──────────────────────────────────────────────────
chrome.storage?.local.get(["router"], (r) => { router = r.router || DEFAULT_ROUTER; $("router").value = router; });
$("save").addEventListener("click", () => {
  router = ($("router").value || DEFAULT_ROUTER).replace(/\/$/, "");
  chrome.storage?.local.set({ router }); followedRunId = null; if (es) { es.close(); es = null; }
});
view = fresh();
pollLatest();
setInterval(pollLatest, 2000);

// Chrome throttles background timers, so a run triggered from ANOTHER app
// (e.g. Claude Desktop via MCP) isn't noticed until the panel is looked at
// again. Poll immediately on refocus/visibility so it catches up at once.
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollLatest(); });
window.addEventListener("focus", pollLatest);
