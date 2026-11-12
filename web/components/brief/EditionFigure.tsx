/**
 * Arc BG (ROADMAP §3.66) — an edition's figures, drawn by code from what was measured.
 *
 * Two pictures, each showing what its story says: a figure's ranges as bars with its USUAL RANGE shaded
 * behind them (the range itself last, in the accent), and a figure's segments as the change each made on
 * its own usual — a change drawn as the change. A segment behind fewer than 30 rows is drawn grey: too
 * few to call. The model never draws; the server never sends a picture, only the numbers.
 */
import { resolveDeemph, resolveSeries } from "@/components/charts/palette";
import { VegaChart } from "@/components/charts/vega/VegaChart";
import { useMeasured } from "@/components/dashboards/cellBox";
import type { EditionFigure } from "@/lib/api";
import { lineMarkSpec, rangeBarsSpec } from "@/lib/briefingAccount";
import { rangeWord, toneOf } from "@/lib/briefingEdition";
import { withUniqueKeys } from "@/lib/listKeys";

const W = 360;

/** The width a chart is shown at — so it draws at that width, its text at the size it was written. A picture drawn at
 *  W and stretched to a block's full width doubled its labels (the live LuxExperience line chart, 2026-10-30). W until
 *  measured, and in a test's DOM. */
function useDrawnWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [ref, size] = useMeasured<HTMLDivElement>();
  return [ref, size.width > 0 ? size.width : W];
}

function dayMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The usual range, and a comparison bar: a light tint over the card, in either theme — a dark token read as a hole. */
const USUAL = "color-mix(in srgb, var(--t3) 16%, transparent)";

const TONE: Record<string, string> = { good: "var(--grn4)", bad: "var(--amb4)", neutral: "var(--blue4)" };

/** The figure's ranges as bars, the usual range shaded behind them — a Vega-Lite spec (`rangeBarsSpec`), drawn by the
 *  platform's chart engine under its own config, at the width it is shown at. */
export function RangeBars({ figure, period }: { figure: EditionFigure; period: string }) {
  const series = resolveSeries();
  const tone = { good: series[1], bad: series[3], neutral: series[0] }[toneOf(figure)] ?? series[0];
  const spec = rangeBarsSpec(figure, { current: tone, rest: resolveDeemph() });
  if (!spec) return null;
  return (
    <div role="img" data-testid="edition-range-bars" aria-label={`${figure.label} by ${rangeWord(period)}, this ${rangeWord(period)} last`}>
      <VegaChart spec={spec} tier={2} height={132} />
    </div>
  );
}

// ── Arc BC · the shapes a composed edition draws ─────────────────────────────────────────────

const STEP_FILL = { base: "var(--chart-deemph)", total: "var(--blue4)", up: "var(--grn4)", down: "var(--amb4)" };

/** Where a total came from: a start, each step's change, the end. */
export function Bridge({ steps, fmt }: { steps: { label: string; value: number; kind: "base" | "delta" | "total" }[];
                                         fmt: (v: number) => string }) {
  const [box, W] = useDrawnWidth();
  if (steps.length < 2) return null;
  const H = 210, pad = { l: 8, r: 8, t: 18, b: 34 };
  let run = 0;
  const bars = steps.map(s => {
    if (s.kind !== "delta") { run = s.value; return { ...s, a: 0, b: s.value, fill: STEP_FILL[s.kind] }; }
    const a = run; run += s.value;
    return { ...s, a, b: run, fill: s.value >= 0 ? STEP_FILL.up : STEP_FILL.down };
  });
  const hi = Math.max(...bars.map(b => Math.max(b.a, b.b)));
  const lowTop = Math.min(...bars.map(b => Math.min(b.a, b.b)).filter(v => v > 0), hi);
  const lo = Math.max(0, lowTop - (hi - lowTop) * 0.8);
  const Y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
  const bw = (W - pad.l - pad.r) / bars.length;
  return (
    <div ref={box}><svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="bridge" data-testid="edition-bridge">
      {bars.map((b, i) => {
        const x = pad.l + i * bw + bw * 0.18, w = bw * 0.64;
        const y1 = Y(Math.max(b.a, b.b)), y2 = Y(Math.max(lo, Math.min(b.a, b.b)));
        const txt = b.kind === "delta" ? `${b.value >= 0 ? "+" : "−"}${fmt(Math.abs(b.value))}` : fmt(b.value);
        return (
          <g key={`${b.label}-${i}`}>
            <rect x={x} y={y1} width={w} height={Math.max(2, y2 - y1)} rx={2} fill={b.fill} />
            <text x={x + w / 2} y={y1 - 5} textAnchor="middle" fontSize={11} fill="var(--t1)">{txt}</text>
            <text x={x + w / 2} y={H - 12} textAnchor="middle" fontSize={10.5} fill="var(--t2)">{b.label}</text>
          </g>
        );
      })}
    </svg></div>
  );
}

