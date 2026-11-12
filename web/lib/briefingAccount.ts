/**
 * The Briefing as a running account (2026-11-12) — the page-side reading of what the server says of a written
 * edition (`briefing/storylines.py`): where a figure stands against its usual range, the chart a storyline
 * draws, and the counts the page opens on. No judgement is made here that the server did not make: `called` is
 * the server's `outside`, and a figure read outside its range but not called is drawn as a ring, never a mark.
 */
import type { EditionFigure, EditionStoryline } from "@/lib/api";

/** 1 above its usual range, -1 below it, 0 inside it or not read against one. */
export function sideOf(f: EditionFigure): -1 | 0 | 1 {
  if (!f.usual || f.current == null) return 0;
  return f.current > f.usual.high ? 1 : f.current < f.usual.low ? -1 : 0;
}

export type Standing = "inside" | "better" | "worse" | "plain";

/** Whether being outside is the better way or the worse, by what the guide says of the figure; "plain" when
 *  nobody has said which way is good — it then carries no colour. */
export function standingOf(f: EditionFigure): Standing {
  const s = sideOf(f);
  if (!s) return "inside";
  if (f.better === "none") return "plain";
  return (s > 0) === (f.better === "up") ? "better" : "worse";
}

export const STANDING_COLOR: Record<Standing, string> = {
  inside: "var(--t3)", better: "var(--grn4)", worse: "var(--amb4)", plain: "var(--blue4)",
};

/** The usual range in the figure's own words. */
export const usualWords = (f: EditionFigure): string =>
  f.usual ? `${f.usual.low_text ?? ""}–${f.usual.high_text ?? ""}` : "";

/** Where on a 0–100 track the usual range and this range's figure sit, over the figure's own recent history. */
export function trackOf(f: EditionFigure): { low: number; high: number; at: number } | null {
  if (!f.usual || f.current == null) return null;
  const values = [...f.series.map(p => p.value).filter((v): v is number => v != null), f.usual.low, f.usual.high, f.current];
  let a = Math.min(...values), b = Math.max(...values);
  const pad = (b - a) * 0.12 || 1;
  a -= pad; b += pad;
  const pc = (v: number) => ((v - a) / (b - a)) * 100;
  return { low: pc(f.usual.low), high: pc(f.usual.high), at: pc(f.current) };
}

/** The axis words for a figure's unit — the series holds numbers, the axis says them in the figure's unit. */
function axisExpr(unit: string): string {
  if (unit.startsWith("ratio")) return "format(datum.value, '.1%')";
  if (unit === "%") return "format(datum.value, ',.1f') + '%'";
  if (unit === "days") return "format(datum.value, '.2f')";
  return "format(datum.value, ',.0f')";
}

/**
 * A figure's recent history as a Vega-Lite spec, drawn by the platform's own chart engine under its own config
 * (`charts/vega/config.ts`): the usual range as a band, the history as a line, this range's point marked. `small`
 * is the row's trend: no axes, no words.
 */
export function figureSpec(f: EditionFigure, small = false): Record<string, unknown> {
  const rows = f.series.filter(p => p.value != null).map((p, i, all) => ({
    start: p.start, value: p.value, last: i === all.length - 1, shown: f.current_text ?? "",
  }));
  const hide = { labels: false, domain: false, grid: false, ticks: false, title: null };
  const x = { field: "start", type: "temporal", title: null, axis: small ? hide : { format: "%-d %b", tickCount: Math.min(rows.length, 9) } };
  const y = { field: "value", type: "quantitative", title: null, scale: { zero: false, nice: !small },
              axis: small ? hide : { labelExpr: axisExpr(f.unit), tickCount: 4 } };
  const tooltip = [{ field: "start", type: "temporal", title: "From", format: "%-d %b %Y" },
                   { field: "value", type: "quantitative", title: f.label, format: ",.2f" }];
  return {
    data: { values: rows },
    layer: [
      ...(f.usual ? [{ data: { values: [{ low: f.usual.low, high: f.usual.high }] },
                       mark: { type: "rect", color: "#888888", opacity: 0.16 },
                       encoding: { y: { field: "low", type: "quantitative" }, y2: { field: "high" } } }] : []),
      { mark: { type: "line", point: !small, ...(small ? { strokeWidth: 1.5 } : {}) }, encoding: { x, y, tooltip } },
      { transform: [{ filter: "datum.last" }], mark: { type: "point", size: small ? 40 : 130, filled: true, opacity: 1 }, encoding: { x, y, tooltip } },
      ...(small ? [] : [{ transform: [{ filter: "datum.last" }], mark: { type: "text", align: "right", dx: -10, dy: -10, fontWeight: 600 },
                          encoding: { x, y, text: { field: "shown" } } }]),
    ],
  };
}

