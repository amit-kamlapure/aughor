/**
 * Arc BG (ROADMAP §3.66) — an edition's figures, drawn by code from what was measured.
 *
 * Every one is a Vega-Lite spec (`lib/briefingAccount.ts`) drawn by the platform's chart engine under its own config
 * (2026-11-12 — the user: "Why is the graph of some other library when we have a dedicated graph/chart library called
 * vegalite made robust?"): a figure's ranges with its usual range shaded, a bridge, segments against their usual, small
 * charts per series, a line with its mark, and a few totals side by side. A segment behind fewer than 30 rows is drawn
 * grey: too few to call. The model never draws; the server never sends a picture, only the numbers.
 */
import { resolveDeemph, resolveSeries } from "@/components/charts/palette";
import { VegaChart } from "@/components/charts/vega/VegaChart";
import type { EditionFigure } from "@/lib/api";
import { bridgeSpec, lineMarkSpec, multipleOf, multipleSpec, pairRowsSpec, progressSpec, rangeBarsSpec } from "@/lib/briefingAccount";
import { rangeWord, toneOf } from "@/lib/briefingEdition";
import { withUniqueKeys } from "@/lib/listKeys";


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

/** Where a total came from: a start, each step's change, the end — a Vega-Lite waterfall (`bridgeSpec`). */
export function Bridge({ steps, fmt }: { steps: { label: string; value: number; kind: "base" | "delta" | "total" }[];
                                         fmt: (v: number) => string }) {
  const series = resolveSeries();
  const spec = bridgeSpec(steps, fmt, { base: resolveDeemph(), total: series[0], up: series[1], down: series[3] });
  if (!spec) return null;
  return <div role="img" aria-label="bridge" data-testid="edition-bridge"><VegaChart spec={spec} tier={2} height={190} /></div>;
}

/** Where a figure stands, in the chart palette's own hues: too few to call is the quiet grey, no better way said is
 *  the first series, the better way green and the worse amber — read when drawn, so they follow the theme. */
const tones = () => {
  const series = resolveSeries();
  return { thin: resolveDeemph(), plain: series[0], good: series[1], bad: series[3] };
};

/** Segments of this range against their usual (or any comparison): a bar each over the bar it is compared with, then
 *  the two figures and the change — a Vega-Lite spec (`pairRowsSpec`). A row a control has not chosen is faded. */
export function PairRows({ rows, fmt, change, better, dim }: {
  rows: { label: string; now: number | null; base: number | null; thin?: boolean }[];
  fmt: (v: number | null) => string; change: (now: number | null, base: number | null) => string;
  better: string; dim?: (label: string) => boolean;
}) {
  const spec = pairRowsSpec(rows, { fmt, change }, better, tones(), dim);
  if (!spec) return null;
  return (
    <div role="img" data-testid="edition-pair-rows"
      aria-label={rows.map(r => `${r.label}${r.thin ? " (too few to call)" : ""}: ${fmt(r.now)} against ${fmt(r.base)}, ${change(r.now, r.base)}`).join("; ")}>
      <VegaChart spec={spec} tier={2} height={rows.length * 30 + 6} />
    </div>
  );
}

/** The same measure for each value of a series, each small chart shading its own usual range (`multipleSpec`). */
export function Multiples({ series, fmt }: { series: { name: string; points: { x: string; v: number }[] }[];
                                             fmt: (v: number) => string }) {
  const palette = tones();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(series.length, 4)}, minmax(0,1fr))`, gap: 16 }}
      data-testid="edition-multiples">
      {withUniqueKeys(series, x => x.name).map(([key, s]) => {
        const m = multipleOf(s.points);
        const col = m.tone === "below" ? "var(--amb4)" : m.tone === "above" ? "var(--grn4)" : "var(--blue4)";
        return (
          <div key={key} style={{ minWidth: 0 }}>
            <div className="aug-fs-sm" style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--t1)" }}>{s.name}</span><span style={{ color: col }}>{fmt(m.last)}</span>
            </div>
            <div role="img" aria-label={`${s.name} by period`}>
              <VegaChart spec={multipleSpec(s.points, m.tone === "below" ? palette.bad : m.tone === "above" ? palette.good : palette.plain)} tier={2} height={92} />
            </div>
            {m.band && <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>usual {fmt(m.low)}–{fmt(m.high)}</div>}
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

/** A few totals against each other — a quarter against last year's — a Vega-Lite spec (`progressSpec`). */
export function ProgressBars({ rows, fmt }: { rows: { label: string; v: number }[]; fmt: (v: number) => string }) {
  const palette = tones();
  const spec = progressSpec(rows, fmt, { first: palette.plain, rest: palette.thin });
  if (!spec) return null;
  return (
    <div role="img" data-testid="edition-progress" aria-label={rows.map(r => `${r.label}: ${fmt(r.v)}`).join("; ")}>
      <VegaChart spec={spec} tier={2} height={rows.length * 30 + 6} />
    </div>
  );
}
