/**
 * The chart of a Pramanyx answer, drawn in the coworker's page by the SAME resolver the app, the PDF and
 * `POST /charts/svg` use (`web/components/charts/vega`). This file adds a place to draw, not a way to draw: the
 * steps below are `web/scripts/chart-ssr-entry.ts`'s, with a live view in place of an SVG string.
 */
import * as vega from "vega";
import * as vl from "vega-lite";
import { Handler } from "vega-tooltip";
import { resolveVegaSpec } from "@/components/charts/vega/resolveSpec";
import { resolveTier3Spec, TIER3_TYPES } from "@/components/charts/vega/tier3";
import { availableChartTypes, classifyColumns, inferChartType, CHART_TYPE_LABEL, TYPE_TO_HINT } from "@/components/charts/chartTypeInference";
import { buildVegaConfig, buildVegaRuntimeConfig, readVegaTokens } from "@/components/charts/vega/config";
import { namesOf } from "@/components/charts/vega/names";
import { cleanLabel } from "@/lib/format";

/** What a person chose in "Edit visualization". Every field is optional: none set is the chart as it was answered. */
export interface Viz {
  type?: string;
  x?: string;
  y?: string;
  color?: string;
  labels?: boolean;
  tooltip?: boolean;
  orient?: "vertical" | "horizontal" | "";
}

/**
 * What the editor may offer for a grid, from the app's own vocabulary (`chartTypeInference`): the chart types this
 * grid can honestly be drawn as, the columns that can be an axis, and the ones that can be measured.
 */
export function vizChoices(columns: string[], rows: unknown[][]) {
  const { dateIdxs, numericIdxs, catIdxs } = classifyColumns(columns, rows);
  const labels = CHART_TYPE_LABEL as Record<string, string>;
  return {
    types: availableChartTypes(columns, rows).map((v) => ({ v: String(v), t: labels[v] ?? String(v) })),
    dimensions: [...dateIdxs, ...catIdxs].map((i) => columns[i]),
    measures: numericIdxs.map((i) => columns[i]),
  };
}

/** Which columns are numbers, as the app's chart classifies them: a warehouse hands a decimal back as text. */
export function numericColumns(columns: string[], rows: unknown[][]): boolean[] {
  const numeric = new Set(classifyColumns(columns, rows).numericIdxs);
  return columns.map((_, i) => numeric.has(i));
}

/** A column's name as the app reads it to a person: `total_gmv_eur` → "Total GMV Eur". */
export const labelOf = (column: string): string => cleanLabel(column);

/** The grid as the editor's axis choices arrange it: the chosen axis first, then the colour, then what is measured. */
function arranged(columns: string[], rows: unknown[][], viz?: Viz | null) {
  const at = (name?: string) => (name ? columns.indexOf(name) : -1);
  if (!viz || (at(viz.x) < 0 && at(viz.color) < 0)) return { columns, rows };
  const { dateIdxs, numericIdxs, catIdxs } = classifyColumns(columns, rows);
  const x = at(viz.x) >= 0 ? at(viz.x) : (dateIdxs[0] ?? catIdxs[0] ?? 0);
  const keep = [x];
  if (at(viz.color) >= 0 && at(viz.color) !== x) keep.push(at(viz.color));
  const measured = at(viz.y) >= 0 ? [at(viz.y)] : numericIdxs;
  for (const i of measured) if (!keep.includes(i)) keep.push(i);
  return { columns: keep.map((i) => columns[i]), rows: rows.map((r) => keep.map((i) => r[i])) };
}

export interface ChartRequest {
  viz?: Viz | null;
  columns: string[];
  rows: unknown[][];
  chart_type?: string | null;
  chart_config?: Record<string, unknown> | null;
  column_units?: Record<string, string> | null;
  title?: string | null;
}

/** `rgb(r, g, b)` at an alpha, or null when the page states its colour another way. */
function fade(colour: string, alpha: number): string | null {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(colour);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : null;
}

/** The first painted background at or above an element: what a mark's seam must match. */
function groundOf(el: Element): string | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
  }
  return null;
}

/**
 * The app's tokens, with the frame (text, axis, grid, ground) taken from the page the chart sits in. The series
 * palette stays Pramanyx's: a colour is data. The frame is the host's, so the chart reads on its light theme and
 * its dark one.
 */
function tokensFor(el: Element) {
  const base = readVegaTokens(el);
  const ink = getComputedStyle(el).color;
  const t3 = fade(ink, 0.66), axis = fade(ink, 0.38), grid = fade(ink, 0.12);
  if (!t3 || !axis || !grid) return base;
  return { ...base, t1: ink, t3, axis, tick: axis, grid, surface: groundOf(el) ?? base.surface };
}

/**
 * Draw one chart into `el`. Returns the function that removes it, or null when the data has no honest chart —
 * the verdict every other Pramanyx surface reaches for the same grid.
 */
export function drawChart(el: HTMLElement, req: ChartRequest): (() => void) | null {
  const viz = req.viz ?? null;
  const { columns, rows } = arranged(req.columns ?? [], req.rows ?? [], viz);
  const hints = TYPE_TO_HINT as Record<string, string>;
  let chartType = viz?.type ? (hints[viz.type] ?? viz.type) : String(req.chart_type ?? "auto");
  if (chartType === "auto") {
    const inferred = inferChartType(columns, rows);
    if (inferred && TIER3_TYPES.has(inferred.type)) chartType = inferred.type;
  }
  // The base map is fetched from the app's own origin, which this page is not.
  if (chartType === "choropleth" || chartType === "point_map" || chartType === "point-map") return null;

  const tokens = tokensFor(el);
  const width = Math.max(320, Math.floor(el.clientWidth || 640));
  let runtime: ReturnType<typeof vega.parse>;

  const t3 = resolveTier3Spec({ columns, rows, chartType, title: req.title ?? null });
  if (t3) {
    const height = Math.min(Math.max(t3.defaultH, 200), 420);
    runtime = vega.parse({ ...t3.spec, width, height } as Parameters<typeof vega.parse>[0],
                         buildVegaRuntimeConfig(tokens) as Parameters<typeof vega.parse>[1]);
  } else {
    const resolved = resolveVegaSpec({
      columns, rows, chartType,
      names: namesOf(req.chart_config ?? undefined),
      exhibit: null,
      columnUnits: req.column_units ?? null,
      showLabels: viz?.labels !== false,
      orient: viz?.orient ? viz.orient : null,
      measure: viz?.y && columns.includes(viz.y) ? viz.y : null,
      title: req.title ?? null,
    });
    if (!resolved) return null;
    const height = Math.min(Math.max(resolved.defaultH, 200), 420);
    const compiled = vl.compile({ ...resolved.spec, width, height } as Parameters<typeof vl.compile>[0],
                                { config: buildVegaConfig(tokens) }).spec;
    runtime = vega.parse(compiled);
  }

  const view = new vega.View(runtime, { renderer: "svg", container: el, hover: true });
  if (viz?.tooltip !== false) view.tooltip(new Handler().call);
  void view.runAsync();
  return () => view.finalize();
}
