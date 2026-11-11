"use client";

/**
 * The Ontology's register and its review queue (2026-11-10; the user: "Ontology currently is too clustered and
 * unusable effectively.. think deep on what it stands for", then "Yes, build it" to
 * `design-mockups/evidence-to-action/ontology.html`).
 *
 * The ontology is the business's model of itself — the things it deals in, how they connect, the stages they go
 * through, the promises made on them, the groups that matter, what may be done to them and the metrics that measure
 * them. Two jobs use it, and they are kept apart:
 *
 *   · reading the business — the REGISTER (the page opens here): what the business deals in, as one readable table
 *     (the Evidence → Action study, §11.2), grouped by kind, with the processes and rules under it and what waits for
 *     a person above it. A type opens as a page of its own;
 *   · keeping the model right — REVIEW: every proposal the explorer made, with what the data measured and the model's
 *     reason, a key nobody checked, a link declared twice — one queue, where the map's rail, the figures row, a type's
 *     panel and a sentence used to hold a piece each.
 *
 * The map stays, as a view one picks (the study: "graphs are an exploration aid, not the only view").
 *
 * What a row does not have says so. A type's definition is not on its row: the read that has it also counts each
 * type's lifecycle, so it is read when the type's page opens, never for the whole register.
 */
import React, { useState } from "react";

import { CARD, Chip, Empty, Fold, Label, MUTED, NUM, ONE_LINE, Page, ROW, RULE } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { countNoun, formatCount, formatPercent } from "@/lib/format";
import type {
  ConfirmTarget, DraftProposal, OntologyDraft, ProcessRow, ProposalTier, RuleRow, TypeMap, TypeMapLink, TypeMapRow,
} from "@/lib/objectTypes";

/** A proposal's tier, as a tag (the map's rail reads the same). */
export const TIER_TAG: Record<ProposalTier, string> = {
  proposed: "aug-tag-violet", confirmed: "aug-tag-green", refused: "aug-tag-red", released: "aug-tag-gray",
  withdrawn: "aug-tag-gray",
};

/** The declaration a proposal was written as, as the confirm door names it. */
export function targetOf(p: DraftProposal): ConfirmTarget {
  if (p.kind === "entity") return { kind: "entity", entity: p.target.entity };
  if (p.kind === "link") return { kind: "link", relationship: p.target.relationship };
  if (p.kind === "link_name") return { kind: "link_name", relationship: p.target.relationship };
  if (p.kind === "process") return { kind: "process", process: p.target.process };
  if (p.kind === "rule") return { kind: "rule", rule: p.target.rule };
  return { kind: "binding", entity: p.target.entity, binding: p.target.binding };
}

/** Links said twice: the same verb between the same two types — once found by the explorer, once by a person, say. */
export function duplicateLinks(links: readonly TypeMapLink[]): { from: string; to: string; verb: string; links: TypeMapLink[] }[] {
  const by = new Map<string, TypeMapLink[]>();
  for (const l of links) {
    const k = `${l.from}\u0000${l.to}\u0000${(l.verb || l.name).toLowerCase()}`;
    by.set(k, [...(by.get(k) ?? []), l]);
  }
  return [...by.values()].filter(ls => ls.length > 1).map(ls => ({ from: ls[0].from, to: ls[0].to, verb: ls[0].verb || ls[0].name, links: ls }));
}

/** A key a person has yet to settle: never counted, or counted and not one per object. */
export const keyWaits = (t: TypeMapRow) => t.key_verified !== true;

const GROUPS: { id: string; label: string; test: (t: TypeMapRow) => boolean }[] = [
  { id: "business_object", label: "Business objects", test: t => t.role === "business_object" },
  { id: "event", label: "Events", test: t => t.role === "event" },
  { id: "reference_data", label: "Reference data", test: t => t.role === "reference_data" },
  { id: "other", label: "Other types", test: t => !["business_object", "event", "reference_data"].includes(t.role) },
];

