/**
 * Which governed metric a typed name is — the one reading every metric field shares (2026-11-07).
 *
 * The user, on the mission form: "Shouldn't the Achieve and Without damaging inputs carry the approved
 * metrics as a dropdown, or appear as the user types?" Measured on the live install: "Retention Rate" is no
 * metric on LuxExperience (the form saved it; the mission's report would have said "not measurable yet"), and
 * "Marketing ROAS" resolves to a RETIRED definition with nothing on the form saying so. Four fields took a
 * metric as free text — a mission's objective and its limit, a decision's expectation, a kind's metrics, an
 * automation's metric step — and the server reads them three ways:
 *
 * - a mission and a decision's expectation: the exact name, else the name or label normalised
 *   (`record/mission.spec_for_metric`);
 * - the automation step: the exact NAME only (`semantic/metrics.get_metric`) — a label fails it;
 * - a kind: its names lowercased against a mission's.
 *
 * So the field stores the metric's NAME (every reader resolves it) and says, under it, what the server will
 * make of what was typed — in the Semantic Layer's own words (approved, waiting for review, draft, retired).
 */
import type { Metric } from "@/lib/api";

/** What `spec_for_metric` compares (`record/mission._norm`): lowercase, every run of what is not a letter or digit
 *  one space, trimmed — "Repeat_Purchase-Rate" and "repeat purchase rate" meet; "RepeatPurchaseRate" does not, there
 *  or here. */
export function normMetric(s: string): string {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** A metric's unit as a form's unit box wants it. Definitions carry a description there — "ratio 0-1 (luxury
 *  fashion apparel typically 0.25-0.50)", "EUR, typically 300-2000…" on the live install — so the leading word. */
export function shortUnit(unit: string | null | undefined): string {
  return (unit || "").trim().split(/[\s,(;]/)[0] || "";
}

/** The metric a typed name resolves to, the server's way: the exact name, else the name or label normalised. */
export function resolveMetric(typed: string, metrics: Metric[]): { metric: Metric | null; via: "name" | "label" | null } {
  const t = (typed || "").trim();
  if (!t) return { metric: null, via: null };
  const exact = metrics.find(m => m.name === t);
  if (exact) return { metric: exact, via: "name" };
  const n = normMetric(t);
  const loose = metrics.find(m => normMetric(m.name) === n || normMetric(m.label) === n);
  return loose ? { metric: loose, via: "label" } : { metric: null, via: null };
}

export type MetricStanding =
  | { kind: "empty" }
  | { kind: "governed"; metric: Metric }
  | { kind: "unmeasured"; metric: Metric; why: string }
  | { kind: "review"; metric: Metric }
  | { kind: "draft"; metric: Metric }
  | { kind: "retired"; metric: Metric }
  | { kind: "partial"; matches: number }
  | { kind: "unknown"; near: Metric[] };

type Measured = Metric & { measurable?: boolean; measurable_why?: string };

export function metricStanding(typed: string, metrics: Metric[], { typing = false }: { typing?: boolean } = {}): MetricStanding {
  if (!(typed || "").trim()) return { kind: "empty" };
  const { metric } = resolveMetric(typed, metrics);
  if (!metric) {
    // Mid-word ("rep") is not a verdict: say how many the list holds, and warn only when none would do.
    const n = normMetric(typed);
    const matches = offeredMetrics(metrics).filter(m => normMetric(m.name).includes(n) || normMetric(m.label).includes(n)).length;
    return matches && typing ? { kind: "partial", matches } : { kind: "unknown", near: nearMetrics(typed, metrics) };
  }
  const status = String(metric.status || "approved");
  if (status === "deprecated") return { kind: "retired", metric };
  if (status === "proposed") return { kind: "review", metric };
  if (status === "draft") return { kind: "draft", metric };
  const m = metric as Measured;
  if (m.measurable === false) return { kind: "unmeasured", metric, why: m.measurable_why || "its dates cannot bound its rows" };
  return { kind: "governed", metric };
}

function trigrams(s: string): Set<string> {
  const t = `  ${normMetric(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Approved metrics a typo is close to — only close ones: a name that merely shares "rate" is not offered,
 *  because "Retention Rate → Item Return Rate" would read as an answer and is not one. */
export function nearMetrics(typed: string, metrics: Metric[], min = 0.45): Metric[] {
  const a = trigrams(typed);
  const score = (m: Metric) => {
    const best = Math.max(...[m.name, m.label].map(x => {
      const b = trigrams(x);
      let shared = 0;
      for (const g of a) if (b.has(g)) shared++;
      return shared / (a.size + b.size - shared || 1);
    }));
    return best;
  };
  return metrics
    .filter(m => String(m.status || "approved") === "approved")
    .map(m => ({ m, s: score(m) }))
    .filter(x => x.s >= min)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2)
    .map(x => x.m);
}

/** What the dropdown offers, in the order a reader meets them: approved, then waiting for review, then drafts.
 *  Retired definitions are not offered — typed, they are named as retired. */
export function offeredMetrics(metrics: Metric[]): Metric[] {
  const rank = (m: Metric) => ({ approved: 0, proposed: 1, draft: 2 } as Record<string, number>)[String(m.status || "approved")] ?? 9;
  return metrics.filter(m => rank(m) < 9)
    .sort((a, b) => rank(a) - rank(b) || (a.label || a.name).localeCompare(b.label || b.name));
}

/** The sentence under the field. `consequence` is the surface's own: what it cannot do without a governed metric. */
export function standingSentence(s: MetricStanding, consequence: string,
                                 whenGoverned = ""): { tone: "quiet" | "warn"; text: string } | null {
  switch (s.kind) {
    case "empty": return null;
    case "governed": return { tone: "quiet", text: `${s.metric.label || s.metric.name}${shortUnit(s.metric.unit) ? ` · ${shortUnit(s.metric.unit)}` : ""} · approved${whenGoverned ? ` — ${whenGoverned}` : ""}` };
    case "unmeasured": return { tone: "warn", text: `${s.metric.label || s.metric.name} is approved, but it cannot be measured for a period: ${s.why}` };
    case "review": return { tone: "warn", text: `${s.metric.label || s.metric.name} is waiting for review — ${consequence} until it is approved` };
    case "draft": return { tone: "warn", text: `${s.metric.label || s.metric.name} is a draft — ${consequence} until it is approved` };
    case "retired": return { tone: "warn", text: `${s.metric.label || s.metric.name} is retired in the Semantic Layer — it still resolves, but nobody maintains it; pick its replacement` };
    case "partial": return { tone: "quiet", text: `${s.matches} governed metric${s.matches === 1 ? "" : "s"} match — pick one from the list` };
    case "unknown": return { tone: "warn", text: `Not a governed metric here — ${consequence}` };
  }
}
