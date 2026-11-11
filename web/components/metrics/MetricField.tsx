"use client";

/**
 * A metric field — the connection's governed metrics as you type, and a line saying what the server will make
 * of the name (2026-11-07; the reading is `lib/metricField.ts`).
 *
 * A native `<datalist>`: the browser's own typeahead, keyboard and screen-reader behaviour, the same pattern the
 * query parameter bar uses. It stores the metric's NAME — every reader resolves a name, and the automation step
 * resolves nothing else — and a label typed by hand becomes its name when the field is left. Anything else may
 * still be typed; the line under the field says what that costs, in the surface's own words.
 */
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetrics, type Metric } from "@/lib/api";
import { withUniqueKeys } from "@/lib/listKeys";
import { metricStanding, offeredMetrics, resolveMetric, shortUnit, standingSentence } from "@/lib/metricField";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; rows: Promise<Metric[]> }>();

/** The connection's metrics ("" = every one the organisation sees), shared by every field for a minute. */
export function useConnectionMetrics(connectionId: string | undefined): { metrics: Metric[]; failed: boolean } {
  const key = connectionId || "";
  const [state, setState] = useState<{ metrics: Metric[]; failed: boolean }>({ metrics: [], failed: false });
  useEffect(() => {
    let live = true;
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.at > TTL_MS) {
      hit = { at: Date.now(), rows: getMetrics(key || undefined) };
      cache.set(key, hit);
    }
    hit.rows.then(rows => { if (live) setState({ metrics: rows, failed: false }); })
      .catch(() => { cache.delete(key); if (live) setState({ metrics: [], failed: true }); });
    return () => { live = false; };
  }, [key]);
  return state;
}

/** Drop the shared list (tests). */
export function clearMetricCache(): void { cache.clear(); }

function optionLabel(m: Metric): string {
  const status = String(m.status || "approved");
  return [m.label || m.name, shortUnit(m.unit), status === "proposed" ? "waiting for review" : status === "draft" ? "draft" : ""]
    .filter(Boolean).join(" · ");
}

export function MetricNote({ value, metrics, failed, consequence, onUse, typing = false, whenGoverned = "", style }: {
  value: string; metrics: Metric[]; failed: boolean; consequence: string; onUse: (m: Metric) => void;
  style?: React.CSSProperties;
  /** What a governed metric buys this surface, said after "approved". */
  whenGoverned?: string;
  /** While the field has focus a part-typed name is not a verdict; once it is left, it is. */
  typing?: boolean;
}) {
  if (failed) {
    return <span className="aug-fs-xs" style={{ color: "var(--t3)", ...style }} data-testid="metric-note">
      The governed metrics could not be read — the name is kept as typed.</span>;
  }
  if (!metrics.length) return null;
  const standing = metricStanding(value, metrics, { typing });
  const said = standingSentence(standing, consequence, whenGoverned);
  if (!said) return null;
  return (
    <span className="aug-fs-xs" data-testid="metric-note" data-tone={said.tone}
      style={{ color: said.tone === "warn" ? "var(--amb4)" : "var(--t3)", display: "inline-flex", flexWrap: "wrap", gap: 6,
               alignItems: "center", ...style }}>
      {said.text}
      {standing.kind === "unknown" && withUniqueKeys(standing.near, m => m.name).map(([key, m]) => (
        <Button key={key} size="xs" variant="secondary" onClick={() => onUse(m)}>Use {m.label || m.name}</Button>
      ))}
    </span>
  );
}