const ORIGIN_WORD: Record<string, string> = { table: "from a table", human: "declared by a person", model: "proposed by the explorer" };
const KIND_WORD: Record<DraftProposal["kind"], string> = {
  entity: "type", part: "part", link: "link", link_name: "link name", process: "process", rule: "rule",
};

const REGISTER: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14,
  gridTemplateColumns: "minmax(200px, 2fr) minmax(90px, .8fr) 90px minmax(110px, 1fr) minmax(120px, 1fr) 50px minmax(120px, 1.1fr) minmax(110px, 1fr) minmax(150px, 1.2fr)",
};
const HEAD: React.CSSProperties = { ...MUTED, textTransform: "uppercase", letterSpacing: ".06em" };

// ── The register ───────────────────────────────────────────────────────────────────────────────────────────────────

export function OntologyRegister({ map, lead, sources, onOpen, onOpenProcess, declareDoor, onNewProcess, onNewAction }: {
  map: TypeMap;
  /** What the register opens on, above its tables — the Business Atlas, for a connection's ontology. With it, the two
   *  tables start folded: the picture is the page, and a table is opened when it is wanted. */
  lead?: React.ReactNode;
  /** Kept for the callers that pass it; what waits for a person is the Review view's, and is not repeated here. */
  draft?: OntologyDraft | null;
  /** ON-8 — an organisation's ontology: each type's connection, by id. */
  sources?: Record<string, string>;
  onOpen: (objectType: string) => void;
  onOpenProcess: (processId: string) => void;
  onReview?: () => void;
  /** The New entity door (the declare form). */
  declareDoor: React.ReactNode;
  onNewProcess?: () => void;
  onNewAction?: () => void;
}) {
  const types = map.object_types;
  const name = (id: string) => types.find(t => t.object_type === id)?.display_name ?? id;
  const standing = types.filter(t => !t.absorbed_into);
  const parts = types.filter(t => t.absorbed_into);
  const processes = map.processes ?? [];
  const rules = map.rules ?? [];
  const [tables, setTables] = useState({ entities: !lead, declarations: !lead });
  const processesOf = (id: string) => processes.filter(p => p.entity === id);

  return (
    <Page testId="ontology-register">
      {lead}
      <div className="aug-fs-xs" data-testid="ontology-tally" style={{ ...ROW, gap: 22, color: "var(--t3)" }}>
        <Tally n={standing.length} one="entity" many="entities" />
        <Tally n={parts.length} one="part" many="parts" />
        <Tally n={map.links.length} one="link" many="links" />
        <Tally n={processes.length} one="process" many="processes" />
        <Tally n={rules.length} one="rule" many="rules" />
      </div>

      <Fold title="Entities" testId="ontology-types" open={tables.entities} onOpenChange={(entities) => setTables((was) => ({ ...was, entities }))}
        meta={`${countNoun(standing.length, "entity", "entities")}${parts.length ? ` · ${countNoun(parts.length, "part")}` : ""} · what the business deals in, read from its tables`}>
        <div style={{ padding: "12px 14px" }}>
        <div style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Entities" style={{ minWidth: 1080 }}>
            <div role="row" className="aug-fs-xs" style={{ ...REGISTER, ...HEAD, padding: "0 0 6px 8px" }}>
              {["Entity", "Domain", "Objects", "Key", "Read from", "Links", "Process", "Used by", "Stands"].map(h => (
                <span key={h} role="columnheader" style={h === "Objects" || h === "Links" ? { textAlign: "right" } : undefined}>{h}</span>
              ))}
            </div>
            {GROUPS.map(g => {
              const rows = standing.filter(g.test);
              if (!rows.length) return null;
              return (
                <div key={g.id} role="rowgroup" data-testid={`ontology-group-${g.id}`}>
                  <div className="aug-fs-xs" style={{ ...HEAD, padding: "12px 0 4px 8px" }}>{g.label}</div>
                  {rows.map(t => <TypeRow key={t.object_type} t={t} processes={processesOf(t.object_type)} sources={sources} onOpen={onOpen} />)}
                </div>
              );
            })}
            {parts.length > 0 && (
              <div role="rowgroup" data-testid="ontology-group-parts">
                <div className="aug-fs-xs" style={{ ...HEAD, padding: "12px 0 4px 8px" }}>Parts</div>
                {parts.map(t => (
                  <TypeRow key={t.object_type} t={t} processes={processesOf(t.object_type)} sources={sources} onOpen={onOpen}
                    partOf={name(t.absorbed_into ?? "")} />
                ))}
              </div>
            )}
          </div>
        </div>
        {declareDoor}
        </div>
      </Fold>

      <Fold title="Processes & rules" testId="ontology-declarations" open={tables.declarations} onOpenChange={(declarations) => setTables((was) => ({ ...was, declarations }))}
        meta={`${countNoun(processes.length, "process", "processes")} · ${countNoun(rules.length, "rule")}`}
        right={<span style={{ ...ROW, gap: 8 }}>
          {onNewProcess && <Button size="xs" variant="outline" onClick={onNewProcess} data-testid="ontology-new-process">New process</Button>}
          {onNewAction && <Button size="xs" variant="outline" onClick={onNewAction} data-testid="ontology-new-action">New action</Button>}
        </span>}>
        <div style={{ padding: "12px 14px" }}>
        {processes.length + rules.length === 0 ? <Empty>No process or rule is declared yet.</Empty> : (
          <table className="aug-fs-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Process / rule", "On", "Stages / test", "Objects", "Promises", "Stands"].map(h => (
              <th key={h} className="aug-fs-xs" style={{ ...HEAD, textAlign: h === "Objects" ? "right" : "left", fontWeight: 500, padding: "0 12px 6px 0" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {processes.map(p => <ProcessLine key={p.id} p={p} on={name(p.entity)} onOpen={() => onOpenProcess(p.id)} />)}
              {rules.map(r => <RuleLine key={r.id} r={r} on={name(r.entity)} onOpen={() => onOpen(r.entity)} />)}
            </tbody>
          </table>
        )}
        </div>
      </Fold>
    </Page>
  );
}

function Tally({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span>
      <b className="aug-fs-h2" style={{ color: "var(--t1)", fontWeight: 600, marginRight: 4, ...NUM }}>{formatCount(n)}</b>
      {n === 1 ? one : many}
    </span>
  );
}

/** What the explorer's waiting proposals are, by kind: "2 parts · 4 link names". */
/** One entity in the register; a click (or Enter) opens it as a page. */
function TypeRow({ t, processes, sources, onOpen, partOf }: {
  t: TypeMapRow; processes: ProcessRow[]; sources?: Record<string, string>; onOpen: (objectType: string) => void; partOf?: string;
}) {
  const none = <span style={MUTED}>—</span>;
  const used = [t.metrics ? countNoun(t.metrics, "metric") : "", t.actions ? countNoun(t.actions, "action") : ""].filter(Boolean).join(" · ");
  const from = t.table ? (sources && t.connection_id ? `${sources[t.connection_id] ?? t.connection_id} · ${t.table}` : t.table) : "";
  const open = () => onOpen(t.object_type);
  return (
    <div role="row" tabIndex={0} data-testid="ontology-type-row" onClick={open}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
      title={`Open ${t.display_name}`}
      style={{ ...REGISTER, padding: "8px 0 8px 8px", ...RULE, cursor: "pointer" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <span role="cell" style={{ minWidth: 0 }}>
        <span className="aug-fs-chrome" style={{ ...ONE_LINE, display: "block", color: "var(--t1)", fontWeight: 600 }}>{t.display_name}</span>
        <span className="aug-fs-xs" style={{ ...ONE_LINE, display: "block", ...MUTED }}>
          {partOf ? `part of ${partOf}` : roleWord(t.role)}
        </span>
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }}>{t.domain || none}</span>
      <span role="cell" className="aug-fs-xs" style={{ ...NUM, textAlign: "right", color: t.rows == null ? "var(--t3)" : "var(--t1)" }}>
        {t.rows == null ? "not counted" : formatCount(t.rows)}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE }} title={t.key || undefined}>
        {t.key_verified === true ? <><span style={{ color: "var(--grn4)" }}>✓ </span><span style={{ fontFamily: "var(--font-mono)", color: "var(--t2)" }}>{t.key}</span></>
          : t.key_verified === false ? <span style={{ color: "var(--amb4)" }}>{`${t.key} · not unique`}</span>
          : <span style={{ color: "var(--amb4)" }}>{t.key ? `${t.key} · not counted` : "no key"}</span>}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, fontFamily: from ? "var(--font-mono)" : undefined, color: "var(--t2)" }} title={from || undefined}>
        {from || <span style={MUTED}>kept by the platform</span>}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...NUM, textAlign: "right", color: "var(--t2)" }}>{formatCount(t.links)}</span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }}>
        {processes.length ? processes.map(p => `${p.display_name} · ${countNoun(p.stages.length, "stage")}`).join(", ") : none}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }}>{used || none}</span>
      <span role="cell" style={{ ...ROW, gap: 6, flexWrap: "nowrap", minWidth: 0 }}>
        {(t.unconfirmed ?? 0) > 0 && <Chip tone="violet" title="What the explorer proposed on this type that no person has confirmed">{`${t.unconfirmed} proposed`}</Chip>}
        <span className="aug-fs-xs" style={{ ...ONE_LINE, ...MUTED }}>{ORIGIN_WORD[t.origin ?? ""] ?? ""}</span>
      </span>
    </div>
  );
}