/** The page's opening counts: how many storylines have an owner, how many decisions are taken, how many wait. */
export function tallyOf(stories: EditionStoryline[]): { stories: number; owned: number; decided: number; decisions: number; waiting: number } {
  return {
    stories: stories.length,
    owned: stories.filter(s => s.owner).length,
    decisions: stories.filter(s => s.decision).length,
    decided: stories.filter(s => s.decision?.taken).length,
    waiting: stories.filter(s => s.waits).length,
  };
}

/** A reader's own storylines first — the ones their team owns — then the rest in the server's order. */
export function forReader(stories: EditionStoryline[], readerName: string): EditionStoryline[] {
  const mine = (s: EditionStoryline) => !!readerName && s.owner.trim().toLowerCase() === readerName.trim().toLowerCase();
  return [...stories].sort((a, b) => Number(mine(b)) - Number(mine(a)));
}

/** How the range read against its usual ranges: how many figures inside, and the outside ones, the farthest first. */
export function scoreOf(figures: EditionFigure[]): { read: number; inside: number; above: EditionFigure[]; below: EditionFigure[] } {
  const read = figures.filter(f => f.usual && f.current != null);
  const far = (f: EditionFigure) => {
    const edge = sideOf(f) > 0 ? f.usual!.high : f.usual!.low;
    return Math.abs((f.current! - edge) / ((f.usual!.high - f.usual!.low) || 1));
  };
  const out = read.filter(f => sideOf(f) !== 0).sort((a, b) => far(b) - far(a));
  return { read: read.length, inside: read.length - out.length, above: out.filter(f => sideOf(f) > 0), below: out.filter(f => sideOf(f) < 0) };
}

// ── the edition's own time-series figures, as Vega-Lite specs (2026-11-12) ──────────────────────────────────────
// The user, on a hand-drawn chart: "Why is the graph of some other library when we have a dedicated graph/chart
// library called vegalite made robust?" A figure's ranges and an edition's line were drawn as SVG by hand; they are
// specs now, drawn by `VegaChart` under the platform's chart config — one look for a chart wherever it stands.

const dayMonth = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

/** A figure's ranges as bars — the range itself last, in ``current`` — with its usual range shaded behind them. A
 *  range with no value is not drawn as zero. Null when there are fewer than two to draw. */
export function rangeBarsSpec(figure: EditionFigure, colors: { current: string; rest: string }): Record<string, unknown> | null {
  const pts = figure.series.filter(p => p.value !== null) as { label: string; start: string; value: number }[];
  if (pts.length < 2) return null;
  const u = figure.usual;
  const values = pts.map(p => p.value).concat(u ? [u.low, u.high] : []);
  const lo = Math.min(...values), hi = Math.max(...values);
  // the bars stand on a floor a little under the lowest, as they always have: a week of 645 against 600 must show
  const floor = lo - (hi - lo) * 0.35, top = hi + ((hi - lo) * 0.08 || 1);
  const rows = pts.map((p, i) => ({ when: dayMonth(p.start), order: i, value: p.value, floor, last: i === pts.length - 1 }));
  const x = { field: "when", type: "ordinal", sort: { field: "order" }, title: null, axis: { labelAngle: 0, labelOverlap: true } };
  const scale = { domain: [floor, top], zero: false, nice: false };
  const ticks = u ? { values: [u.low, u.high], labelExpr: `datum.value === ${u.low} ? ${JSON.stringify(u.low_text ?? "")} : ${JSON.stringify(u.high_text ?? "")}` }
                  : { tickCount: 3 };
  return {
    data: { values: rows },
    layer: [
      ...(u ? [{ data: { values: [{ low: u.low, high: u.high, words: "usual range" }] },
                 layer: [{ mark: { type: "rect", color: "#888888", opacity: 0.16 }, encoding: { y: { field: "low", type: "quantitative", scale }, y2: { field: "high" } } },
                         { mark: { type: "text", align: "right", baseline: "top", dx: -4, dy: 3, x: { expr: "width" } },
                           encoding: { y: { field: "high", type: "quantitative", scale }, text: { field: "words" } } }] }] : []),
      { mark: { type: "bar", cornerRadiusEnd: 2 },
        encoding: { x, y: { field: "value", type: "quantitative", scale, title: null, axis: ticks }, y2: { field: "floor" },
                    color: { condition: { test: "datum.last", value: colors.current }, value: colors.rest },
                    tooltip: [{ field: "when", type: "nominal", title: "From" }, { field: "value", type: "quantitative", title: figure.label, format: ",.2f" }] } },
    ],
  };
}