/** Segments of this range against their usual (or any comparison): a bar each, the comparison behind it. */
export function PairRows({ rows, fmt, change, better, dim }: {
  rows: { label: string; now: number | null; base: number | null; thin?: boolean }[];
  fmt: (v: number | null) => string; change: (now: number | null, base: number | null) => string;
  better: string; dim?: (label: string) => boolean;
}) {
  const max = Math.max(1e-9, ...rows.flatMap(r => [r.now ?? 0, r.base ?? 0].map(Math.abs)));
  return (
    <div role="table" data-testid="edition-pair-rows">
      {rows.map((r, i) => {
        const up = r.now !== null && r.base !== null && r.now >= r.base;
        const good = better === "none" ? null : up === (better === "up");
        const col = r.thin ? "var(--chart-deemph)" : good === null ? "var(--blue4)" : good ? "var(--grn4)" : "var(--amb4)";
        const faded = dim?.(r.label);
        return (
          <div role="row" key={`${r.label}-${i}`} data-faded={faded ? "true" : undefined} className="aug-fs-sm"
            style={{ display: "grid", gridTemplateColumns: "minmax(90px,160px) 1fr 76px 76px 64px", gap: 10, alignItems: "center",
                     padding: "5px 0", borderTop: "1px solid var(--b1)", opacity: faded ? 0.35 : 1 }}>
            <span style={{ color: "var(--t1)" }}>{r.label}{r.thin ? <span style={{ color: "var(--t3)" }}> · too few</span> : null}</span>
            <svg viewBox="0 0 300 16" width="100%" aria-hidden>
              <rect x={0} y={2} width={300 * Math.abs(r.base ?? 0) / max} height={12} rx={2} fill={USUAL} />
              <rect x={0} y={5} width={300 * Math.abs(r.now ?? 0) / max} height={6} rx={2} fill={col} />
            </svg>
            <span style={{ textAlign: "right", color: "var(--t1)" }}>{fmt(r.now)}</span>
            <span style={{ textAlign: "right", color: "var(--t3)" }}>{fmt(r.base)}</span>
            <span style={{ textAlign: "right", color: col }}>{change(r.now, r.base)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The same measure for each value of a series, each small chart shading its own usual range. */
export function Multiples({ series, fmt }: { series: { name: string; points: { x: string; v: number }[] }[];
                                             fmt: (v: number) => string }) {
  const w = 280, h = 92, pad = { l: 4, r: 36, t: 8, b: 14 };
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(series.length, 4)}, minmax(0,1fr))`, gap: 16 }}
      data-testid="edition-multiples">
      {withUniqueKeys(series, x => x.name).map(([key, s]) => {
        const vals = s.points.map(p => p.v);
        const usual = vals.slice(0, -1);
        const m = usual.reduce((a, c) => a + c, 0) / Math.max(1, usual.length);
        const sd = usual.length > 1 ? Math.sqrt(usual.reduce((a, c) => a + (c - m) ** 2, 0) / (usual.length - 1)) : 0;
        const lo = Math.min(...vals, m - sd), hi = Math.max(...vals, m + sd);
        const Y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
        const X = (i: number) => pad.l + (w - pad.l - pad.r) * i / Math.max(1, vals.length - 1);
        const last = vals[vals.length - 1];
        const col = last < m - sd ? "var(--amb4)" : last > m + sd ? "var(--grn4)" : "var(--blue4)";
        return (
          <div key={key}>
            <div className="aug-fs-sm" style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--t1)" }}>{s.name}</span><span style={{ color: col }}>{fmt(last)}</span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`${s.name} by period`}>
              {usual.length > 1 && <rect x={pad.l} y={Y(m + sd)} width={w - pad.l - pad.r} height={Math.max(1, Y(m - sd) - Y(m + sd))} fill={USUAL} />}
              <polyline fill="none" stroke="var(--t3)" strokeWidth={1.6} points={vals.map((v, i) => `${X(i)},${Y(v)}`).join(" ")} />
              <circle cx={X(vals.length - 1)} cy={Y(last)} r={4} fill={col} />
              <text x={w - pad.r + 4} y={Y(m) + 4} fontSize={10.5} fill="var(--t3)">usual</text>
            </svg>
            <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>usual {fmt(m - sd)}–{fmt(m + sd)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A line over the periods read, with one mark where something changed — a Vega-Lite spec (`lineMarkSpec`). */
export function LineMark({ points, fmt, mark }: { points: { x: string; v: number }[]; fmt: (v: number) => string;
                                                   mark?: { at: string; text: string } | null }) {
  const spec = lineMarkSpec(points, fmt, mark);
  if (!spec) return null;
  return <div role="img" aria-label="line" data-testid="edition-line"><VegaChart spec={spec} tier={2} height={170} /></div>;
}

/** A few totals against each other — a quarter against last year's. */
export function ProgressBars({ rows, fmt }: { rows: { label: string; v: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(1e-9, ...rows.map(r => Math.abs(r.v)));
  return (
    <div data-testid="edition-progress">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="aug-fs-sm"
          style={{ display: "grid", gridTemplateColumns: "minmax(140px,240px) 1fr 90px", gap: 10, alignItems: "center", margin: "6px 0" }}>
          <span>{r.label}</span>
          <svg viewBox="0 0 400 14" width="100%" aria-hidden>
            <rect width={400 * Math.abs(r.v) / max} height={14} rx={3} fill={i === 0 ? "var(--blue4)" : "var(--chart-deemph)"} />
          </svg>
          <span style={{ textAlign: "right", color: "var(--t1)" }}>{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}