function roleWord(role: string): string {
  return ({ business_object: "business object", event: "event", reference_data: "reference data" } as Record<string, string>)[role] ?? (role || "type");
}

const cell: React.CSSProperties = { padding: "7px 12px 7px 0", verticalAlign: "top" };

function ProcessLine({ p, on, onOpen }: { p: ProcessRow; on: string; onOpen: () => void }) {
  return (
    <tr data-testid="ontology-process-row" style={{ ...RULE, cursor: "pointer" }} onClick={onOpen} title={`Open ${p.display_name}`}>
      <td style={{ ...cell, color: "var(--t1)", fontWeight: 600 }}>{p.display_name}</td>
      <td style={{ ...cell, color: "var(--t2)" }}>{on}</td>
      <td style={{ ...cell, color: "var(--t2)" }}>{p.stages.join(" → ")}</td>
      <td style={{ ...cell, ...NUM, textAlign: "right" }}>{p.objects == null ? "—" : formatCount(p.objects)}</td>
      <td style={{ ...cell, color: "var(--t2)" }}>
        {p.promises.length ? p.promises.map((pr, i) => (
          <span key={`${pr.stage}:${pr.name}`}>{i ? " · " : ""}
            <span style={{ color: pr.breach_rate ? "var(--amb4)" : "var(--t2)" }}>
              {pr.breach_rate == null ? `${pr.name} not measured` : `${pr.name} broken ${formatPercent(pr.breach_rate, 1)}`}
            </span>
          </span>
        )) : <span style={MUTED}>—</span>}
      </td>
      <td style={cell}>{p.verified ? <Chip tone="up">verified</Chip> : <Chip>{p.verified === false ? "not verified" : "not checked"}</Chip>}</td>
    </tr>
  );
}