/** A line over the periods read, with one mark where something changed. ``fmt`` words the two ends of the axis and
 *  the tooltip, as the figure's unit has it. Null when there are fewer than two points. */
export function lineMarkSpec(points: { x: string; v: number }[], fmt: (v: number) => string,
                             mark?: { at: string; text: string } | null): Record<string, unknown> | null {
  if (points.length < 2) return null;
  const vals = points.map(p => p.v), lo = Math.min(...vals), hi = Math.max(...vals);
  const rows = points.map((p, i) => ({ when: dayMonth(p.x), order: i, value: p.v, shown: fmt(p.v), last: i === points.length - 1 }));
  const x = { field: "when", type: "ordinal", sort: { field: "order" }, title: null, axis: { labelAngle: 0, labelOverlap: true } };
  const y = { field: "value", type: "quantitative", title: null, scale: { zero: false },
              axis: { values: [lo, hi], labelExpr: `datum.value === ${lo} ? ${JSON.stringify(fmt(lo))} : ${JSON.stringify(fmt(hi))}` } };
  const tooltip = [{ field: "when", type: "nominal", title: "From" }, { field: "shown", type: "nominal", title: "Read" }];
  const at = mark ? points.findIndex(p => p.x === mark.at) : -1;
  return {
    data: { values: rows },
    layer: [
      { mark: { type: "line", point: true }, encoding: { x, y, tooltip } },
      { transform: [{ filter: "datum.last" }], mark: { type: "point", size: 110, filled: true, opacity: 1 }, encoding: { x, y, tooltip } },
      ...(at >= 0 && mark ? [{ data: { values: [{ when: dayMonth(mark.at), words: mark.text }] },
                               layer: [{ mark: { type: "rule", strokeDash: [3, 3], color: "#888888" }, encoding: { x: { field: "when", type: "ordinal" } } },
                                       { mark: { type: "text", baseline: "top", y: 0, dx: at > (points.length - 1) / 2 ? -5 : 5,
                                                 align: at > (points.length - 1) / 2 ? "right" : "left" },
                                         encoding: { x: { field: "when", type: "ordinal" }, text: { field: "words" } } }] }] : []),
    ],
  };
}

/** Where a total came from — a start, each step's change, the end — as a waterfall spec. A rise is ``up``, a fall
 *  ``down``; the start is quiet and the end is the accent. Every bar says its own figure in ``fmt``'s words. Null when
 *  there are fewer than two steps. */
export function bridgeSpec(steps: { label: string; value: number; kind: "base" | "delta" | "total" }[], fmt: (v: number) => string,
                           colors: { base: string; total: string; up: string; down: string }): Record<string, unknown> | null {
  if (steps.length < 2) return null;
  let run = 0;
  // a step's name on as many short lines as it needs, so three long names do not run into each other under their bars
  const lines = (label: string): string => label.split(/\s+/).reduce<string[]>((out, w) => {
    if (out.length && (out[out.length - 1] + " " + w).length <= 18) out[out.length - 1] += " " + w; else out.push(w);
    return out;
  }, []).join("\n");
  const bars = steps.map(st => ({ ...st, label: lines(st.label) })).map((s, i) => {
    if (s.kind !== "delta") { run = s.value; return { step: s.label, order: i, from: 0, to: s.value, top: s.value, tone: s.kind, shown: fmt(s.value) }; }
    const from = run; run += s.value;
    return { step: s.label, order: i, from, to: run, top: Math.max(from, run), tone: s.value >= 0 ? "up" : "down",
             shown: `${s.value >= 0 ? "+" : "−"}${fmt(Math.abs(s.value))}` };
  });
  // the bars stand on a floor under the lowest top, as they always have: a step of 9k on a total of 167k must show
  const hi = Math.max(...bars.map(b => b.top));
  const lowTop = Math.min(...bars.map(b => Math.min(b.from, b.to)).filter(v => v > 0), hi);
  const floor = Math.max(0, lowTop - (hi - lowTop) * 0.8);
  const rows = bars.map(b => ({ ...b, from: Math.max(floor, b.from), to: Math.max(floor, b.to) }));
  const x = { field: "step", type: "ordinal", sort: { field: "order" }, title: null, axis: { labelAngle: 0, labelLimit: 160, domain: false, labelExpr: "split(datum.label, '\\n')" } };
  const scale = { domain: [floor, hi + (hi - floor) * 0.12], zero: false, nice: false };
  return {
    data: { values: rows },
    layer: [
      { mark: { type: "bar", cornerRadius: 2, width: { band: 0.6 } },
        encoding: { x, y: { field: "from", type: "quantitative", scale, title: null, axis: null }, y2: { field: "to" },
                    color: { field: "tone", type: "nominal", legend: null,
                             scale: { domain: ["base", "total", "up", "down"], range: [colors.base, colors.total, colors.up, colors.down] } },
                    tooltip: [{ field: "step", type: "nominal", title: "Step" }, { field: "shown", type: "nominal", title: "Figure" }] } },
      { mark: { type: "text", baseline: "bottom", dy: -4 },
        encoding: { x, y: { field: "top", type: "quantitative", scale }, text: { field: "shown" } } },
    ],
  };
}

