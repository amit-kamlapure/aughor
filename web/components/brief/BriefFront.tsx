"use client";

/**
 * The Briefing's front (2026-11-10, ROADMAP §6 item 64 — the user: "lead figure, then ranked evidence"): one figure for
 * the range, as large as the page's figures get, then the evidence ranked — every approved metric by the size of its
 * change, what the platform has recorded lately, and what waits on a person — and only then the written edition, as it
 * was. Nothing here is written by a model:
 *
 *   · the figures are the Briefing's own measured table for the range (`measureRange`, the read the Metrics dashboard
 *     makes — a cached measure says so, with when it was measured);
 *   · the trends and the queue are the desk's (`getBriefingDesk`): what the Record and the metric registry already
 *     hold — no warehouse query, no model call.
 *
 * A read that fails says so in its place, and a store the desk could not read is named — never an empty table that
 * reads as "nothing happened".
 */
import { useEffect, useMemo, useState } from "react";

import { Chip } from "@/components/clarity/kit";
import { openDeskAction } from "@/components/brief/BriefPaper";
import { Button } from "@/components/ui/button";
import { ChromeStatus } from "@/components/shell/PageChrome";
import { Freshness } from "@/components/ui/freshness";
import {
  getBriefingDesk, measureRange,
  type BriefingDesk, type BriefingRange, type BriefingRangeMeasure, type DeskItem, type RangeMeasuresResponse,
} from "@/lib/api";
import { periodShort } from "@/lib/dashboards/figures";
import { countNoun, formatCount, formatMetricValue, formatVariance, utcDayWords } from "@/lib/format";
import { withUniqueKeys } from "@/lib/listKeys";

const STATUS: Record<BriefingRangeMeasure["status"], { label: string; tone?: "amber" }> = {
  final: { label: "Final" }, provisional: { label: "Provisional", tone: "amber" }, to_date: { label: "So far", tone: "amber" },
};
const KIND: Record<string, string> = {
  answer: "Answer", inquiry: "Question", disagree: "Dispute", lag: "Data lag", metric: "Metric", unmeasured: "Not measured",
  undated: "No date", waiting: "Waiting for data", proposed_run: "Proposed deep analysis", proposed_metric: "Proposed metric",
};

const TH: React.CSSProperties = { textAlign: "left", fontWeight: 500, color: "var(--t3)", padding: "4px 12px 6px 0",
  borderBottom: "1px solid var(--b1)", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "7px 12px 7px 0", borderBottom: "1px solid var(--b0)", verticalAlign: "top", color: "var(--t2)" };
const NUM: React.CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
const HEAD: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 0 8px" };

/** One part of the front, framed as the mockup frames its widgets: a head (its name, what it is, its badges at the
 *  right), then what it holds. */
function Part({ title, kind, badges, children, testid }: {
  title: string; kind?: React.ReactNode; badges?: React.ReactNode; children: React.ReactNode; testid?: string;
}) {
  return (
    <section data-testid={testid} style={{ border: "1px solid var(--b1)", borderRadius: "var(--r3)", background: "var(--bg-1)",
      padding: "12px 14px", margin: "12px 0 0" }}>
      <div style={HEAD}>
        <h2 className="aug-fs-ui" style={{ margin: 0, color: "var(--t1)", fontWeight: 600 }}>{title}</h2>
        {kind && <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>{kind}</span>}
        {badges && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>{badges}</span>}
      </div>
      {children}
    </section>
  );
}

/** The figure a measure shows: the server's own words for it, else the number. */
const shown = (m: BriefingRangeMeasure, which: "current" | "previous") =>
  (which === "current" ? m.current_text : m.previous_text) || formatMetricValue(m[which]);

/** The lead: the guide's first check's metric when it was measured, else the first measured. */
export function leadOf(measured: BriefingRangeMeasure[], leadMetric?: string): BriefingRangeMeasure | null {
  const usable = measured.filter(m => m.current != null);
  return usable.find(m => leadMetric && m.metric === leadMetric) ?? usable[0] ?? null;
}

/** Every measure but the lead, the largest change first; one not compared goes last, in the table's own order. */
export function rankedBy(measured: BriefingRangeMeasure[], lead: BriefingRangeMeasure | null): BriefingRangeMeasure[] {
  return measured.filter(m => m !== lead)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m.rel == null ? -1 : Math.abs(b.m.rel)) - (a.m.rel == null ? -1 : Math.abs(a.m.rel)) || a.i - b.i)
    .map(x => x.m);
}

