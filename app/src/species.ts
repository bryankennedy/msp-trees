// Species Index (Plate II) — tallies every recorded common name across the full
// dataset, renders a log-scale abundance histogram and a full count table, and
// flags the scarce species. Vanilla TS + inline SVG to stay dependency-free and
// on-aesthetic with the vellum plate.
import "./analytics";
import "./styles.css";
import {
  colorOf,
  isPlaceholder,
  RARE_THRESHOLD,
  SINGLETON_THRESHOLD,
} from "./taxonomy";

type Row = { name: string; count: number };

const $ = (id: string) => document.getElementById(id);

const setText = (id: string, s: string) => {
  const el = $(id);
  if (el) el.textContent = s;
};

const fmt = (n: number) => n.toLocaleString();

type Counts = { total: number; counts: Row[] };

async function load(): Promise<Counts> {
  // Prefer the pre-aggregated counts (a few KB) produced by the pipeline. Fall
  // back to counting the sample GeoJSON client-side only if that file is missing,
  // so the page still renders (approximately) rather than blanking.
  try {
    const r = await fetch("/data/species-counts.json");
    if (r.ok) return await r.json();
  } catch { /* fall through to the sample */ }

  const r = await fetch("/data/trees.sample.geojson");
  if (!r.ok) throw new Error("no data source reachable");
  const fc: { features: Array<{ properties: Record<string, unknown> }> } = await r.json();
  const counts = new Map<string, number>();
  for (const f of fc.features) {
    const raw = f.properties?.spp_com;
    const name = raw == null || raw === "" ? "(unrecorded)" : String(raw).trim();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    total: fc.features.length,
    counts: [...counts.entries()].map(([name, count]) => ({ name, count })),
  };
}

// Split the raw name→count list into living species vs. non-tree placeholders,
// sorted most→least common. (The pipeline already sorts, but re-sorting keeps
// this correct for the client-counted fallback path too.)
function classify(data: Counts) {
  const all: Row[] = [...data.counts].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const species = all.filter((r) => !isPlaceholder(r.name));
  const placeholders = all.filter((r) => isPlaceholder(r.name));
  return { total: data.total, all, species, placeholders };
}

// --- Log-scale histogram (inline SVG) -------------------------------------
function renderHistogram(species: Row[]): void {
  const host = $("histogram");
  if (!host) return;

  const W = 960;
  const H = 320;
  const m = { top: 16, right: 16, bottom: 28, left: 44 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;

  const max = species[0]?.count ?? 1;
  // Axis runs from 1 to the next power of ten above the max.
  const topPow = Math.ceil(Math.log10(max + 0.0001));
  const yMaxLog = topPow; // log10 domain upper bound
  const y = (v: number) => plotH - (Math.log10(Math.max(v, 1)) / yMaxLog) * plotH;

  const n = species.length;
  const slot = plotW / n;
  const barW = Math.max(0.7, slot * 0.82);

  const bars = species
    .map((r, i) => {
      const x = m.left + i * slot + (slot - barW) / 2;
      const yy = m.top + y(r.count);
      const h = m.top + plotH - yy;
      const fill = colorOf(r.name);
      return `<rect x="${x.toFixed(2)}" y="${yy.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(
        2,
      )}" fill="${fill}"><title>${escapeAttr(r.name)} — ${fmt(r.count)}</title></rect>`;
    })
    .join("");

  const grid: string[] = [];
  for (let p = 0; p <= topPow; p++) {
    const v = Math.pow(10, p);
    const gy = m.top + y(v);
    grid.push(
      `<line x1="${m.left}" x2="${m.left + plotW}" y1="${gy.toFixed(2)}" y2="${gy.toFixed(
        2,
      )}" class="histo-grid" />`,
    );
    grid.push(
      `<text x="${m.left - 8}" y="${(gy + 3).toFixed(2)}" class="histo-tick">${fmt(v)}</text>`,
    );
  }

  const baselineY = m.top + plotH;
  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="histo-svg" role="img"
         aria-label="Log-scale histogram of tree species abundance">
      ${grid.join("")}
      ${bars}
      <line x1="${m.left}" x2="${m.left + plotW}" y1="${baselineY}" y2="${baselineY}" class="histo-axis" />
      <text x="${m.left}" y="${H - 6}" class="histo-axis-label">most common →</text>
      <text x="${m.left + plotW}" y="${H - 6}" text-anchor="end" class="histo-axis-label">least common</text>
    </svg>`;

  setText(
    "histo-caption",
    `${fmt(n)} living species. Tallest bar: ${escapeText(species[0]?.name ?? "—")} (${fmt(
      max,
    )}). Bars are tinted by genus, matching the map.`,
  );
}

// --- Summary cards --------------------------------------------------------
function renderSummary(d: ReturnType<typeof classify>): void {
  const host = $("report-summary");
  if (!host) return;
  const livingTrees = d.species.reduce((s, r) => s + r.count, 0);
  const rare = d.species.filter((r) => r.count <= RARE_THRESHOLD).length;
  const singles = d.species.filter((r) => r.count <= SINGLETON_THRESHOLD).length;

  const cards = [
    { big: fmt(d.species.length), label: "distinct living species" },
    { big: fmt(d.placeholders.length), label: "non-tree record types" },
    { big: fmt(livingTrees), label: "living trees tallied" },
    { big: fmt(rare), label: `species with ≤ ${RARE_THRESHOLD} trees` },
    { big: fmt(singles), label: "singletons (just one)" },
  ];
  host.innerHTML = cards
    .map((c) => `<div class="stat"><div class="stat-num">${c.big}</div><div class="stat-label">${c.label}</div></div>`)
    .join("");

  setText("species-count", fmt(d.species.length));
  setText("tree-total", fmt(d.total));
}

// --- Table ----------------------------------------------------------------
function renderTable(d: ReturnType<typeof classify>): void {
  const body = $("tally-body");
  if (!body) return;
  const rows: string[] = [];

  d.species.forEach((r, i) => {
    const cls =
      r.count <= SINGLETON_THRESHOLD ? "is-single" : r.count <= RARE_THRESHOLD ? "is-rare" : "";
    const share = ((r.count / d.total) * 100).toFixed(r.count / d.total < 0.001 ? 3 : 2);
    rows.push(rowHtml(i + 1, r, share, cls, colorOf(r.name)));
  });

  if (d.placeholders.length) {
    rows.push(
      `<tr class="tally-divider"><td colspan="4">Non-tree records (excluded from the species count)</td></tr>`,
    );
    d.placeholders.forEach((r) => {
      const share = ((r.count / d.total) * 100).toFixed(2);
      rows.push(rowHtml("—", r, share, "is-placeholder", colorOf(r.name)));
    });
  }
  body.innerHTML = rows.join("");
}

function rowHtml(rank: number | string, r: Row, share: string, cls: string, color: string): string {
  return `<tr class="${cls}">
    <td class="col-rank">${rank}</td>
    <td class="col-name"><span class="dot" style="background:${color}"></span>${escapeText(r.name)}</td>
    <td class="col-count">${fmt(r.count)}</td>
    <td class="col-share">${share}%</td>
  </tr>`;
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

// --- Boot -----------------------------------------------------------------
(async () => {
  try {
    const data = await load();
    const d = classify(data);
    renderSummary(d);
    renderHistogram(d.species);
    renderTable(d);
    $("report-status")?.setAttribute("hidden", "");
    $("report-body")?.removeAttribute("hidden");
  } catch (e) {
    setText("report-status", "Could not load the tree dataset. Is the dev server serving /data?");
    console.error("[species] load failed", e);
  }
})();