// ── the last three of the edition's figures, as Vega-Lite specs (2026-11-12, "Yes, move them") ──────────────────

/** An axis that draws nothing — `axis: null` on an encoding shared between layers breaks the compiler. */
const NO_AXIS = { labels: false, domain: false, grid: false, ticks: false, title: null };
export type FigureTone = "thin" | "plain" | "good" | "bad";
export interface FigureColors { thin: string; plain: string; good: string; bad: string }
const toneScale = (c: FigureColors) => ({ domain: ["thin", "plain", "good", "bad"], range: [c.thin, c.plain, c.good, c.bad] });
/** A row the reader's control did not choose is drawn quieter, never removed. */
const FADE = { condition: { test: "datum.faded", value: 0.35 }, value: 1 };

/** How a segment stands against what it is compared with: too few rows to call, no better way said, or good/bad. */
export function pairTone(now: number | null, base: number | null, better: string, thin?: boolean): FigureTone {
  if (thin) return "thin";
  if (better === "none") return "plain";
  const up = now !== null && base !== null && now >= base;
  return up === (better === "up") ? "good" : "bad";
}

/**
 * Segments of this range against their usual (or any comparison): one row each — its name, a bar over the bar it is
 * compared with, then the two figures and the change in the figure's own words. A segment behind too few rows is
 * drawn grey and says so; a row a control has not chosen is faded. The three figures stand in columns at the right,
 * so the bars keep the rest of the width.
 */
export function pairRowsSpec(rows: { label: string; now: number | null; base: number | null; thin?: boolean }[],
                             words: { fmt: (v: number | null) => string; change: (now: number | null, base: number | null) => string },
                             better: string, colors: FigureColors, dim?: (label: string) => boolean): Record<string, unknown> | null {
  if (!rows.length) return null;
  const values = rows.map((r, i) => ({
    row: r.label + (r.thin ? " · too few" : ""), order: i, now: Math.abs(r.now ?? 0), base: Math.abs(r.base ?? 0),
    nowText: words.fmt(r.now), baseText: words.fmt(r.base), changeText: words.change(r.now, r.base),
    tone: pairTone(r.now, r.base, better, r.thin), faded: !!dim?.(r.label),
  }));
  const max = Math.max(1e-9, ...values.flatMap(v => [v.now, v.base]));
  const y = { field: "row", type: "ordinal", sort: { field: "order" }, title: null,
              axis: { domain: false, ticks: false, grid: false, labelLimit: 170, labelPadding: 8 } };
  const scale = { domain: [0, max], range: [0, { expr: "max(40, width - 250)" }], nice: false };
  const column = (field: string, right: number, muted = false) => ({
    mark: { type: "text", align: "right", x: { expr: `width - ${right}` }, ...(muted ? { fillOpacity: 0.6 } : {}) },
    encoding: { y, text: { field }, opacity: FADE },
  });
  const change = column("changeText", 0);
  return {
    data: { values },
    layer: [
      { mark: { type: "bar", size: 14, cornerRadius: 2, color: "#888888", fillOpacity: 0.2 },
        encoding: { y, x: { field: "base", type: "quantitative", scale, axis: NO_AXIS }, opacity: FADE } },
      { mark: { type: "bar", size: 6, cornerRadius: 2 },
        encoding: { y, x: { field: "now", type: "quantitative", scale, axis: NO_AXIS }, opacity: FADE,
                    color: { field: "tone", type: "nominal", legend: null, scale: toneScale(colors) },
                    tooltip: [{ field: "row", type: "nominal", title: "Segment" }, { field: "nowText", type: "nominal", title: "This range" },
                              { field: "baseText", type: "nominal", title: "Against" }, { field: "changeText", type: "nominal", title: "Change" }] } },
      column("nowText", 156), column("baseText", 78, true),
      { ...change, encoding: { ...change.encoding, color: { field: "tone", type: "nominal", legend: null, scale: toneScale(colors) } } },
    ],
  };
}