function RuleLine({ r, on, onOpen }: { r: RuleRow; on: string; onOpen: () => void }) {
  return (
    <tr data-testid="ontology-rule-row" style={{ ...RULE, cursor: "pointer" }} onClick={onOpen} title={`Open ${on}, where ${r.display_name} lives`}>
      <td style={{ ...cell, color: "var(--t1)", fontWeight: 600 }}>{r.display_name} <span className="aug-fs-xs" style={{ ...MUTED, fontWeight: 400 }}>· rule</span></td>
      <td style={{ ...cell, color: "var(--t2)" }}>{on}</td>
      <td style={{ ...cell, color: "var(--t2)" }}>{r.kind === "value_set" ? "a set of values" : "a condition"}</td>
      <td style={{ ...cell, ...NUM, textAlign: "right" }}>
        {r.admitted == null ? "—" : `${formatCount(r.admitted)}${r.objects != null ? ` of ${formatCount(r.objects)}` : ""}`}
      </td>
      <td style={{ ...cell, ...MUTED }}>—</td>
      <td style={cell}>{r.verified ? <Chip tone="up">verified</Chip> : <Chip>{r.verified === false ? "not verified" : "not checked"}</Chip>}</td>
    </tr>
  );
}

// ── Review: one queue for everything that waits for a person ──────────────────────────────────────────────────────