export function BriefFront({ connectionId, schema, workspaceId, range, leadMetric }: {
  connectionId: string;
  schema?: string;
  workspaceId?: string;
  range: BriefingRange;
  /** The guide's first check's metric — the figure the guide puts first. */
  leadMetric?: string;
}) {
  const [measures, setMeasures] = useState<{ data: RangeMeasuresResponse | null; error?: string } | null>(null);
  const [desk, setDesk] = useState<{ data: BriefingDesk | null; error?: string } | null>(null);
  const rangeKey = JSON.stringify(range);

  useEffect(() => {
    let alive = true;
    setMeasures(null);
    measureRange(connectionId, range, schema, workspaceId)
      .then(d => { if (alive) setMeasures({ data: d }); })
      .catch(e => { if (alive) setMeasures({ data: null, error: e instanceof Error ? e.message : "could not be read" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the range is read through its key
  }, [connectionId, schema, workspaceId, rangeKey]);
  useEffect(() => {
    let alive = true;
    setDesk(null);
    getBriefingDesk(connectionId, range, schema, workspaceId)
      .then(d => { if (alive) setDesk({ data: d }); })
      .catch(e => { if (alive) setDesk({ data: null, error: e instanceof Error ? e.message : "could not be read" }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the range is read through its key
  }, [connectionId, schema, workspaceId, rangeKey]);

  const block = measures?.data?.period ?? null;
  // The range and the one before in their short words ("5–11 Oct"), the long ones on hover.
  const now = block ? periodShort(block.start, block.end, block.period) || block.covers : "";
  const before = block ? periodShort(block.previous_start, block.previous_end, block.period) || block.compared_with : "";
  const lead = useMemo(() => leadOf(block?.measured ?? [], leadMetric), [block, leadMetric]);
  const ranked = useMemo(() => rankedBy(block?.measured ?? [], lead), [block, lead]);
  const waiting = desk?.data ? [...(desk.data.gaps?.items ?? []), ...(desk.data.decide?.items ?? [])] : [];
  const waitingMore = (desk?.data?.gaps?.more ?? 0) + (desk?.data?.decide?.more ?? 0);
  const disputes = waiting.filter(w => w.kind === "disagree").length;

  // In short — counted, never written: the lead's move, what was recorded, what waits. Said once both reads are in.
  const short = measures && desk && !measures.error && !desk.error ? [
    lead && lead.rel != null ? `${lead.name} ${formatVariance(lead.rel)} against ${before}.` : "",
    desk.data?.trends ? `${countNoun((desk.data.trends.items.length) + desk.data.trends.more, "answer or finding", "answers and findings")} recorded in the last 30 days.` : "",
    desk.data && (desk.data.gaps || desk.data.decide)
      ? `${countNoun(waiting.length + waitingMore, "thing waits", "things wait")} on a person${disputes ? `, ${countNoun(disputes, "dispute")} among them` : ""}.` : "",
    ranked.length ? `${countNoun(ranked.filter(m => m.rel != null && Math.abs(m.rel) >= 0.1).length, "other metric")} moved 10% or more.` : "",
  ].filter(Boolean).join(" ") : "";

  return (
    <div data-testid="brief-front">
      <ChromeStatus>
        {desk?.data && <span>Desk read {utcDayWords(desk.data.as_of, true)} · no model call</span>}
        {block && block.lag_days > 1 && <span>Data read {countNoun(block.lag_days, "day")} behind</span>}
      </ChromeStatus>
      {/* The range's honesty first, as the mockup opens: recent days still being redrawn are said before any figure. */}
      {block && block.lag_days > 1 && (
        <div role="status" data-testid="brief-redrawn" className="aug-fs-sm"
          style={{ border: "1px solid var(--amb3)", background: "color-mix(in srgb, var(--amb3) 9%, transparent)",
            borderRadius: "var(--r3)", padding: "8px 12px", margin: "12px 0 0", color: "var(--t1)" }}>
          <b style={{ fontWeight: 600 }}>Recent days are still being redrawn.</b>{" "}
          {block.settling?.says || `${block.still_moving.join(", ") || "The data"} still changes for ${block.lag_days - 1} days after a day ends`}
          {` — so the Briefing reads ${countNoun(block.lag_days, "day")} behind, and ${now} is the range it can stand behind.`}
        </div>
      )}
      {short && (
        <Part title="In short" testid="brief-short-part"
          badges={<span className="aug-fs-xs" style={{ color: "var(--t3)", border: "1px solid var(--b1)", borderRadius: "var(--r1)", padding: "0 6px" }}
            title="Counted from the measured table and the desk — no model and no person wrote it">Computed</span>}>
          <p className="aug-fs-sm" data-testid="brief-short" style={{ margin: 0, color: "var(--t2)" }}>{short}</p>
        </Part>
      )}
      {/* the lead figure */}
      <section data-testid="brief-lead" style={{ border: "1px solid var(--b1)", borderRadius: "var(--r3)", background: "var(--bg-1)",
        padding: "12px 14px", margin: "12px 0 0" }}>
        {measures === null ? (
          <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: 0 }}>Measuring the range…</p>
        ) : measures.error ? (
          <p className="aug-fs-sm" style={{ color: "var(--amb4)", margin: 0 }}>The range&apos;s figures could not be read — {measures.error}.</p>
        ) : block?.unreachable ? (
          <p className="aug-fs-sm" style={{ color: "var(--t2)", margin: 0 }}>The data could not be reached, so nothing was measured — {block.unreachable}.</p>
        ) : !lead ? (
          <p className="aug-fs-sm" style={{ color: "var(--t2)", margin: 0 }}>
            No approved metric is measured for {block?.covers || "this range"} — approve one in the Semantic Layer and it leads here.
          </p>
        ) : (
          <>
            <div className="aug-fs-sm" style={{ color: "var(--t2)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: "var(--t1)", fontWeight: 600 }}>{lead.name}</span>
              <span title={block?.covers}>· {now}</span>
              <Chip tone={STATUS[lead.status]?.tone} title={lead.current_partial || undefined}>{STATUS[lead.status]?.label ?? lead.status}</Chip>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "4px 0 2px" }}>
              <span data-testid="brief-lead-value" className="aug-fs-display"
                style={{ color: "var(--t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{shown(lead, "current")}</span>
              {lead.rel != null ? (
                // The sign only, never a colour: a rise is good news for revenue and bad news for a return rate, and the
                // measure does not say which way is better.
                <span className="aug-fs-ui" style={{ color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>
                  {formatVariance(lead.rel)} <span style={{ color: "var(--t3)" }} title={block?.compared_with}>against {before} ({shown(lead, "previous")})</span>
                </span>
              ) : (
                <span className="aug-fs-sm" style={{ color: "var(--t3)" }}>
                  not compared{block?.compare_withheld ? ` — ${block.compare_withheld}` : ""}
                </span>
              )}
            </div>
            <Freshness state={measures.data?.from_briefing ? "cached" : "live"} at={measures.data?.measured_at}
              verb={measures.data?.from_briefing ? "as the Briefing measured it," : "measured"} />
          </>
        )}
      </section>

      {/* every other figure, the largest change first */}
      {block && (ranked.length > 0 || block.unmeasured.length > 0) && (
        <Part testid="brief-ranked" title="Changes, ranked"
          kind={<span title={block.covers}>every approved metric for {now}, the largest change first</span>}
          badges={<Freshness state={measures?.data?.from_briefing ? "cached" : "live"} at={measures?.data?.measured_at}
            verb={measures?.data?.from_briefing ? "as the Briefing measured it," : "measured"} />}>
          <table className="aug-fs-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>Metric</th>
                <th style={{ ...TH, textAlign: "right" }} title={block.covers}>{now}</th>
                <th style={{ ...TH, textAlign: "right" }} title={block.compared_with}>{before}</th>
                <th style={{ ...TH, textAlign: "right" }}>Change</th>
                <th style={TH}>State</th>
              </tr>
            </thead>
            <tbody>
              {withUniqueKeys(ranked, m => m.metric || m.name).map(([k, m]) => (
                <tr key={k} data-testid="brief-ranked-row">
                  <td style={{ ...TD, color: "var(--t1)" }}>{m.name}</td>
                  <td style={{ ...TD, ...NUM, color: "var(--t1)" }}>{m.current != null ? shown(m, "current") : "—"}</td>
                  <td style={{ ...TD, ...NUM }}>{m.previous != null ? shown(m, "previous") : "—"}</td>
                  <td style={{ ...TD, ...NUM, color: m.rel == null ? "var(--t3)" : "var(--t1)" }}>
                    {m.rel != null ? formatVariance(m.rel) : "not compared"}
                  </td>
                  <td style={TD}><Chip tone={STATUS[m.status]?.tone}>{STATUS[m.status]?.label ?? m.status}</Chip></td>
                </tr>
              ))}
              {withUniqueKeys(block.unmeasured, u => u.metric || u.name).map(([k, u]) => (
                <tr key={`u-${k}`} data-testid="brief-unmeasured-row">
                  <td style={{ ...TD, color: "var(--t1)" }}>{u.name}</td>
                  <td colSpan={4} style={{ ...TD, color: "var(--t3)" }}>not measured — {u.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Part>
      )}

      {/* what the platform recorded lately, newest first, and what waits on a person — the desk's, never a model's */}
      {desk === null ? (
        <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: "14px 0 0" }}>Reading the desk…</p>
      ) : desk.error ? (
        <p className="aug-fs-sm" style={{ color: "var(--amb4)", margin: "14px 0 0" }}>The desk could not be read — {desk.error}.</p>
      ) : desk.data && (
        <>
          <DeskTable title="Recorded lately" sub="answers and findings from the last 30 days, newest first" testid="brief-trends"
            items={desk.data.trends?.items ?? null} more={desk.data.trends?.more ?? 0} connectionId={connectionId}
            empty="No answer or finding was recorded in the last 30 days." />
          <DeskTable title="What waits on a person" sub="disputes, gaps and proposals, each with its next step" testid="brief-waiting"
            items={desk.data.gaps === null && desk.data.decide === null ? null : waiting} more={waitingMore} connectionId={connectionId}
            empty="Nothing waits on a person." kinds />
          {Object.entries(desk.data.unread ?? {}).map(([store, why]) => (
            <p key={store} className="aug-fs-xs" data-testid="brief-unread" style={{ color: "var(--t3)", margin: "4px 0 0" }}>
              Not read: {store} — {why}
            </p>
          ))}
          <div style={{ margin: "6px 0 0" }}>
            <Freshness state="live" at={desk.data.as_of} verb="desk read" />
          </div>
        </>
      )}
    </div>
  );
}

function DeskTable({ title, sub, items, more, connectionId, empty, testid, kinds }: {
  title: string; sub: string; items: DeskItem[] | null; more: number; connectionId: string; empty: string; testid: string;
  /** Draw each item's kind — the queue mixes disputes, gaps and proposals. */
  kinds?: boolean;
}) {
  return (
    <Part testid={testid} title={title} kind={sub}>
      {items === null ? (
        <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: 0 }}>Its store could not be read.</p>
      ) : items.length === 0 ? (
        <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: 0 }}>{empty}</p>
      ) : (
        <table className="aug-fs-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={TH}>{kinds ? "Issue" : "What was recorded"}</th>
              {kinds ? <th style={TH}>Kind</th> : <th style={TH}>State</th>}
              {!kinds && <th style={TH}>As of</th>}
              <th style={{ ...TH, textAlign: "right" }}>{kinds ? "Next step" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {withUniqueKeys(items, it => `${it.kind}:${it.source.ref}:${it.title}`).map(([k, it]) => (
              <tr key={k}>
                <td style={TD} title={it.source.label}>
                  <div style={{ color: "var(--t1)" }}>{it.title}</div>
                  {it.text && <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>{it.text}</div>}
                </td>
                {kinds
                  ? <td style={TD}>{KIND[it.kind] ?? it.kind.replace(/_/g, " ")}</td>
                  : <td style={TD}>{it.status ? <Chip tone={it.status === "Provisional" ? "amber" : undefined}>{it.status}</Chip> : "—"}</td>}
                {!kinds && <td style={{ ...TD, whiteSpace: "nowrap" }}>{it.as_of || "—"}</td>}
                <td style={{ ...TD, textAlign: "right" }}>
                  {it.action && (
                    <Button size="xs" variant="outline" onClick={() => openDeskAction(it.action!, connectionId)}>{it.action.verb}</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && <p className="aug-fs-xs" style={{ color: "var(--t3)", margin: "4px 0 0" }}>{formatCount(more)} more on the desk, not shown here.</p>}
    </Part>
  );
}