export function MetricField({ connectionId, value, onChange, onUnit, consequence, whenGoverned, placeholder = "a governed metric",
                              id, ariaLabel, style, className, layout = "stack" }: {
  /** "row": the field is one control in a wrapping row (a mission's objective beside its direction, target and
   *  date) — the input takes `style`, and the note is a full-width line under the whole row, not a narrow
   *  column under the input. "stack" (default): the note sits under the input. */
  layout?: "stack" | "row";
  /** What a governed metric buys this surface — "scored on the review date". */
  whenGoverned?: string;
  /** Whose metrics to offer; "" or undefined offers every one the organisation sees. */
  connectionId?: string;
  value: string;
  onChange: (name: string) => void;
  /** Called with a picked metric's unit, for a form that has a unit of its own to fill. */
  onUnit?: (unit: string) => void;
  /** What the surface cannot do without a governed metric — "the mission cannot be measured". */
  consequence: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const listId = useId();
  const { metrics, failed } = useConnectionMetrics(connectionId);
  const [typing, setTyping] = useState(false);
  const pick = (m: Metric) => {
    onChange(m.name);
    if (shortUnit(m.unit)) onUnit?.(shortUnit(m.unit));
  };
  const input = (
      <Input id={id} aria-label={ariaLabel} list={listId} value={value} placeholder={placeholder} autoComplete="off"
        onFocus={() => setTyping(true)}
        onChange={e => {
          const typed = e.target.value;
          const hit = metrics.find(m => m.name === typed);
          if (hit) pick(hit); else onChange(typed);
        }}
        // A label typed by hand is stored as its name: the automation step reads names only.
        onBlur={() => {
          setTyping(false);
          const { metric, via } = resolveMetric(value, metrics);
          if (metric && via === "label" && metric.name !== value) pick(metric);
        }}
        style={layout === "row" ? style : undefined} className={layout === "row" ? className : undefined} />
  );
  const list = (
      <datalist id={listId}>
        {withUniqueKeys(offeredMetrics(metrics), m => m.name).map(([key, m]) => (
          <option key={key} value={m.name} label={optionLabel(m)} />
        ))}
      </datalist>
  );
  const note = (s?: React.CSSProperties) => (
    <MetricNote value={value} metrics={metrics} failed={failed} consequence={consequence} onUse={pick} typing={typing}
      whenGoverned={whenGoverned} style={s} />
  );
  if (layout === "row") {
    // Three items of the row it sits in; the note is ordered last and takes the row's whole width.
    return <>{input}{list}{note({ flex: "1 1 100%", order: 99 })}</>;
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, minWidth: 0, ...style }} className={className}>
      {input}{list}{note()}
    </span>
  );
}

/** Several metrics — a kind's — as removable chips and one field that adds the next. The value stays the
 *  comma-separated text the form already sends. */
export function MetricListField({ connectionId, value, onChange, consequence, id, placeholder = "add a metric" }: {
  connectionId?: string; value: string; onChange: (text: string) => void; consequence: string; id?: string;
  placeholder?: string;
}) {
  const names = value.split(",").map(s => s.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");
  const { metrics } = useConnectionMetrics(connectionId);
  const add = (name: string) => {
    const n = name.trim();
    if (n && !names.includes(n)) onChange([...names, n].join(", "));
    setDraft("");
  };
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      {names.length > 0 && (
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }} data-testid="metric-chips">
          {names.map(n => {
            const s = metricStanding(n, metrics);
            const said = metrics.length ? standingSentence(s, consequence) : null;
            const label = "metric" in s ? (s.metric.label || s.metric.name) : n;
            return (
              <span key={n} className="aug-fs-xs" title={said?.text}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 4px 2px 8px", borderRadius: 999,
                         border: `1px solid ${said?.tone === "warn" ? "var(--amb4)" : "var(--b2)"}`,
                         color: said?.tone === "warn" ? "var(--amb4)" : "var(--t2)" }}>
                {label}
                <Button size="icon-xs" variant="ghost" aria-label={`Remove ${label}`}
                  onClick={() => onChange(names.filter(x => x !== n).join(", "))}>×</Button>
              </span>
            );
          })}
        </span>
      )}
      <span onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(resolveMetric(draft, metrics).metric?.name ?? draft); } }}>
        <MetricField id={id} connectionId={connectionId} value={draft} consequence={consequence} placeholder={placeholder}
          onChange={v => (metrics.some(m => m.name === v) ? add(v) : setDraft(v))} style={{ width: "100%", maxWidth: 420 }} />
      </span>
    </span>
  );
}