type Which = "proposed" | "confirmed" | "refused" | "all";

export function OntologyReview({ map, draft, explore, confirm, onOpen }: {
  map: TypeMap;
  draft: OntologyDraft | null;
  /** One model call: the explorer drafts the business again. */
  explore?: () => Promise<void>;
  confirm?: (request: { all?: boolean; targets?: ConfirmTarget[] }) => Promise<void>;
  onOpen: (objectType: string) => void;
}) {
  const [which, setWhich] = useState<Which>("proposed");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const types = map.object_types;
  const name = (id: string) => types.find(t => t.object_type === id)?.display_name ?? (id || "—");
  const counts = draft?.counts;
  const shown = (draft?.proposals ?? []).filter(p => which === "all" || p.tier === which);
  const keys = types.filter(t => !t.absorbed_into && keyWaits(t));
  const twice = duplicateLinks(map.links);
  const act = async (what: string, write: () => Promise<void>) => {
    setBusy(what); setProblem("");
    try { await write(); } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };

  return (
    <Page testId="ontology-review">
      <div style={{ ...ROW, gap: 10 }}>
        <span className="aug-fs-sm" style={{ color: "var(--t2)" }} data-testid="ontology-review-counts">
          {counts ? `${formatCount(counts.proposed)} proposed · ${formatCount(counts.confirmed)} confirmed · ${formatCount(counts.refused)} refused` : "No draft yet"}
          <span style={MUTED}> · each measured on the data — reviewing calls no model</span>
        </span>
        <span style={{ marginLeft: "auto", ...ROW, gap: 8 }}>
          {explore && (
            <Button size="xs" variant="outline" disabled={!!busy} onClick={() => act("explore", explore)} data-testid="ontology-draft-again"
              title="One model call: an explorer proposes entities, parts, links, processes and rules, and the data measures each before it lands">
              {busy === "explore" ? "Drafting…" : draft?.runs.length ? "Draft again · 1 model call" : "Draft the business · 1 model call"}
            </Button>
          )}
          {confirm && counts && counts.proposed > 0 && (
            <Button size="xs" disabled={!!busy} onClick={() => act("all", () => confirm({ all: true }))} data-testid="ontology-confirm-all"
              title="Make every proposal still the model's yours, exactly as measured">
              {busy === "all" ? "Confirming…" : `Confirm all ${formatCount(counts.proposed)}`}
            </Button>
          )}
        </span>
      </div>
      {problem && <div role="alert" className="aug-fs-sm" style={{ color: "var(--red4)" }}>{problem}</div>}

      <section aria-label="The explorer's proposals" style={CARD} data-testid="ontology-review-proposals">
        <Label right={<Segmented<Which> label="Which proposals" value={which} onChange={setWhich} options={[
          { value: "proposed", label: `Waiting ${formatCount(counts?.proposed ?? 0)}` },
          { value: "confirmed", label: `Confirmed ${formatCount(counts?.confirmed ?? 0)}` },
          { value: "refused", label: `Refused ${formatCount(counts?.refused ?? 0)}` },
          { value: "all", label: "All" },
        ]} />}>The explorer&apos;s proposals</Label>
        {!draft ? <Empty>No explorer has drafted this business yet — Draft the business reads its tables and proposes.</Empty>
          : shown.length === 0 ? <Empty>{which === "proposed" ? "Nothing waits — every proposal is decided." : "None."}</Empty>
          : (
            <table className="aug-fs-sm" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: "34%" }} /><col style={{ width: "13%" }} /><col style={{ width: "24%" }} /><col style={{ width: "19%" }} /><col style={{ width: "10%" }} /></colgroup>
              <thead><tr>{["Proposal", "On", "What the data says", "Why", ""].map(h => (
                <th key={h || "act"} className="aug-fs-xs" style={{ ...HEAD, textAlign: "left", fontWeight: 500, padding: "0 12px 6px 0" }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {shown.map(p => (
                  <tr key={p.key} data-testid="ontology-proposal" style={RULE}>
                    <td style={{ ...cell, minWidth: 0 }}>
                      <div style={{ ...ROW, gap: 6 }}>
                        <span className={`aug-tag ${TIER_TAG[p.tier]}`}>{p.tier}</span>
                        <span className="aug-fs-xs" style={MUTED}>{KIND_WORD[p.kind]}</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", color: "var(--t1)", overflowWrap: "anywhere", marginTop: 3 }}>{p.sentence}</div>
                    </td>
                    <td style={{ ...cell, color: "var(--t2)" }}>{p.object_type ? name(p.object_type) : "—"}</td>
                    <td className="aug-fs-xs" style={{ ...cell, ...MUTED, overflowWrap: "anywhere" }}>{p.note || "—"}</td>
                    <td className="aug-fs-xs" style={{ ...cell, ...MUTED, overflowWrap: "anywhere" }}>{p.tier === "refused" ? "—" : p.reason || "—"}</td>
                    <td style={{ ...cell, textAlign: "right", paddingRight: 0 }}>
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {p.tier === "proposed" && confirm && (
                          <Button size="xs" variant="outline" disabled={!!busy} onClick={() => act(p.key, () => confirm({ targets: [targetOf(p)] }))}>
                            {busy === p.key ? "…" : "Confirm"}
                          </Button>
                        )}
                        {p.object_type && p.tier !== "refused" && p.tier !== "withdrawn" && (
                          <Button size="xs" variant="ghost" onClick={() => onOpen(p.object_type)}
                            title="Open where it lives — change or withdraw it there">Open</Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section aria-label="Also waiting on a person" style={CARD} data-testid="ontology-review-also">
        <Label>Also waiting on a person</Label>
        {keys.length + twice.length === 0 ? <Empty>Nothing else — every key is counted and no link is said twice.</Empty> : (
          <>
            {keys.map((t, i) => (
              <div key={t.object_type} data-testid="ontology-review-key" style={{ ...ROW, flexWrap: "nowrap", padding: "8px 0", ...(i ? RULE : {}) }}>
                <span className="aug-tag aug-tag-gray">key</span>
                <span style={{ color: "var(--t1)" }}>{`What identifies one ${t.display_name}?`}</span>
                <span className="aug-fs-xs" style={MUTED}>
                  {t.key ? `${t.key} · ${t.key_verified === false ? "not one per object" : "not counted yet"}` : "no key is set"}
                </span>
                <Button size="xs" variant="outline" style={{ marginLeft: "auto" }} onClick={() => onOpen(t.object_type)}>Check</Button>
              </div>
            ))}
            {twice.map((d, i) => (
              <div key={`${d.from}-${d.to}-${d.verb}`} data-testid="ontology-review-twice"
                style={{ ...ROW, flexWrap: "nowrap", padding: "8px 0", ...(keys.length || i ? RULE : {}) }}>
                <span className="aug-tag aug-tag-amber">said twice</span>
                <span style={{ color: "var(--t1)" }}>{`${name(d.from)} — ${d.verb} → ${name(d.to)}`}</span>
                <span className="aug-fs-xs" style={MUTED}>
                  {d.links.map(l => l.origin === "human" ? "by a person" : l.origin === "model" ? "by the explorer" : "found in the joins").join(" · ")}
                </span>
                <Button size="xs" variant="outline" style={{ marginLeft: "auto" }} onClick={() => onOpen(d.from)}
                  title="Open the type — its links are on its Links tab">Open</Button>
              </div>
            ))}
          </>
        )}
      </section>
    </Page>
  );
}