/** A few totals against each other — a quarter against last year's — the first in the accent, each saying its figure. */
export function progressSpec(rows: { label: string; v: number }[], fmt: (v: number) => string,
                             colors: { first: string; rest: string }): Record<string, unknown> | null {
  if (!rows.length) return null;
  const values = rows.map((r, i) => ({ row: r.label, order: i, value: Math.abs(r.v), shown: fmt(r.v), first: i === 0 }));
  const max = Math.max(1e-9, ...values.map(v => v.value));
  const y = { field: "row", type: "ordinal", sort: { field: "order" }, title: null,
              axis: { domain: false, ticks: false, grid: false, labelLimit: 240, labelPadding: 8 } };
  return {
    data: { values },
    layer: [
      { mark: { type: "bar", size: 14, cornerRadius: 3 },
        encoding: { y, x: { field: "value", type: "quantitative", axis: NO_AXIS,
                            scale: { domain: [0, max], range: [0, { expr: "max(40, width - 100)" }], nice: false } },
                    color: { condition: { test: "datum.first", value: colors.first }, value: colors.rest },
                    tooltip: [{ field: "row", type: "nominal", title: "Total" }, { field: "shown", type: "nominal", title: "Figure" }] } },
      { mark: { type: "text", align: "right", x: { expr: "width" } }, encoding: { y, text: { field: "shown" } } },
    ],
  };
}

/** One series of a set of small charts, read against its own usual: the mean of every period before the last, a
 *  standard deviation either side. ``tone`` is where the last period stands against that band. */
export function multipleOf(points: { x: string; v: number }[]): { last: number; low: number; high: number; band: boolean; tone: "below" | "above" | "inside" } {
  const vals = points.map(p => p.v), usual = vals.slice(0, -1);
  const mean = usual.reduce((a, c) => a + c, 0) / Math.max(1, usual.length);
  const sd = usual.length > 1 ? Math.sqrt(usual.reduce((a, c) => a + (c - mean) ** 2, 0) / (usual.length - 1)) : 0;
  const last = vals[vals.length - 1];
  return { last, low: mean - sd, high: mean + sd, band: usual.length > 1, tone: last < mean - sd ? "below" : last > mean + sd ? "above" : "inside" };
}

/** One small chart of a set: the series as a line, its own usual range shaded, its last period marked in ``color``. */
export function multipleSpec(points: { x: string; v: number }[], color: string): Record<string, unknown> {
  const m = multipleOf(points);
  const values = points.map((p, i) => ({ when: dayMonth(p.x), order: i, value: p.v, last: i === points.length - 1 }));
  const x = { field: "when", type: "ordinal", sort: { field: "order" }, title: null, axis: NO_AXIS, scale: { padding: 0.1 } };
  const y = { field: "value", type: "quantitative", title: null, axis: NO_AXIS, scale: { zero: false, nice: false } };
  const tooltip = [{ field: "when", type: "nominal", title: "From" }, { field: "value", type: "quantitative", title: "Read", format: ",.2f" }];
  return {
    data: { values },
    layer: [
      ...(m.band ? [{ data: { values: [{ low: m.low, high: m.high, words: "usual" }] },
                      layer: [{ mark: { type: "rect", color: "#888888", opacity: 0.16 }, encoding: { y: { field: "low", type: "quantitative" }, y2: { field: "high" } } },
                              { mark: { type: "text", align: "right", baseline: "bottom", dy: -2, x: { expr: "width" }, fillOpacity: 0.6 },
                                encoding: { y: { field: "high", type: "quantitative" }, text: { field: "words" } } }] }] : []),
      { mark: { type: "line", strokeWidth: 1.6, color: "#888888" }, encoding: { x, y, tooltip } },
      { transform: [{ filter: "datum.last" }], mark: { type: "point", size: 70, filled: true, opacity: 1, color }, encoding: { x, y, tooltip } },
    ],
  };
}
