"use client";

/**
 * PinStrip — the ontology release a dashboard holding pieces was composed against, said above it (Arc OC-4; the study's
 * §8.7: a dashboard is checked against the release it is pinned to).
 *
 * The pieces always read what is published now. What a reader is owed is whether that is still what the dashboard was
 * built on: when a release since has changed something a piece reads — a process's promise, a rule, an action — the
 * strip names it, with the class it was published as, and the person who keeps the dashboard re-pins it once they have
 * looked. A dashboard with no piece draws no strip.
 */
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CLASS_LOOK } from "@/components/ontology/ReleaseStrip";
import type { DashboardPin } from "@/lib/api";
import { kindWord } from "@/lib/dashboards/names";
import { withUniqueKeys } from "@/lib/listKeys";

/** A release id's number: "…@6" is release 6. */
export const numberOf = (id: string) => id.slice(id.lastIndexOf("@") + 1);

export function PinStrip({ pin, spec, busy, onRepin }: {
  pin: DashboardPin;
  spec: unknown;
  busy?: boolean;
  /** Absent on a dashboard the reader may not change. */
  onRepin?: () => void;
}) {
  const elements = ((spec as { elements?: Record<string, { type?: string }> })?.elements) ?? {};
  // each piece by its kind's word, never its element key — the filter column, a figure and a chart included
  const pieceWords = (keys: string[]) => [...new Set(keys.map(k => kindWord(elements[k]?.type) || "piece"))].join(", ");
  const now = pin.current ? `release ${numberOf(pin.current)}` : "no release";
  const repin = onRepin && pin.current && (
    <Button size="xs" variant={pin.changes.length ? "secondary" : "ghost"} disabled={busy} data-testid="dashboard-repin"
      title={`Keep this dashboard as it is, composed against ${now}`} onClick={onRepin}>
      {pin.pinned ? `Re-pin to ${now}` : `Pin to ${now}`}
    </Button>
  );
  if (pin.pinned && pin.pinned === pin.current) {
    return (
      <div className="aug-fs-xs" data-testid="dashboard-pin" style={{ color: "var(--t3)", margin: "2px 0 6px", display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="layers" size={12} /> Its pieces read {now} of the ontology, the one it was composed against.
      </div>
    );
  }
  return (
    // An alert, as the mockup draws it (2026-11-10): what it was composed against is not what its pieces read now.
    <div data-testid="dashboard-pin" className="aug-fs-sm" role="status"
      style={{ border: "1px solid var(--amb3)", background: "color-mix(in srgb, var(--amb3) 9%, transparent)", borderRadius: "var(--r3)",
        padding: "8px 12px", margin: "4px 0 10px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", color: "var(--t1)" }}>
        <span style={{ color: "var(--amb4)", display: "inline-flex" }}><Icon name="warning" size={14} /></span>
        <span>
          {pin.pinned
            ? <>Composed against release {numberOf(pin.pinned)}; its pieces read {now}.{" "}
                {pin.changes.length ? `${pin.changes.length === 1 ? "One change" : `${pin.changes.length} changes`} since touch what they read:`
                  : "Nothing they read has changed since."}</>
            : <>Not pinned to a release; its pieces read {now}.</>}
        </span>
        <span style={{ marginLeft: "auto" }}>{repin}</span>
      </div>
      {pin.changes.length > 0 && (
        <ul style={{ margin: 0, padding: 0 }}>
          {withUniqueKeys(pin.changes, c => `${c.release}/${c.kind}/${c.target_id}`).map(([k, c]) => (
            <li key={k} data-testid="dashboard-pin-change" className="aug-fs-xs" style={{ listStyle: "none", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", color: "var(--t2)" }}>
              <span className={`aug-tag ${CLASS_LOOK[c.class].tag}`}>{CLASS_LOOK[c.class].label}</span>
              <span>
                {c.kind} <span style={{ fontFamily: "var(--font-mono)" }}>{c.target_id}</span> {c.change} in release {c.number}
                {" "}· read by the {pieceWords(c.pieces)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
