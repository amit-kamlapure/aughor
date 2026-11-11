"use client";

/**
 * ON-3b — the entity-type panel (ROADMAP §3.15, amended 2026-09-11): one object type, as the data measured it.
 *
 * Everything here is `GET /object-types/{type}` — the dict the agent also reads through `describe_entity` — so a
 * person and an agent asking what a Shipment is read one answer: the key and whether the data proved it unique;
 * the property that names one object, with its measurement and the door to declare another; every property with
 * its SOURCE; the bindings it is read from — its backing, the further sources a person bound and the ones the data
 * proposes (ON-1b); its links, each followed by the compiler or refused with the reason;
 * the declared actions that take it; its verified metrics; and a path finder that answers "how does this reach
 * that?" hop by hop. Nothing is inferred on the way to the screen — an unmeasured fact says so.
 *
 * Laid out as the approved mockup lays it out (`design-mockups/ontology-tab.html`, 2026-10-10 — "one panel that did not
 * end" became one panel and six tabs): the name, its four figures, then Overview · Properties · Links · Actions ·
 * Sources · History, each holding the sections that belong to it. Read first: every door that writes is behind Edit,
 * except a person's yes to what was proposed — a Confirm, a Bind, a Key — which waits on them and stays on its row.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";

import { MakeDashboard } from "@/components/dashboards/MakeDashboard";
import { DerivedList } from "@/components/ontology/ProcessPanel";
import { SourceMapping } from "@/components/ontology/SourceMapping";
import { EntityShape } from "@/components/ontology/EntityShape";
import { Label, NeedsRow, ProcessFlow, SetChips, TypeFigures, UsedBy, UsesSection } from "@/components/ontology/TypeOverview";
import { IconSquare } from "@/components/ui/icon-square";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SkeletonRows } from "@/components/ui/motion";
import { TabStrip } from "@/components/ui/tab-strip";
import { countNoun, endedDay, formatCount, utcDayWords } from "@/lib/format";
import { getOntologyKeys, getTableColumns, keyVocabularyEntry, type TableColumn, type VocabularyKey } from "@/lib/api";
import { ColumnTypeSquare } from "@/components/icons/columnType";
import { declaredActionsHref } from "@/lib/objectLinks";
import {
  addBinding,
  changeEntityWords, changeRule, deleteRule, type RuleDetail,
  confirmProposals,
  declareDisplayProperty, setEntityKey,
  declareLink,
  declareProcess,
  declareRule,
  deleteEntity,
  deleteLink,
  getObjectType,
  getObjectTypeUses,
  getProcesses,
  getTypePaths,
  measureOntology,
  nameLink,
  previewBacking,
  removeBinding, restoreBinding, restoreLink, declareExpression, removeExpression,
  scopeDomain,
  setPartOf,
  setQueryBacking,
  withdrawBacking,
  type BackingPreview,
  type BindingSpec,
  type ConfirmTarget,
  type DeclaredLinkSpec,
  type DeclaredProcessSpec,
  type DeclaredRuleSpec,
  type FrameSpec,
  type ObjectTypeDetail,
  type ObjectTypeUses,
  type ProcessesAndRules,
  type PropertySource,
  type ProposedBinding,
  type RollupSpec,
  type TypeBinding,
  type TypeLink,
  type TypeMapRow,
  type TypePath,
  type TypePaths,
  type TypeProperty,
  type TypeRefusal,
  declareEditStates,
  withdrawEditStates,
  type EditStates,
  getDeclarationHistory,
  markRetiring,
  putBackVersion,
  unmarkRetiring,
  type DeclarationHistory,
} from "@/lib/objectTypes";
import { Door, Field, FormFoot, RemoveAsk, savedToDraft } from "@/components/ontology/authoring";
import { FormDialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const RULE = "1px solid var(--b1)";
const ROLE: Record<string, string> = {
  reference_data: "reference", business_object: "business object", event: "event", standalone: "standalone",
};
const RISK_TAG: Record<string, string> = { read_only: "aug-tag-green", low: "aug-tag-green", high: "aug-tag-red" };
const SELECT: React.CSSProperties = {
  ...MONO, background: "var(--bg-2)", color: "var(--t1)", border: RULE, borderRadius: "var(--r2)", padding: "2px 6px",
  maxWidth: 200,
};

const FIELD: React.CSSProperties = {
  ...MONO, background: "var(--bg-2)", color: "var(--t1)", border: RULE, borderRadius: "var(--r2)", padding: "2px 6px",
  minWidth: 0,
};

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** While a person edits, the page is a grid of cards (the mockup the user approved, 2026-11-11): each section a card
 *  with its count and its "+ New" at the head. Reading, a section is the ruled block under its tab, as before. */
const Carded = createContext(false);

function Section({ title, aside, count, action, children }: {
  title: string;
  aside?: React.ReactNode;
  /** How many it holds, said beside its name on a card. */
  count?: number;
  /** What makes a new one — at the head's right, where every card has it. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const carded = useContext(Carded);
  if (carded) {
    return (
      <section className="aug-entity-card" data-testid="entity-card" aria-label={title}>
        <div className="aug-entity-card-head">
          <h3>{title}</h3>
          {count != null && <span className="n">{count}</span>}
          {aside && <span className="aug-fs-xs said">{aside}</span>}
          {action && <span className="act">{action}</span>}
        </div>
        <div className="aug-entity-card-body">{children}</div>
      </section>
    );
  }
  return (
    <section style={{ padding: "12px 16px", borderTop: RULE }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <h3 className="aug-fs-xs"
          style={{ margin: 0, color: "var(--t2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {title}
        </h3>
        {aside && <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>{aside}</span>}
        {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
      </div>
      {children}
    </section>
  );
}

export function EntityTypePanel({ connectionId, schema, objectType, types, version, onOpen, onOpenProcess, onChanged,
  onDesignProcess, onDesignAction, sources, full = false }: {
  /** A type's own page (the Ontology's register, 2026-11-10): the panel takes the page's width, not a side's. */
  full?: boolean;
  connectionId: string;
  schema?: string;
  objectType: string;
  types: TypeMapRow[];
  /** Bumped when the map re-reads, so the panel re-reads with it. */
  version: number;
  onOpen: (objectType: string) => void;
  /** ON-9 — open a declared process this type takes part in. */
  onOpenProcess?: (processId: string) => void;
  /** A write here (a declaration, a measurement) changes what the map shows. */
  onChanged: () => void;
  /** Opens the process designer on this type (2026-10-09); absent where it does not reach, and the form here stands. */
  onDesignProcess?: (entity: string) => void;
  /** Opens the action designer on this type (2026-10-09); absent where it does not reach. */
  onDesignAction?: (entity: string) => void;
  /** ON-8 — set in an organisation's ontology: its connections by id, for the type, its bindings and a new binding. */
  sources?: Record<string, string>;
}) {
  const [detail, setDetail] = useState<ObjectTypeDetail | TypeRefusal | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    getObjectType(objectType, connectionId, schema)
      .then((next) => { if (live) setDetail(next); })
      .catch((e: unknown) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [objectType, connectionId, schema, version]);

  // ROADMAP §6 item 53 — what else depends on the type, from its own door. Nothing when the door refuses or cannot be
  // read: the Overview then shows what it shows without it.
  const [uses, setUses] = useState<ObjectTypeUses | null>(null);
  useEffect(() => {
    let live = true;
    setUses(null);
    getObjectTypeUses(objectType, connectionId, schema)
      .then((next) => { if (live) setUses(next.path === "uses" ? next : null); })
      .catch(() => { if (live) setUses(null); });
    return () => { live = false; };
  }, [objectType, connectionId, schema, version]);

  let body: React.ReactNode;
  if (error) body = <EmptyState icon="alert" title="This type could not be read">{error}</EmptyState>;
  else if (!detail || (detail.path === "object_type" && detail.object_type !== objectType)) {
    body = <div style={{ padding: 16 }}><SkeletonRows rows={8} /></div>;
  } else if (detail.path === "refused") {
    body = <EmptyState icon="info" title={`No entity “${objectType}”`}>{detail.refused}</EmptyState>;
  } else {
    body = <TypeDetail detail={detail} uses={uses} connectionId={connectionId} schema={schema} types={types}
      onOpen={onOpen} onOpenProcess={onOpenProcess} onChanged={onChanged} onDesignProcess={onDesignProcess} onDesignAction={onDesignAction} sources={sources} />;
  }
  return (
    <aside aria-label="Entity type" data-testid="entity-type-panel" data-full={full || undefined}
      style={{ ...(full ? { flex: 1, minWidth: 0 } : { width: PANEL_WIDTH, flexShrink: 0, borderLeft: RULE }),
               display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg-0)" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>{body}</div>
    </aside>
  );
}

/** The panel's width — the approved mockup's 470, so its six tabs and four figures sit on one row each (the process panel matches). */
export const PANEL_WIDTH = 470;

/** Read first: a door that writes shows only while a person is editing (the Edit button in the panel's header). A yes to
 *  what was proposed — a Confirm, a Bind, a Key — is not behind it: it waits on a person and stays on its row. */
const Editing = createContext(false);
const useEditing = () => useContext(Editing);

/** The six tabs, in the mockup's order. */
type PanelTab = "overview" | "properties" | "links" | "actions" | "sources" | "history";
const TAB_NAME: Record<PanelTab, string> = {
  overview: "Overview", properties: "Properties", links: "Links", actions: "Actions", sources: "Sources", history: "History",
};

function TypeDetail({ detail, uses, connectionId, schema, types, onOpen, onOpenProcess, onChanged, onDesignProcess, onDesignAction,
  sources }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  types: TypeMapRow[];
  onOpen: (objectType: string) => void;
  onOpenProcess?: (processId: string) => void;
  onChanged: () => void;
  onDesignProcess?: (entity: string) => void;
  onDesignAction?: (entity: string) => void;
  sources?: Record<string, string>;
  /** ROADMAP §6 item 53 — what else depends on the type; null while the door is unread. */
  uses?: ObjectTypeUses | null;
}) {
  const declared = detail.origin === "human" || detail.origin === "model";
  // ON-8 — in an organisation's ontology the doors that read one connection's graph (a display property, a part mark, a
  // link's name, an explorer's proposal, declared actions) are not offered: they would read a connection nobody holds.
  const inDomain = !!scopeDomain(connectionId);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState(false);
  // ON-9 — the processes and rules, read as the process panel reads them: the funnel, the promises and the sets' counts.
  const [scope, setScope] = useState<ProcessesAndRules | null>(null);
  const reads = (detail.processes?.length ?? 0) > 0 || (detail.derived?.segments.length ?? 0) > 0;
  useEffect(() => {
    if (!reads) { setScope(null); return; }
    let live = true;
    getProcesses(connectionId, schema)
      .then((next) => { if (live) setScope(next); })
      .catch(() => { if (live) setScope(null); });
    return () => { live = false; };
  }, [connectionId, schema, detail, reads]);

  // "Change" on a row that waits (how one is named): the details open, where the key and what names one are changed.
  const editTab = (next: PanelTab) => { setTab(next); setEditing(true); setChanging(true); };
  const needs = needsOf(detail, { connectionId, schema, inDomain, onChanged, onTab: setTab, onEdit: editTab });
  const counts = detail.counts;
  const tabs = [
    { id: "overview" as const, label: "Overview", badge: needs.length,
      title: needs.length ? `${countNoun(needs.length, "thing")} here wait on a person` : undefined },
    { id: "properties" as const, label: <Counted label="Properties" n={counts.properties} /> },
    { id: "links" as const, label: <Counted label="Links" n={counts.links} /> },
    { id: "actions" as const, label: <Counted label="Actions" n={counts.actions} /> },
    { id: "sources" as const, label: <Counted label="Sources" n={counts.bindings} /> },
    { id: "history" as const, label: "History" },
  ];
  let body: React.ReactNode;
  if (tab === "overview") {
    const flows = (scope?.processes ?? []).filter((p) => p.entity === detail.object_type || p.entity_id === detail.id);
    const sets = <SetChips detail={detail} scope={scope} />;
    const used = <UsedBy detail={detail} onMetric={() => setTab("properties")} onAction={() => setTab("actions")} />;
    const quiet = !needs.length && !flows.length && !detail.segments.length && !detail.derived?.segments.length
      && !detail.metrics.length && !detail.actions.length;
    body = (
      <div className="aug-stack-rules" style={{ padding: "14px 16px", display: "flex", flexDirection: "column" }} data-testid="entity-overview">
        {needs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label>Needs you</Label>
            {needs}
          </div>
        )}
        {flows.map((p) => <ProcessFlow key={p.id} process={p} onOpenProcess={onOpenProcess} />)}
        {sets}
        {used}
        {uses && <UsesSection uses={uses} />}
        {quiet && (
          <p className="aug-fs-sm" style={{ margin: 0, color: "var(--t3)" }}>
            Nothing waits on a person here, and no process, set, metric or action reads {detail.display_name} yet.
          </p>
        )}
      </div>
    );
  } else if (tab === "properties") {
    body = (
      <>
        <KeySection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} readOnly={inDomain || !!detail.platform} />
        {!detail.platform && (
          <DisplaySection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} readOnly={inDomain} />
        )}
        <PropertiesSection detail={detail} />
        {!inDomain && <ExpressionsSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />}
        <ProcessesSection detail={detail} connectionId={connectionId} schema={schema} onOpenProcess={onOpenProcess}
          onChanged={onChanged} onDesignProcess={onDesignProcess}
          rules={(scope?.rules ?? []).filter((r) => r.entity_id === detail.id || r.entity === detail.object_type)} />
        <MetricsSection detail={detail} />
        {!inDomain && <WordsSection detail={detail} connectionId={connectionId} schema={schema} />}
      </>
    );
  } else if (tab === "links") {
    body = (
      <>
        <PartsSection detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen} onChanged={onChanged} />
        <LinksSection detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen} onChanged={onChanged}
          inDomain={inDomain} />
        <PathFinder detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen} />
      </>
    );
  } else if (tab === "actions") {
    body = inDomain ? (
      <Section title="Actions">
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>
          Actions are declared, and their moves kept, on each connection&rsquo;s own ontology.
        </p>
      </Section>
    ) : (
      <>
        <ActionsSection detail={detail} connectionId={connectionId} onDesignAction={onDesignAction} />
        <EditStatesSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
      </>
    );
  } else if (tab === "sources") {
    body = <BindingsSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} sources={sources} />;
  } else {
    body = (
      <>
        <OriginSection detail={detail} />
        {!inDomain && (
          <VersionsSection kind="entity" targetId={detail.id} name={detail.display_name} stamp={detail}
            connectionId={connectionId} schema={schema} onChanged={onChanged} />
        )}
        <WithdrawnSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
      </>
    );
  }
  // Editing, the page is one grid of cards — everything that can be made, changed or removed here, each with its
  // "+ New" at the head. What is only read (the properties, the paths, the reads) stays under the tabs, a click on Read away.
  const cards = (
    <Carded.Provider value>
      <div className="aug-entity-cards" data-testid="entity-cards">
        <LinksSection detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen} onChanged={onChanged}
          inDomain={inDomain} />
        <ProcessesSection detail={detail} connectionId={connectionId} schema={schema} onOpenProcess={onOpenProcess}
          onChanged={onChanged} onDesignProcess={onDesignProcess}
          rules={(scope?.rules ?? []).filter((r) => r.entity_id === detail.id || r.entity === detail.object_type)} />
        <BindingsSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} sources={sources} />
        {!inDomain && <ExpressionsSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />}
        {!inDomain && <ActionsSection detail={detail} connectionId={connectionId} onDesignAction={onDesignAction} />}
        {!inDomain && <EditStatesSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />}
        <PartsSection detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen} onChanged={onChanged} />
        {!inDomain && (
          <VersionsSection kind="entity" targetId={detail.id} name={detail.display_name} stamp={detail}
            connectionId={connectionId} schema={schema} onChanged={onChanged} />
        )}
        <WithdrawnSection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
      </div>
    </Carded.Provider>
  );
  const primary = detail.bindings.find((b) => b.primary);
  return (
    <Editing.Provider value={editing}>
      <header style={{ padding: "14px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <IconSquare name="node" size={20} title="an entity type" />
          <h2 className="aug-fs-h1" style={{ margin: 0, color: "var(--t1)" }} title={detail.object_type}>{detail.display_name}</h2>
          {editing && primary?.table && <span className="aug-tag aug-tag-gray" data-testid="entity-chip-reads">reads {primary.table.split(".").pop()}</span>}
          {editing && detail.key.rows != null && <span className="aug-tag aug-tag-gray">{formatCount(detail.key.rows)} rows</span>}
          {editing && !detail.platform && (detail.key.property
            ? <span className={`aug-tag ${detail.key.verified === true ? "aug-tag-green" : "aug-tag-amber"}`}>{detail.key.verified === true ? "✓ " : ""}key {detail.key.property}</span>
            : <span className="aug-tag aug-tag-amber">no key yet</span>)}
          {editing && !detail.platform && <span className="aug-tag aug-tag-gray">named by {detail.display_property.property || "its key"}</span>}
          {detail.domain && <span className="aug-tag aug-tag-gray">{detail.domain}</span>}
          <span className="aug-tag aug-tag-gray">{ROLE[detail.role] ?? detail.role}</span>
          {declared && (
            <span className={`aug-tag ${detail.origin === "model" ? "aug-tag-violet" : "aug-tag-blue"}`}
              title={detail.origin === "model" ? `proposed by ${detail.provenance || "an explorer"}, not yet confirmed`
                : detail.provenance ? `declared — first proposed by ${detail.provenance}` : "declared by a person"}>
              {detail.origin === "model" ? "proposed" : "declared"}
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {/* a cockpit started from this object — not for one the platform holds, nor across an organisation's connections */}
            {!detail.platform && !inDomain && (
              <MakeDashboard connectionId={connectionId} schema={schema} entity={detail.object_type} name={detail.display_name} />
            )}
            {/* Read or Edit: reading, the page is its tabs; editing, its cards — every door that writes is in them */}
            <span className="aug-entity-mode" role="group" aria-label="Read or edit">
              <Button variant={editing ? "ghost" : "secondary"} size="xs" aria-pressed={!editing} data-testid="entity-read"
                onClick={() => setEditing(false)} title="Read it — the doors that write fold away">Read</Button>
              <Button variant={editing ? "secondary" : "ghost"} size="xs" aria-pressed={editing} data-testid="entity-edit"
                onClick={() => setEditing(true)} title="Show what makes, changes and removes things here">
                <Icon name="edit" size={12} /> Edit
              </Button>
            </span>
            {editing && !detail.platform && (
              <Door open={changing} onOpenChange={setChanging} label="Change its details" icon={null} variant="default" testId="entity-change"
                hint={`Change what ${detail.display_name} is called, what it is, its key and what names one`}
                title={`Change ${detail.display_name}`} width={680}
                description="Its name, the sentence that says what it is, its key and what names one. Each waits in the draft.">
                <EntityDetailsForm detail={detail} connectionId={connectionId} schema={schema} inDomain={inDomain}
                  onChanged={onChanged} onDone={() => setChanging(false)} />
              </Door>
            )}
          </span>
        </div>
        {sources && detail.connection_id && (
          <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 2 }} data-testid="entity-connection">
            read from {sources[detail.connection_id] ?? detail.connection_id}
          </div>
        )}
        {detail.description && (
          <p className="aug-fs-sm" title={detail.description}
            style={{ margin: "6px 0 0", color: "var(--t2)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2,
                     WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {detail.description}
          </p>
        )}
        <PartOfLine detail={detail} connectionId={connectionId} schema={schema} onOpen={onOpen} onChanged={onChanged} />
        <RetiringLine detail={detail} types={types} connectionId={connectionId} schema={schema} onOpen={onOpen}
          onChanged={onChanged} readOnly={inDomain} />
        {editing && declared && <WithdrawEntity detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />}
        {!editing && <TypeFigures detail={detail} />}
        {/* how it is drawn on the Business Atlas — one connection's picture, so not for an organisation's type */}
        {!inDomain && <EntityShape detail={detail} connectionId={connectionId} schema={schema} editing={editing} onChanged={onChanged} />}
      </header>
      {editing ? cards : (
        <>
          <TabStrip<PanelTab> label={`About ${detail.display_name}`} size="1" value={tab} onChange={setTab} tabs={tabs}
            style={{ padding: "0 2px" }} />
          <div role="tabpanel" aria-label={TAB_NAME[tab]} data-testid={`entity-tab-${tab}`} className="aug-sections">{body}</div>
        </>
      )}
    </Editing.Provider>
  );
}

/** A tab's name and, muted beside it, how many it holds. */
function Counted({ label, n }: { label: string; n: number }) {
  return (
    <>
      {label}
      <span className="aug-fs-xs" style={{ color: "var(--t3)", marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>{formatCount(n)}</span>
    </>
  );
}

/** What on this entity waits on a person, each on its own amber row with its buttons: a type an explorer proposed, a
 *  title nobody has checked names one object, a key the data did not prove unique, and the proposals waiting in its
 *  other tabs — which a tab alone would hide. */
function needsOf(detail: ObjectTypeDetail, { connectionId, schema, inDomain, onChanged, onTab, onEdit }: {
  connectionId: string;
  schema?: string;
  inDomain: boolean;
  onChanged: () => void;
  onTab: (tab: PanelTab) => void;
  onEdit: (tab: PanelTab) => void;
}): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const noun = detail.display_name.toLowerCase();
  if (detail.origin === "model" && !inDomain) {
    out.push(
      <NeedsRow key="type" testid="entity-needs-proposed" title={`${detail.display_name} was proposed — not confirmed yet`}
        detail={<span style={MONO}>{detail.provenance || "proposed by a model"}</span>}>
        <ConfirmProposal target={{ kind: "entity", entity: detail.id }} connectionId={connectionId} schema={schema}
          onChanged={onChanged} />
      </NeedsRow>,
    );
  }
  const shown = detail.display_property;
  if (!detail.platform && shown.source !== "key" && shown.verified !== true) {
    const said = shown.source === "human" ? "Declared" : "Proposed";
    out.push(
      <NeedsRow key="title" testid="entity-needs-title" title={`How is one ${noun} named?`}
        detail={<>{said}: <span style={MONO}>{shown.property}</span> · {shown.verified === false ? "does not name objects" : "not checked yet"}</>}>
        <MeasureButton connectionId={connectionId} schema={schema} onChanged={onChanged} label="Check" />
        {!inDomain && <Button variant="ghost" size="xs" onClick={() => onEdit("properties")}>Change</Button>}
      </NeedsRow>,
    );
  }
  if (!detail.platform && detail.key.verified !== true && detail.key.property) {
    out.push(
      <NeedsRow key="key" testid="entity-needs-key"
        title={detail.key.verified === false ? `Its key is not unique per ${noun}` : "Its key is not counted yet"}
        detail={<><span style={MONO}>{detail.key.property}</span>{detail.key.note ? ` · ${detail.key.note}` : ""}</>}>
        <MeasureButton connectionId={connectionId} schema={schema} onChanged={onChanged} label="Check" />
      </NeedsRow>,
    );
  }
  const sourcesWaiting = detail.bindings.filter((b) => b.source === "model").length + (detail.proposed_bindings ?? []).length;
  const linksWaiting = detail.links.filter((l) => l.origin === "model").length
    + (detail.parts ?? []).filter((p) => p.origin === "model").length;
  if (sourcesWaiting + linksWaiting > 0) {
    const what = [sourcesWaiting ? countNoun(sourcesWaiting, "source") : "", linksWaiting ? countNoun(linksWaiting, "link or part", "links and parts") : ""]
      .filter(Boolean).join(" · ");
    out.push(
      <NeedsRow key="proposals" testid="entity-needs-proposals"
        title={`${countNoun(sourcesWaiting + linksWaiting, "proposal")} here wait for a person`} detail={`proposed, not confirmed · ${what}`}>
        {sourcesWaiting > 0 && <Button variant="outline" size="xs" onClick={() => onTab("sources")}>Sources</Button>}
        {linksWaiting > 0 && <Button variant="outline" size="xs" onClick={() => onTab("links")}>Links</Button>}
      </NeedsRow>,
    );
  }
  return out;
}

/** Count what was declared against the data — keys, link cardinalities, lifecycles, display properties. No model call. */
function MeasureButton({ connectionId, schema, onChanged, label }: {
  connectionId: string; schema?: string; onChanged: () => void; label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      await measureOntology(connectionId, schema);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" size="xs" disabled={busy} onClick={run} data-testid="entity-measure"
        title="Count keys, link cardinalities, lifecycles and display properties against the data — no model call">
        {busy ? "Checking…" : label}
      </Button>
      {problem && <span className="aug-fs-xs" style={{ color: "var(--red5)", flexBasis: "100%" }}>{problem}</span>}
    </>
  );
}

/** Where an entity came from: the builder found it in a table, a person declared it, or an explorer proposed it — and
 *  the id the agent and the API name it by. */
function OriginSection({ detail }: { detail: ObjectTypeDetail }) {
  const backing = detail.bindings.find((b) => b.primary);
  const from = backing ? (backing.reads === "table" ? backing.table : "a keyed SELECT") : "";
  const said = detail.origin === "model"
    ? `Proposed by ${detail.provenance || "an explorer"} — not confirmed yet.`
    : detail.origin === "human"
      ? `Declared by a person${detail.provenance ? ` — first proposed by ${detail.provenance}` : ""}.`
      : detail.platform ? "Kept by Aughor: its objects live in the edit layer, set by actions."
        : `Found by the builder${from ? ` in ${from}` : ""}.`;
  return (
    <Section title="Where it comes from">
      <p className="aug-fs-sm" style={{ margin: 0, color: "var(--t2)" }} data-testid="entity-origin">{said}</p>
      <div className="aug-fs-xs" style={{ ...MONO, color: "var(--t3)", marginTop: 4 }}>{detail.object_type} · {detail.id}</div>
    </Section>
  );
}

/** ON-9 — the processes this type takes part in, and every name a declared process or rule derives on it: a segment,
 *  a lag, a breach rate — each read by the compiler once its declaration is measured, and refused with the reason
 *  until then. A process the type goes through and a rule over it are declared here, and counted before anything is
 *  written. */
function ProcessesSection({ detail, connectionId, schema, onOpenProcess, onChanged, onDesignProcess, rules = [] }: {
  /** The rules declared on this entity, as the process door reads them: each can be changed or removed while editing. */
  rules?: RuleDetail[];
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onOpenProcess?: (processId: string) => void;
  onChanged: () => void;
  onDesignProcess?: (entity: string) => void;
}) {
  const editing = useEditing();
  const processes = detail.processes ?? [];
  const derived = detail.derived ? [...detail.derived.segments, ...detail.derived.metrics, ...detail.derived.properties] : [];
  if (editing) {
    const mine = rules.filter((r) => r.origin !== "pack");
    return (
      <>
        <Section title="Rules" count={rules.length}
          action={<DeclareRule detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />}>
          {mine.map((r) => (
            <div key={r.id} className="aug-entity-row" data-testid="type-rule">
              <span style={{ color: "var(--t1)" }}>{r.display_name}</span>
              {r.admitted != null && r.objects != null && (
                <span className="aug-tag aug-tag-gray">{formatCount(r.admitted)} of {formatCount(r.objects)}</span>
              )}
              <span className="acts">
                <ChangeRule rule={r} detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
                <RemoveAsk what={`the rule ${r.display_name}`} testId="rule-remove"
                  effect={r.scopes?.length ? `The ${countNoun(r.scopes.length, "metric")} it scopes are read without it, and the set it names stops resolving.` : "The set it names stops resolving wherever a question or a dashboard reads it."}
                  back="A removed rule is made again from New rule."
                  remove={() => deleteRule(connectionId, r.id, schema)} onRemoved={() => { savedToDraft("Removed"); onChanged(); }} />
              </span>
            </div>
          ))}
          {!mine.length && <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>None yet.</p>}
        </Section>
        <Section title="Processes" count={processes.length}
          action={onDesignProcess ? (
            <Button variant="outline" size="xs" data-testid="type-design-process" onClick={() => onDesignProcess(detail.id)}
              title={`Design a process ${detail.display_name} goes through, on a page of its own — counted on the data as you build it`}>
              <Icon name="plus" size={12} /> New process
            </Button>
          ) : (
            <DeclareProcess detail={detail} connectionId={connectionId} schema={schema} onOpenProcess={onOpenProcess} onChanged={onChanged} />
          )}>
          {processes.map((p) => (
            <div key={p.id} className="aug-entity-row" data-testid="type-process">
              <span style={{ color: "var(--t1)" }}>{p.display_name}</span>
              <span style={{ color: "var(--t3)" }}>{p.roles.join(" · ")}</span>
              {p.verified === false && <span className="aug-tag aug-tag-red">measured false</span>}
              <span className="acts">
                <Button variant="outline" size="xs" disabled={!onOpenProcess} onClick={() => onOpenProcess?.(p.id)}
                  title="Open the process — it is changed and removed on its own page">Change</Button>
              </span>
            </div>
          ))}
          {!processes.length && <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>None yet.</p>}
        </Section>
      </>
    );
  }
  return (
    <Section title="Processes and rules" aside="what declarations derive here">
      {processes.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", marginBottom: 4 }}
          data-testid="type-process">
          <Button variant="minimal" size="xs" disabled={!onOpenProcess} onClick={() => onOpenProcess?.(p.id)}>
            {p.display_name}
          </Button>
          <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>{p.roles.join(" · ")}</span>
          {p.verified === false && <span className="aug-tag aug-tag-red">measured false</span>}
        </div>
      ))}
      {derived.length > 0 && <DerivedList rows={derived} />}
      {!processes.length && !derived.length && (
        <p className="aug-fs-xs" style={{ margin: "0 0 6px", color: "var(--t3)" }}>
          No declared process or rule touches this type yet.
        </p>
      )}
    </Section>
  );
}

const SNAKE = /^[a-z][a-z0-9_]{0,63}$/;

function isMoment(p: TypeProperty): boolean {
  return p.role === "timestamp" || /DATE|TIME/i.test(p.data_type);
}

function listOf(text: string): string[] {
  return text.split(",").map((v) => v.trim()).filter(Boolean);
}

type StageDraft = { name: string; timestamp: string; terms: "" | "within_days" | "within_hours"; amount: string };
const NO_STAGE: StageDraft = { name: "", timestamp: "", terms: "", amount: "" };

/** ON-9 — declare a process the type goes through: its stages in order, each at the moment an object reaches it, and on
 *  a stage after the first the promise about reaching it — within N calendar days, or N hours, of the stage before.
 *  The server resolves every moment and counts the whole process before anything is written. A deadline promise, kept
 *  per another type, is declared through the API. */
function DeclareProcess({ detail, connectionId, schema, onOpenProcess, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onOpenProcess?: (processId: string) => void;
  onChanged: () => void;
}) {
  const moments = detail.properties.filter(isMoment);
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [stages, setStages] = useState<StageDraft[]>([NO_STAGE, NO_STAGE]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const edit = (i: number, change: Partial<StageDraft>) =>
    setStages((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const ready = SNAKE.test(id.trim()) && stages.length >= 2 && stages.every((s, i) =>
    SNAKE.test(s.name.trim()) && !!s.timestamp && (!s.terms || (i > 0 && /^\d+$/.test(s.amount.trim()))));
  const submit = async () => {
    setBusy(true);
    setProblem("");
    const spec: DeclaredProcessSpec = {
      id: id.trim(), entity: detail.id, ...(name.trim() ? { display_name: name.trim() } : {}),
      stages: stages.map((s) => ({
        name: s.name.trim(), timestamp: s.timestamp,
        ...(s.terms === "within_hours" ? { promise: { within_hours: Number(s.amount.trim()) } }
          : s.terms === "within_days" ? { promise: { within_days: Number(s.amount.trim()) } } : {}),
      })),
    };
    try {
      const made = await declareProcess(connectionId, spec, schema);
      setOpen(false);
      setId(""); setName(""); setStages([NO_STAGE, NO_STAGE]);
      onChanged();
      onOpenProcess?.(made.id);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Door open={open} onOpenChange={setOpen} busy={busy} label="New process" disabled={moments.length < 2} testId="process-door"
      hint={moments.length < 2 ? "A process runs between two moments of this entity, and it has fewer"
        : "The stages this entity goes through, and the promises about reaching them"}
      title={`New process for ${detail.display_name}`}>
    <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 6, padding: "8px 0", borderTop: RULE }}
      data-testid="process-declare">
      <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)", lineHeight: 1.45 }}>
        A process {detail.display_name} goes through: its stages in order, each at the moment an object reaches it. Every
        moment is resolved and the whole process counted before anything is written.
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <Input style={{ ...FIELD, flex: 1 }} value={id} placeholder="id — order_fulfilment"
          aria-label="Process id" onChange={(e) => setId(e.target.value)} />
        <Input style={{ ...FIELD, flex: 1 }} value={name} placeholder="Display name (optional)"
          aria-label="Process display name" onChange={(e) => setName(e.target.value)} />
      </div>
      {stages.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Input style={{ ...FIELD, width: 110 }} value={s.name} placeholder={i ? "shipped" : "placed"}
            aria-label={`Stage ${i + 1} name`} onChange={(e) => edit(i, { name: e.target.value })} />
          <SelectField style={SELECT} value={s.timestamp} aria-label={`Stage ${i + 1} moment`}
            onChange={(e) => edit(i, { timestamp: e.target.value })}>
            <option value="">moment…</option>
            {moments.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </SelectField>
          {i > 0 && (
            <SelectField style={SELECT} value={s.terms} aria-label={`Stage ${i + 1} promise`}
              onChange={(e) => edit(i, { terms: e.target.value as StageDraft["terms"] })}>
              <option value="">no promise</option>
              <option value="within_days">within days</option>
              <option value="within_hours">within hours</option>
            </SelectField>
          )}
          {i > 0 && s.terms && (
            <Input style={{ ...FIELD, width: 56 }} value={s.amount} inputMode="numeric"
              placeholder={s.terms === "within_hours" ? "24" : "2"}
              aria-label={`Stage ${i + 1} promise ${s.terms === "within_hours" ? "hours" : "days"}`}
              onChange={(e) => edit(i, { amount: e.target.value })} />
          )}
          {i > 1 && (
            <Button variant="ghost" size="xs" disabled={busy}
              onClick={() => setStages((all) => all.filter((_, j) => j !== i))}>Remove</Button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setStages((all) => [...all, NO_STAGE])}>
          Add a stage
        </Button>
        <Button variant="outline" size="xs" disabled={busy || !ready} onClick={submit}>
          {busy ? "Counting…" : "Save to the draft"}
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {problem && <p className="aug-fs-xs" style={{ margin: 0, color: "var(--red5)", lineHeight: 1.45 }}>{problem}</p>}
    </div>
    </Door>
  );
}

const OPS = ["=", "!=", "in", "not_in", ">", ">=", "<", "<=", "is_null", "not_null"];
const NO_VALUE = new Set(["is_null", "not_null"]);
const LISTED = new Set(["in", "not_in"]);

function slug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "r_$1").slice(0, 64);
}

/** The rule form: the same one makes a rule and changes it. A rule's id is the name of the set it makes, so it is made
 *  from the name once and never changes after. */
export function RuleForm({ detail, connectionId, schema, existing, onDone, onCancel }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  /** The rule being changed; absent, a new one. */
  existing?: RuleDetail;
  onDone: () => void;
  onCancel: () => void;
}) {
  const groupable = detail.properties.filter((p) => !p.is_key && !isMoment(p));
  const first = existing?.conditions?.[0] as { path?: string; op?: string; value?: unknown; values?: unknown[] } | undefined;
  const [name, setName] = useState(existing?.display_name ?? "");
  const [id, setId] = useState(existing?.id ?? "");
  const [idSaid, setIdSaid] = useState(!!existing);
  const [kind, setKind] = useState<"value_set" | "condition">(existing?.kind ?? "condition");
  const [property, setProperty] = useState(existing ? (existing.kind === "value_set" ? existing.property : String(first?.path ?? "")) : "");
  const [values, setValues] = useState(existing?.kind === "value_set" ? existing.values.join(", ") : "");
  const [op, setOp] = useState(String(first?.op ?? "="));
  const [value, setValue] = useState(!first ? "" : Array.isArray(first.values) ? first.values.join(", ") : first.value == null ? "" : String(first.value));
  const [scopes, setScopes] = useState<string[]>(existing?.scopes ?? []);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const ready = SNAKE.test(id.trim()) && !!property && (kind === "value_set" ? listOf(values).length > 0
    : NO_VALUE.has(op) || (LISTED.has(op) ? listOf(value).length > 0 : !!value.trim()));
  const submit = async () => {
    setBusy(true);
    setProblem("");
    const condition = { path: property, op,
      ...(NO_VALUE.has(op) ? {} : LISTED.has(op) ? { values: listOf(value) } : { value: value.trim() }) };
    const spec: DeclaredRuleSpec = { id: id.trim(), entity: detail.id, kind,
      ...(name.trim() ? { display_name: name.trim() } : {}),
      ...(kind === "value_set" ? { property, values: listOf(values) } : { conditions: [condition] }),
      ...(scopes.length ? { scopes } : {}) };
    try {
      await (existing ? changeRule : declareRule)(connectionId, spec, schema);
      savedToDraft(existing ? "Changed" : "New rule");
      onDone();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="rule-declare">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="The rule's name" style={{ flex: 2, minWidth: 200 }}>
          <Input value={name} placeholder="Completed orders" aria-label="Rule name"
            onChange={(e) => { setName(e.target.value); if (!idSaid) setId(slug(e.target.value)); }} />
        </Field>
        <Field label="Its id" hint={existing ? "the name of the set it makes — it does not change" : "made from the name"} style={{ flex: 1, minWidth: 160 }}>
          <Input style={MONO} value={id} placeholder="completed_orders" aria-label="Rule id" disabled={!!existing}
            onChange={(e) => { setId(e.target.value); setIdSaid(true); }} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="It is" style={{ minWidth: 130 }}>
          <SelectField value={kind} aria-label="Rule kind"
            onChange={(e) => { setKind(e.target.value as "value_set" | "condition"); setProperty(""); }}>
            <option value="condition">a condition</option>
            <option value="value_set">a set of values</option>
          </SelectField>
        </Field>
        <Field label={`Rows of ${detail.display_name} where`} style={{ minWidth: 160, flex: 1 }}>
          <SelectField value={property} aria-label="Rule property" onChange={(e) => setProperty(e.target.value)}>
            <option value="">choose a property…</option>
            {(kind === "value_set" ? groupable : detail.properties).map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </SelectField>
        </Field>
        {kind === "value_set" ? (
          <Field label="is one of" style={{ flex: 2, minWidth: 180 }}>
            <Input value={values} placeholder="DE, AT, CH" aria-label="Rule values" onChange={(e) => setValues(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="is" style={{ minWidth: 110 }}>
              <SelectField value={op} aria-label="Rule operator" onChange={(e) => setOp(e.target.value)}>
                {OPS.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
              </SelectField>
            </Field>
            {!NO_VALUE.has(op) && (
              <Field label="this" style={{ flex: 2, minWidth: 160 }}>
                <Input value={value} placeholder={LISTED.has(op) ? "cancelled, refunded" : "value"} aria-label="Rule value"
                  onChange={(e) => setValue(e.target.value)} />
              </Field>
            )}
          </>
        )}
      </div>
      {detail.metrics.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>scopes</span>
          {detail.metrics.map((m) => (
            <label key={m.id} className="aug-fs-xs" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--t2)" }}>
              <Checkbox checked={scopes.includes(m.id)}
                onChange={(e) => setScopes((all) => (e.target.checked ? [...all, m.id] : all.filter((s) => s !== m.id)))} />
              {m.display_name || m.id}
            </label>
          ))}
        </div>
      )}
      <FormFoot busy={busy} ready={ready} onSave={() => void submit()} onCancel={onCancel} busyLabel="Counting…" problem={problem} />
    </div>
  );
}

/** ON-9 — a rule over the entity: a set of values under one name, or a condition, and the verified metrics it scopes.
 *  Compiled and counted before anything is written; the object door reads the rule as a segment named by its id. */
function DeclareRule({ detail, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Door open={open} onOpenChange={setOpen} label="New rule" testId="rule-door" title={`New rule on ${detail.display_name}`}
      hint="A named set of this entity's rows — a condition, or values grouped under one name"
      description="It is compiled and counted before anything is written, and read as a set named by its id.">
      <RuleForm detail={detail} connectionId={connectionId} schema={schema} onCancel={() => setOpen(false)}
        onDone={() => { setOpen(false); onChanged(); }} />
    </Door>
  );
}

/** Change a rule a person made. A rule of several conditions was written through the API and this form holds one, so it
 *  is not offered a form that would drop the rest. */
function ChangeRule({ rule, detail, connectionId, schema, onChanged }: {
  rule: RuleDetail;
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const several = rule.kind === "condition" && rule.conditions.length > 1;
  return (
    <Door open={open} onOpenChange={setOpen} label="Change" icon={null} variant="outline" testId="rule-change" disabled={several}
      hint={several ? "This rule has several conditions; it is changed where it was written, through the API" : `Change the rule ${rule.display_name}`}
      title={`Change the rule ${rule.display_name}`}
      description="Compiled and counted again before it replaces the one that stands.">
      <RuleForm detail={detail} connectionId={connectionId} schema={schema} existing={rule} onCancel={() => setOpen(false)}
        onDone={() => { setOpen(false); onChanged(); }} />
    </Door>
  );
}

/** The key: what makes one object, measured over the rows. In edit mode a person names it — one column, or SEVERAL
 *  together (the Olist study, Gap 13: order lines, payments and reviews are keyed by a pair, and the door offered one
 *  column, so all three said "not unique per row" for good). */
function KeySection({ detail, connectionId, schema, onChanged, readOnly }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const { key } = detail;
  const editing = useEditing();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const verdict = key.verified === true ? ["aug-tag-green", "unique per object"]
    : key.verified === false ? ["aug-tag-red", "not unique per row"] : ["aug-tag-gray", "not yet measured"];
  // The backing's own columns: an expression or an overlay is not a column a key can be read from.
  const columns = detail.properties.filter((p) => p.source.binding !== "overlay" && !p.source.kind && !p.source.expression)
    .map((p) => p.name);
  const toggle = (name: string) => setPicked((x) => (x.includes(name) ? x.filter((n) => n !== name) : [...x, name]));
  const use = async () => {
    setBusy(true);
    setProblem("");
    try {
      await setEntityKey(connectionId, detail.id, picked, schema);
      savedToDraft("Key");
      setPicked([]);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Key" aside={key.rows == null ? undefined : `measured over ${formatCount(key.rows)} rows`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--t3)", display: "inline-flex" }}><Icon name="key" size={14} /></span>
        <span className="aug-fs-sm" style={{ ...MONO, color: "var(--t1)" }}>{key.property}</span>
        <span className={`aug-tag ${verdict[0]}`} data-testid="entity-key-verdict">{verdict[1]}</span>
      </div>
      {key.note && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>{key.note}</p>}
      {!readOnly && editing && columns.length > 0 && (
        <div data-testid="entity-key-door" style={{ marginTop: 8 }}>
          <div className="aug-fs-xs" style={{ color: "var(--t3)", marginBottom: 4 }}>
            Key from {picked.length > 1 ? "these columns together" : "a column, or several together"}:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {columns.map((name) => (
              <Button key={name} size="xs" variant={picked.includes(name) ? "secondary" : "ghost"} disabled={busy}
                aria-pressed={picked.includes(name)} onClick={() => toggle(name)}>
                <span style={MONO}>{name}</span>
              </Button>
            ))}
            <Button size="xs" variant="secondary" disabled={busy || picked.length === 0} onClick={() => void use()}
              title="Use as the key and measure it over the rows — no model call">
              {busy ? "Checking…" : picked.length > 1 ? `Use these ${picked.length} as the key` : "Use as the key"}
            </Button>
          </div>
        </div>
      )}
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

/** ON-7 — the type this one is a part of: named, openable, and releasable. A mark that no longer holds — the parent
 *  dropped the binding this type was read through — says so rather than pretending. */
function PartOfLine({ detail, connectionId, schema, onOpen, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onOpen: (objectType: string) => void;
  onChanged: () => void;
}) {
  const editing = useEditing();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const part = detail.part_of;
  if (!part) return null;
  const release = async () => {
    setBusy(true);
    setProblem("");
    try {
      await setPartOf(connectionId, detail.id, "", schema);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="aug-fs-xs" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      data-testid="entity-part-of">
      <span className={`aug-tag ${part.holds ? "aug-tag-blue" : "aug-tag-amber"}`}>{part.holds ? "part of" : "was a part of"}</span>
      {part.holds
        ? <Button variant="ghost" size="xs" onClick={() => onOpen(part.object_type)} title={`Open ${part.display_name}`}>{part.display_name}</Button>
        : <span style={{ color: "var(--t2)" }}>{part.display_name}</span>}
      {editing && (
        <Button variant="minimal" size="xs" disabled={busy} onClick={release}
          title="Stand this type on its own again — its binding on the parent stays">
          {busy ? "Releasing…" : "Release"}
        </Button>
      )}
      {!part.holds && <span style={{ color: "var(--t3)", flexBasis: "100%", lineHeight: 1.45 }}>{part.note}</span>}
      {problem && <span style={{ color: "var(--red5)", flexBasis: "100%" }}>{problem}</span>}
    </div>
  );
}

/** ON-7 — remove an entity a person made, after the one question. An entity the builder made from a table has no
 *  such door: it is absorbed into another, never deleted. */
function WithdrawEntity({ detail, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <RemoveAsk what={detail.display_name} testId="entity-withdraw" icon="trash" label={`Remove ${detail.display_name}`}
        effect={`${detail.display_name} goes, and every link made on it with it: ${countNoun(detail.counts.links, "link")}, ${countNoun(detail.counts.metrics, "metric")} and ${countNoun(detail.counts.actions, "action")} stop reading it.`}
        back="It was made by a person, so it is made again from New entity."
        remove={() => deleteEntity(connectionId, detail.id, schema)} onRemoved={() => { savedToDraft("Removed"); onChanged(); }} />
    </div>
  );
}

/** ON-7b — make an explorer's proposal a person's. The declaration and its measurement stay exactly as they are; `origin`
 *  becomes human and the model that proposed it is kept beside it. A target that is not a model's proposal is refused
 *  with the reason, shown here. */
function ConfirmProposal({ target, connectionId, schema, onChanged }: {
  target: ConfirmTarget;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const confirm = async () => {
    setBusy(true);
    setProblem("");
    try {
      const out = await confirmProposals(connectionId, { targets: [target] }, schema);
      if (out.refused.length) setProblem(out.refused.map((r) => r.why).join("; "));
      else onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" size="xs" disabled={busy} onClick={confirm} data-testid="proposal-confirm"
        title="Make this proposal yours — it stays exactly as it was measured">
        {busy ? "Confirming…" : "Confirm"}
      </Button>
      {/* the no that was missing: a proposal is the model's own declaration, so refusing it removes that declaration */}
      <RemoveAsk label="Refuse" testId="proposal-refuse" hint="Refuse this proposal — it is taken out of the draft"
        what={target.kind === "entity" ? "the proposed entity" : target.kind === "link" ? "the proposed link" : "the proposed source"}
        effect="The explorer proposed it and nobody confirmed it, so no reader has it. Refusing takes it out of the draft."
        back={target.kind === "entity" ? "The explorer may propose it again on its next draft." : "It is kept in History, where Put back returns it."}
        remove={() => (target.kind === "entity" ? deleteEntity(connectionId, target.entity ?? "", schema)
          : target.kind === "link" ? deleteLink(connectionId, target.relationship ?? "", schema)
          : removeBinding(connectionId, target.entity ?? "", target.binding ?? "", schema))}
        onRemoved={onChanged} />
      {problem && <span className="aug-fs-xs" style={{ color: "var(--red5)", flexBasis: "100%" }}>{problem}</span>}
    </>
  );
}

/** ON-7 — the types that are parts of this one: an order's lines, a return's logistics row. Each is still a type,
 *  openable by name, and read through the binding shown beside it. */
function PartsSection({ detail, types, connectionId, schema, onOpen, onChanged }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onOpen: (objectType: string) => void;
  onChanged: () => void;
}) {
  const editing = useEditing();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const parts = detail.parts ?? [];
  if (parts.length === 0) return null;
  // The write doors take the entity id; the map row has it, and the api name resolves there too.
  const partId = (objectType: string) => types.find((t) => t.object_type === objectType)?.id ?? objectType;
  const release = async (part: string, id: string) => {
    setBusy(part);
    setProblem("");
    try {
      await setPartOf(connectionId, id, "", schema);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <Section title="Parts" aside="types folded into this one">
      {parts.map((part, i) => (
        <div key={part.object_type} style={{ padding: "6px 0", borderTop: i ? RULE : undefined, display: "flex",
                                              alignItems: "center", gap: 6, flexWrap: "wrap" }} data-testid="entity-part">
          <Button variant="ghost" size="xs" onClick={() => onOpen(part.object_type)} title={`Open ${part.display_name}`}>
            {part.display_name}
          </Button>
          <span className="aug-fs-xs" style={{ ...MONO, color: "var(--t3)" }}>through {part.binding} · {part.kind}</span>
          {part.origin === "model" && (
            <>
              <span className="aug-tag aug-tag-violet" title={`proposed by ${part.provenance || "an explorer"} — confirm it, or release it`}>
                proposed
              </span>
              <ConfirmProposal target={{ kind: "binding", entity: detail.id, binding: part.binding }}
                connectionId={connectionId} schema={schema} onChanged={onChanged} />
            </>
          )}
          {editing && (
            <Button variant="minimal" size="xs" disabled={busy === part.object_type} style={{ marginLeft: "auto" }}
              onClick={() => release(part.object_type, partId(part.object_type))}
              title="Stand this type on its own again — the binding stays">
              {busy === part.object_type ? "Releasing…" : "Release"}
            </Button>
          )}
        </div>
      ))}
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

function DisplaySection({ detail, connectionId, schema, onChanged, readOnly }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
  /** ON-8 — shown, and measured, but not declared from here. */
  readOnly?: boolean;
}) {
  const shown = detail.display_property;
  const editing = useEditing();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // A display property is measured over the backing, so only a property the backing supplies can be declared.
  const choices = detail.properties.filter((p) => p.source.binding !== "overlay" && !p.source.kind
    && (p.is_key || p.role === "dimension" || p.role === "text"));
  const act = async (write: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    try {
      await write();
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const warrant = shown.source === "human" ? "declared by a person"
    : shown.source === "proposed" ? "proposed from the profile" : "no other property names it";
  let verdict: React.ReactNode = null;
  if (shown.source !== "key") {
    verdict = shown.verified === true
      ? <span className="aug-tag aug-tag-green">names objects</span>
      : shown.verified === false
        ? <span className="aug-tag aug-tag-amber">does not name objects</span>
        : <span className="aug-tag aug-tag-gray">not yet measured</span>;
  }
  return (
    <Section title="Named by" aside={warrant}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} data-testid="entity-display-property">
        <span className="aug-fs-sm" style={{ ...MONO, color: "var(--t1)" }}>{shown.property}</span>
        {verdict}
      </div>
      {shown.note && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>{shown.note}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {!readOnly && editing && (
          <>
            <label className="aug-fs-xs" htmlFor={`display-${detail.object_type}`} style={{ color: "var(--t3)" }}>Choose</label>
            <SelectField id={`display-${detail.object_type}`} style={SELECT} value={shown.property}
              disabled={busy} onChange={(e) => act(() => declareDisplayProperty(connectionId, detail.id, e.target.value, schema))}>
              {choices.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </SelectField>
          </>
        )}
        <Button variant="minimal" size="xs" disabled={busy} onClick={() => act(() => measureOntology(connectionId, schema))}
          title="Count keys, link cardinalities, lifecycles and display properties against the data — no model call">
          {busy ? "Checking…" : "Check"}
        </Button>
      </div>
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

/** Where a property is read from: `table.column` (the binding's full name on hover), or the overlay of edits. */
function sourceText(source: PropertySource): { short: string; full: string } {
  if (source.expression) return { short: `= ${source.expression}`, full: `an expression over the row: ${source.expression}` };
  if (source.binding === "overlay") {
    const text = `overlay · ${countNoun(source.edits ?? 0, "accepted edit")}`;
    return { short: text, full: text };
  }
  const table = source.table ?? source.binding;
  const bare = table.split(".").pop() ?? table;
  const column = source.column ?? "";
  // ON-5 — a frame has no column: it is computed over the readings, so the row says what it is.
  if (source.frame) {
    return { short: source.frame, full: `${source.frame} · the timeseries binding ${source.binding}` };
  }
  // ON-7 — a rollup likewise: computed over the object's rows, not read from one.
  if (source.rollup) {
    return { short: source.rollup, full: `${source.rollup} · the detail binding ${source.binding}` };
  }
  const how = source.kind
    ? ` · the ${source.kind} binding ${source.binding}`
      + (source.read === false ? ", not read yet" : source.kind === "timeseries" ? ", its latest value"
         : source.kind === "detail" ? ", rolled up" : "")
    : "";
  return { short: `${bare}.${column}`, full: `${table}.${column}${how}` };
}

/** 2026-09-22 — typed properties a person mapped to an expression over the type's own row (ON-1b's deferred half).
 *  Declared here, checked and run on one row by the server, listed with its verdict, and removed here. */
function ExpressionsSection({ detail, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [role, setRole] = useState<"measure" | "dimension">("measure");
  const [unit, setUnit] = useState("");
  const editing = useEditing();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const rows = detail.expressions ?? [];
  const act = async (key: string, write: () => Promise<void>) => {
    setBusy(key);
    setProblem("");
    try {
      await write();
      onChanged();
      setOpen(false);
      setName(""); setExpression(""); setUnit("");
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy("");
    }
  };
  // Read first: with none declared, the section is only its door — which is behind Edit.
  if (!rows.length && !editing && !problem) return null;
  const door = !editing ? null : (
        <Door open={open} onOpenChange={setOpen} busy={!!busy} label="New calculated property" testId="expression-door"
          hint="A property computed from the row, in SQL a person writes" title={`New calculated property on ${detail.display_name}`}
          description="A property computed from the row. It is run against the data before it is kept.">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }} data-testid="declare-expression">
          <Input style={FIELD} value={name} placeholder="days_to_ship" aria-label="Expression name"
            onChange={(e) => setName(e.target.value)} />
          <Input style={{ ...FIELD, ...MONO }} value={expression} aria-label="Expression SQL"
            placeholder="date_diff('day', order_date, shipped_at)" onChange={(e) => setExpression(e.target.value)} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <SelectField style={SELECT} value={role} aria-label="Expression role"
              onChange={(e) => setRole(e.target.value as "measure" | "dimension")}>
              <option value="measure">measure</option>
              <option value="dimension">dimension</option>
            </SelectField>
            <Input style={{ ...FIELD, width: 90 }} value={unit} placeholder="unit" aria-label="Expression unit"
              onChange={(e) => setUnit(e.target.value)} />
            <Button variant="outline" size="xs" disabled={!!busy || !name.trim() || !expression.trim()}
              onClick={() => act("declare", () => declareExpression(connectionId, detail.id, name.trim(),
                { expression: expression.trim(), semantic_type: role, unit: unit.trim() }, schema))}>
              {busy === "declare" ? "Checking…" : "Save to the draft"}
            </Button>
            <Button variant="ghost" size="xs" disabled={!!busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {problem && <p className="aug-fs-xs" role="alert" style={{ margin: 0, color: "var(--red5)" }}>{problem}</p>}
        </div>
        </Door>
  );
  return (
    <Section title="Calculated properties" count={rows.length} aside="computed from the row, in SQL a person wrote" action={door}>
      {rows.map((e) => (
        <div key={e.name} className="aug-fs-xs" data-testid="entity-expression"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", flexWrap: "wrap" }}>
          <span style={{ ...MONO, color: "var(--t1)" }}>{e.name}</span>
          <span style={{ ...MONO, color: "var(--t3)" }}>= {e.expression}</span>
          <span className="aug-tag aug-tag-gray">{e.role}{e.unit ? ` · ${e.unit}` : ""}</span>
          {e.verified === true
            ? <span className="aug-tag aug-tag-green">runs</span>
            : <span className="aug-tag aug-tag-amber" title={e.note}>did not bind</span>}
          {editing && (
            <span style={{ marginLeft: "auto" }}>
              <RemoveAsk what={`the expression ${e.name}`} testId="expression-remove"
                effect={`${detail.display_name} stops having ${e.name}; a question or a metric that reads it is refused.`}
                back="A removed expression is made again from New expression."
                remove={() => removeExpression(connectionId, detail.id, e.name, schema)} onRemoved={() => { savedToDraft("Removed"); onChanged(); }} />
            </span>
          )}
        </div>
      ))}
      {problem && !open && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

function PropertiesSection({ detail }: { detail: ObjectTypeDetail }) {
  const cell: React.CSSProperties = { padding: "4px 8px 4px 0", verticalAlign: "top" };
  const clip: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return (
    <Section title="Properties"
      aside={`${formatCount(detail.counts.properties)}${detail.properties_truncated ? `, the first ${detail.properties.length} shown` : ""}`}>
      <Table layout="fixed" className="aug-fs-xs" 
        data-testid="entity-properties">
        <colgroup>
          <col style={{ width: "36%" }} />
          <col style={{ width: "24%" }} />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow style={{ color: "var(--t3)", textAlign: "left" }}>
            <TableHead style={{ ...cell, fontWeight: 500 }}>Property</TableHead>
            <TableHead style={{ ...cell, fontWeight: 500 }}>Role</TableHead>
            <TableHead style={{ ...cell, fontWeight: 500 }}>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.properties.map((p) => {
            const source = sourceText(p.source);
            return (
              <TableRow key={p.name} style={{ borderTop: RULE }}>
                <TableCell style={{ ...cell, ...MONO, color: "var(--t1)" }} title={p.description || p.name}>
                  {/* the kind's mark in a square first, so every name starts at one x (2026-10-25); the key's mark after it */}
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <ColumnTypeSquare type={p.data_type} size={14} />
                    {p.is_key && <span style={{ color: "var(--t3)", display: "inline-flex" }}><Icon name="key" size={11} label="Key" /></span>}
                    <span style={clip}>{p.name}</span>
                  </span>
                </TableCell>
                <TableCell style={{ ...cell, ...clip, color: "var(--t2)" }} title={p.data_type || undefined}>{p.role || "—"}</TableCell>
                <TableCell style={{ ...cell, ...MONO, ...clip, color: "var(--t2)" }} title={source.full}>{source.short}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}

/** A further binding's verdict: read by the compiler, and HOW — a timeseries binding is read as each object's
 *  latest value (ON-5), which is a different claim from a static one — or the reason it is not read. The backing
 *  carries none. */
/** ON-5 — the frames a binding computes, each in the declaration's own words. */
function FrameLines({ binding }: { binding: TypeBinding }) {
  const frames = Object.entries(binding.frames ?? {});
  if (frames.length === 0) return null;
  return (
    <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 3 }}>
      {frames.map(([name, said]) => (
        <div key={name} style={{ overflowWrap: "anywhere" }}>
          <span style={MONO}>{name}</span> — {said}
        </div>
      ))}
    </div>
  );
}

/** ON-7 — the rollups a detail binding computes, each in the declaration's own words. */
function RollupLines({ binding }: { binding: TypeBinding }) {
  const rollups = Object.entries(binding.rollups ?? {});
  if (rollups.length === 0) return null;
  return (
    <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 3 }}>
      {rollups.map(([name, said]) => (
        <div key={name} style={{ overflowWrap: "anywhere" }}>
          <span style={MONO}>{name}</span> — {said}
        </div>
      ))}
    </div>
  );
}

function bindingVerdict(b: TypeBinding): [string, string] | null {
  if (b.primary) return null;
  if (b.usable) {
    return ["aug-tag-green", b.kind === "timeseries" ? `read · latest by ${b.time_column}`
      : b.kind === "detail" ? "read · rolled up" : "read"];
  }
  if (b.kind === "timeseries" && !b.time_column) return ["aug-tag-gray", "no time column"];
  return b.verified === false ? ["aug-tag-red", "refuted"] : ["aug-tag-gray", "not yet measured"];
}

function BindingRow({ binding: b, first, busy, onRemove, confirm, source }: {
  binding: TypeBinding;
  first: boolean;
  busy: boolean;
  onRemove?: () => Promise<void> | void;
  /** ON-7b — the door that makes an explorer's binding a person's, given only for one. */
  confirm?: React.ReactNode;
  /** ON-8 — in an organisation's ontology, the name of the connection the source lives on. */
  source?: string;
}) {
  const verdict = bindingVerdict(b);
  const term: React.CSSProperties = { color: "var(--t3)" };
  const value: React.CSSProperties = { margin: 0, color: "var(--t1)" };
  const skipped = Object.entries(b.skipped ?? {});
  return (
    <div style={{ padding: "8px 0", borderTop: first ? undefined : RULE }} data-testid="entity-binding">
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="aug-fs-sm" style={{ ...MONO, color: "var(--t1)" }}>{b.name}</span>
        <span className="aug-tag aug-tag-gray">{b.primary ? "backing" : b.kind}</span>
        {verdict && <span className={`aug-tag ${verdict[0]}`}>{verdict[1]}</span>}
        {b.source === "model" && (
          <span className="aug-tag aug-tag-violet" title={`proposed by ${b.provenance || "an explorer"}, not yet confirmed`}>
            proposed
          </span>
        )}
        {confirm}
        {onRemove && (
          <span style={{ marginLeft: "auto" }}>
            <RemoveAsk what={`the source ${b.name}`} testId="binding-remove" effect="The properties it supplies stop resolving."
              remove={async () => { await onRemove(); }} />
          </span>
        )}
      </div>
      <dl className="aug-fs-xs"
        style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: 12, rowGap: 3, margin: "6px 0 0" }}>
        <dt style={term}>{b.reads === "table" ? "Table" : "Query"}</dt>
        <dd style={{ ...value, ...MONO, overflowWrap: "anywhere" }}>{b.reads === "table" ? b.table : b.sql}</dd>
        {source && (
          <>
            <dt style={term}>Connection</dt>
            <dd style={value} data-testid="entity-binding-connection">{source}</dd>
          </>
        )}
        <dt style={term}>Key</dt>
        <dd style={{ ...value, ...MONO }}>{b.primary ? b.key : `${b.key} → ${b.object_key}`}</dd>
        {b.time_column && (
          <>
            <dt style={term}>Time</dt>
            <dd style={{ ...value, ...MONO }}>{b.time_column}</dd>
          </>
        )}
        <dt style={term}>Rows</dt>
        <dd style={value}>{b.rows == null ? "not yet measured" : formatCount(b.rows)}</dd>
        {!b.primary && b.covered != null && b.objects != null && (
          <>
            <dt style={term}>Covers</dt>
            <dd style={value}>
              {formatCount(b.covered)} of {formatCount(b.objects)} objects
              {b.orphans ? ` · ${countNoun(b.orphans, "key")} reach no object` : ""}
            </dd>
          </>
        )}
        <dt style={term}>Supplies</dt>
        <dd style={value}>{countNoun(b.supplies, "property", "properties")}</dd>
      </dl>
      <FrameLines binding={b} />
      <RollupLines binding={b} />
      {!b.primary && (b.why_not || b.note) && (
        <p className="aug-fs-xs" style={{ margin: "4px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>{b.why_not || b.note}</p>
      )}
      {skipped.length > 0 && (
        <p className="aug-fs-xs" style={{ margin: "4px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>
          Not supplied: {skipped.map(([column, why]) => `${column} (${why})`).join("; ")}
        </p>
      )}
    </div>
  );
}

/** What a proposal's kind says about its rows, beside what it would supply. */
function proposalShape(p: ProposedBinding): string {
  if (p.kind === "detail") return " — many rows per object: a part";
  if (p.kind === "timeseries") return ` — readings over ${p.spec.time_column ?? "time"}: read as each object's latest`;
  return "";
}

function ProposalRow({ proposal: p, busy, onBind }: { proposal: ProposedBinding; busy: boolean; onBind: () => void }) {
  return (
    <div style={{ padding: "7px 0", borderTop: RULE }} data-testid="entity-binding-proposal">
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className="aug-fs-sm" style={{ ...MONO, color: "var(--t1)" }}>{p.table}</span>
        <span className="aug-tag aug-tag-violet">proposed · {p.kind}</span>
        <Button variant="outline" size="xs" disabled={busy} onClick={onBind} style={{ marginLeft: "auto" }}
          title={`Bind ${p.table} on ${p.key} — its columns are checked and it is counted against the objects first`}>
          {busy ? "Confirming…" : "Confirm"}
        </Button>
      </div>
      <p className="aug-fs-xs" style={{ margin: "3px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>
        <span style={MONO}>{p.key} → {p.object_key}</span> · {p.note}
      </p>
      <p className="aug-fs-xs" style={{ ...MONO, margin: "3px 0 0", color: "var(--t2)", overflowWrap: "anywhere" }}>
        would supply {p.supplies.join(", ")}{proposalShape(p)}
      </p>
    </div>
  );
}

/** ON-1 — read this type from a keyed SELECT. The preview says, before anything is written, whether the SELECT reads,
 *  how many rows it holds, whether its key is unique over them, and which of the type's properties it keeps, drops —
 *  the compiler reads every property from the backing, so a dropped one would stop resolving — and adds. It is set
 *  only when its key is unique and it drops nothing; withdrawn, the type reads its table again. */
function BackingEditor({ detail, busy, onPreview, onSet, onWithdraw, problem: refused = "" }: {
  detail: ObjectTypeDetail;
  busy: boolean;
  onPreview: (sql: string, key: string) => Promise<BackingPreview>;
  /** True once it is saved: the dialog closes. A refusal comes back as `problem`, shown in the dialog. */
  onSet: (sql: string, key: string) => Promise<boolean>;
  onWithdraw: () => void;
  problem?: string;
}) {
  const primary = detail.bindings.find((b) => b.primary);
  const readsQuery = primary?.reads === "query";
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState(readsQuery ? primary?.sql ?? "" : "");
  const [key, setKey] = useState(detail.key.property);
  const [preview, setPreview] = useState<BackingPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState("");
  const look = async () => {
    setLooking(true);
    setProblem("");
    try {
      setPreview(await onPreview(sql.trim(), key.trim()));
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setLooking(false);
    }
  };
  const blocked = !preview ? "preview it first"
    : !preview.readable ? preview.note
    : preview.dropped.length > 0
      ? `it drops ${preview.dropped.join(", ")} — select ${preview.dropped.length === 1 ? "it" : "them"} too`
    : preview.unique !== true ? (preview.note || preview.unique_note || "its key is not unique over these rows")
    : "";
  const term: React.CSSProperties = { color: "var(--t3)" };
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
    <Door open={open} onOpenChange={setOpen} busy={busy} icon="edit" testId="backing-door" width={760}
      label={readsQuery ? "Change its SELECT" : "Change what it reads"}
      hint={`Read ${detail.display_name} from a keyed SELECT instead of its table`} title={`Change what ${detail.display_name} reads`}>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: RULE }} data-testid="backing-editor">
      <p className="aug-fs-xs" style={{ margin: "0 0 6px", color: "var(--t3)", lineHeight: 1.45 }}>
        Read {detail.display_name} from a keyed SELECT: its rows are the objects, and every property is read from it.
        Nothing is written until it is set.
      </p>
      <Textarea style={{ ...FIELD, ...MONO, width: "100%", minHeight: 64 }} value={sql}
        aria-label="Backing SELECT" placeholder="SELECT c.customer_id, c.name, p.lifetime_spend FROM …"
        onChange={(e) => { setSql(e.target.value); setPreview(null); }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <span className="aug-fs-xs" style={term}>key</span>
        <Input style={{ ...FIELD, width: 150 }} value={key} aria-label="Backing key"
          onChange={(e) => { setKey(e.target.value); setPreview(null); }} />
        <Button variant="outline" size="xs" disabled={looking || !sql.trim() || !key.trim()} onClick={look}>
          {looking ? "Reading…" : "Preview"}
        </Button>
        <Button variant="outline" size="xs" disabled={busy || !!blocked} onClick={() => void onSet(sql.trim(), key.trim()).then((ok) => { if (ok) setOpen(false); })}
          title={blocked || "Read the type from this SELECT"}>
          {busy ? "Saving…" : "Save to the draft"}
        </Button>
      </div>
      {preview && preview.readable && (
        <dl className="aug-fs-xs" data-testid="backing-preview"
          style={{ display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)", columnGap: 12, rowGap: 3, margin: "6px 0 0" }}>
          <dt style={term}>Now</dt>
          <dd style={{ margin: 0, ...MONO, overflowWrap: "anywhere" }}>
            {preview.current.source} · {preview.current.rows == null ? "rows not yet measured" : `${formatCount(preview.current.rows)} rows`}
          </dd>
          <dt style={term}>Rows</dt>
          <dd style={{ margin: 0 }}>
            {preview.rows == null ? "not counted" : formatCount(preview.rows)} · key{" "}
            {preview.unique === true ? "unique" : preview.unique === false ? "NOT unique" : "not counted"}
          </dd>
          <dt style={term}>Keeps</dt>
          <dd style={{ margin: 0 }}>{countNoun(preview.kept.length, "property", "properties")}</dd>
          {preview.dropped.length > 0 && (
            <>
              <dt style={term}>Drops</dt>
              <dd style={{ margin: 0, ...MONO, color: "var(--red5)" }}>{preview.dropped.join(", ")}</dd>
            </>
          )}
          {preview.added.length > 0 && (
            <>
              <dt style={term}>Adds</dt>
              <dd style={{ margin: 0, ...MONO }}>{preview.added.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
      {(problem || refused || (preview && blocked)) && (
        <p className="aug-fs-xs" role="alert" style={{ margin: "4px 0 0", color: "var(--red5)", lineHeight: 1.45 }}>{problem || refused || blocked}</p>
      )}
    </div>
    </Door>
    {readsQuery && (
      <RemoveAsk label="Read its table again" what={`the SELECT ${detail.display_name} reads`} testId="backing-withdraw"
        effect={`${detail.display_name} reads its table again; a property only the SELECT supplied stops resolving. Its other edits stay.`}
        back="The SELECT is kept in History." remove={async () => { onWithdraw(); }} />
    )}
    </div>
  );
}

function BindingsSection({ detail, connectionId, schema, onChanged, sources }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
  /** ON-8 — set in an organisation's ontology: each binding names its connection, and a new one may pick another. */
  sources?: Record<string, string>;
}) {
  const editing = useEditing();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const sourceOf = (b: TypeBinding) => {
    const where = b.connection_id || detail.connection_id;
    return sources && where ? sources[where] ?? where : undefined;
  };
  // An API older than ON-1b sends no proposals; the panel must not fall over while the two deploy apart.
  const proposals = detail.proposed_bindings ?? [];
  // The mapping picture (2026-10-25): the primary binding's table, its columns read once from the connection; what
  // could not be read is said in the picture's own column, and the bindings below stand whatever happens here.
  const picture = detail.bindings.find((b) => b.primary) ?? detail.bindings[0];
  const pictureTable = picture && picture.reads === "table" ? picture.table || "" : "";
  const pictureConnection = picture?.connection_id || connectionId;
  const [columns, setColumns] = useState<TableColumn[] | null>(null);
  const [columnsSaid, setColumnsSaid] = useState("");
  useEffect(() => {
    let live = true;
    setColumns(null);
    setColumnsSaid("");
    if (!pictureTable) return;
    const dot = pictureTable.lastIndexOf(".");
    const [schemaOf, tableOf] = dot > 0 ? [pictureTable.slice(0, dot), pictureTable.slice(dot + 1)] : [schema, pictureTable];
    getTableColumns(pictureConnection, tableOf, schemaOf)
      .then((cols) => { if (live) setColumns(cols); })
      .catch((e: unknown) => { if (live) { setColumns([]); setColumnsSaid(`The table’s columns could not be read: ${errorText(e)}`); } });
    return () => { live = false; };
  }, [pictureTable, pictureConnection, schema]);
  const act = async (name: string, write: () => Promise<void>, said = "") => {
    setBusy(name);
    setProblem("");
    try {
      await write();
      if (said) savedToDraft(said);
      onChanged();
      return true;
    } catch (e) {
      setProblem(errorText(e));
      return false;
    } finally {
      setBusy("");
    }
  };
  return (
    <Section title="Sources" count={detail.bindings.length} aside="where its properties are read from"
      action={editing && (
        <DeclareBinding detail={detail} busy={!!busy} sources={sources} problem={problem} onDeclare={(name, spec) =>
          act(name, () => addBinding(connectionId, detail.id, name, spec, schema), "New source")} />
      )}>
      {picture && <SourceMapping detail={detail} binding={picture} columns={columns} said={columnsSaid || undefined} />}
      {detail.bindings.map((b, i) => (
        <BindingRow key={b.name} binding={b} first={i === 0} busy={busy === b.name} source={sourceOf(b)}
          onRemove={!b.primary && editing
            ? async () => { await act(b.name, () => removeBinding(connectionId, detail.id, b.name, schema), "Removed"); } : undefined}
          confirm={b.source === "model" && !sources ? (
            <ConfirmProposal target={{ kind: "binding", entity: detail.id, binding: b.name }} connectionId={connectionId}
              schema={schema} onChanged={onChanged} />
          ) : undefined} />
      ))}
      {proposals.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>
            Proposed from the data — another table carries the {detail.key.property} key. Nothing reads a proposal
            until it is bound.
          </div>
          {proposals.map((p) => (
            <ProposalRow key={p.name} proposal={p} busy={busy === p.name}
              onBind={() => act(p.name, () => addBinding(connectionId, detail.id, p.name, p.spec, schema))} />
          ))}
        </div>
      )}
      {!sources && editing && (
        <BackingEditor detail={detail} busy={busy === "backing"} problem={problem}
          onPreview={(sql, key) => previewBacking(connectionId, detail.id, sql, key, schema)}
          onSet={(sql, key) => act("backing", () => setQueryBacking(connectionId, detail.id, sql, key, schema), "Changed")}
          onWithdraw={() => act("backing", () => withdrawBacking(connectionId, detail.id, schema), "Changed")} />
      )}
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

/** ON-1b/ON-5 — declare a binding the data did not propose. The builder proposes only what another table carrying
 *  this type's key shows it: one row per object (static), many rows that are objects of their own (a part), or many
 *  rows placed in time with no identity of their own (a timeseries). A keyed SELECT is never proposed, and a
 *  timeseries source used to be API-only too — the live Lux price history had to be bound with a hand-written PUT.
 *  The server reads the source's columns and counts it against the objects before it answers; a spec that does not
 *  bind is refused with the reason and nothing is written. */
function DeclareBinding({ detail, busy, onDeclare, sources, problem = "" }: {
  detail: ObjectTypeDetail;
  busy: boolean;
  /** A refusal, shown in the dialog (the section under it is behind the dialog's scrim). */
  problem?: string;
  /** True once it is saved: the dialog closes. */
  onDeclare: (name: string, spec: BindingSpec) => Promise<boolean>;
  /** ON-8 — set in an organisation's ontology: the source may live on any of these connections. */
  sources?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState(detail.connection_id || "");
  const [schemaName, setSchemaName] = useState("");
  /** A source on another connection than the type's own is read by key, one row per object — static only. */
  const crosses = !!sources && !!connection && connection !== detail.connection_id;
  const [name, setName] = useState("");
  const [reads, setReads] = useState<"table" | "query">("table");
  const [source, setSource] = useState("");
  const [key, setKey] = useState(detail.key.property);
  const [kind, setKind] = useState<BindingSpec["kind"]>("static");
  const [timeColumn, setTimeColumn] = useState("");
  const [frames, setFrames] = useState<FrameRow[]>([]);
  // ON-7 — a detail binding's rollups, and whether the bound table's own type becomes a part of this one.
  const [rollups, setRollups] = useState<RollupRow[]>([{ name: "", agg: "sum", column: "" }]);
  const [absorb, setAbsorb] = useState(true);
  const usable = kind === "timeseries" ? frames.filter((f) => f.name.trim() && f.column.trim()) : [];
  const rolled = kind === "detail" ? rollups.filter((r) => r.name.trim() && r.column.trim()) : [];
  const ready = !!name.trim() && !!source.trim() && !!key.trim()
    && (kind !== "timeseries" || !!timeColumn.trim())
    && (kind !== "detail" || rolled.length > 0)
    && (!crosses || kind === "static")
    && usable.every((f) => f.what !== "avg-trailing" || Number(f.window) >= 1);
  const declare = () => {
    const spec: BindingSpec = { kind, key: key.trim() };
    if (reads === "table") spec.table = source.trim();
    else spec.sql = source.trim();
    if (crosses) spec.connection_id = connection;
    if (sources && reads === "table" && schemaName.trim()) spec.schema_name = schemaName.trim();
    if (kind === "timeseries") spec.time_column = timeColumn.trim();
    if (usable.length) spec.frames = Object.fromEntries(usable.map((f) => [f.name.trim(), frameSpec(f)]));
    if (kind === "detail") {
      spec.rollups = Object.fromEntries(rolled.map((r) => [r.name.trim(), { column: r.column.trim(), agg: r.agg }]));
      if (reads === "table" && absorb && !sources) spec.absorb = true;
    }
    void onDeclare(name.trim(), spec).then((ok) => { if (ok) setOpen(false); });
  };
  return (
    <Door open={open} onOpenChange={setOpen} busy={busy} label="New source" testId="binding-door" width={760}
      hint="A further table or SELECT joined to this entity on its key"
      title={`New source for ${detail.display_name}`}>
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: RULE }} data-testid="declare-binding">
      <p className="aug-fs-xs" style={{ margin: "0 0 6px", color: "var(--t3)", lineHeight: 1.45 }}>
        A source joined to {detail.display_name} on its key. A <strong>static</strong> binding must hold one row per
        object; a <strong>timeseries</strong> holds many over a time column and is read as each object&rsquo;s latest
        row; a <strong>detail</strong> holds many with no clock — an order&rsquo;s lines — and supplies only what its
        rollups declare, each one value per object. Every column but the key is supplied under its own name; one the
        type already uses is skipped with the reason.
      </p>
      {sources && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>from</span>
          <SelectField style={SELECT} value={connection} aria-label="Binding connection"
            data-testid="declare-binding-connection" onChange={(e) => setConnection(e.target.value)}>
            {Object.entries(sources).map(([cid, label]) => (
              <option key={cid} value={cid}>{cid === detail.connection_id ? `${label} (its own)` : label}</option>
            ))}
          </SelectField>
          {reads === "table" && (
            <Input style={{ ...FIELD, width: 110 }} value={schemaName} placeholder="schema"
              aria-label="Binding schema" onChange={(e) => setSchemaName(e.target.value)} />
          )}
          {crosses && (
            <span className="aug-fs-xs" style={{ color: "var(--t3)", flexBasis: "100%", lineHeight: 1.45 }}
              data-testid="declare-binding-crosses">
              On another connection a binding is read by key, one row per {detail.display_name} — a static one only.
            </span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Input style={{ ...FIELD, width: 150 }} value={name} placeholder="binding name"
          aria-label="Binding name" onChange={(e) => setName(e.target.value)} />
        <SelectField style={SELECT} value={reads} aria-label="Source kind"
          onChange={(e) => setReads(e.target.value as "table" | "query")}>
          <option value="table">table</option>
          <option value="query">SELECT</option>
        </SelectField>
        <Input style={{ ...FIELD, flex: 1, minWidth: 220 }} value={source}
          aria-label={reads === "table" ? "Table" : "SELECT"}
          placeholder={reads === "table" ? "price_history" : "SELECT product_id, AVG(price) AS price FROM … GROUP BY 1"}
          onChange={(e) => setSource(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>on</span>
        <Input style={{ ...FIELD, width: 150 }} value={key} aria-label="Key column"
          placeholder={detail.key.property} onChange={(e) => setKey(e.target.value)} />
        <SelectField style={SELECT} value={kind} aria-label="Binding kind"
          onChange={(e) => setKind(e.target.value as BindingSpec["kind"])}>
          <option value="static">static</option>
          <option value="timeseries">timeseries</option>
          <option value="detail">detail</option>
        </SelectField>
        {kind === "timeseries" && (
          <>
            <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>over</span>
            <Input style={{ ...FIELD, width: 150 }} value={timeColumn} aria-label="Time column"
              placeholder="observed_at" onChange={(e) => setTimeColumn(e.target.value)} />
          </>
        )}
        <Button variant="outline" size="xs" disabled={busy || !ready} onClick={declare}>
          {busy ? "Saving…" : "Save to the draft"}
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {kind === "timeseries" && (
        <div style={{ marginTop: 8 }}>
          <p className="aug-fs-xs" style={{ margin: "0 0 4px", color: "var(--t3)", lineHeight: 1.45 }}>
            Frames over those readings — each becomes a property of the type, computed across the object&rsquo;s own
            readings and read at its latest one.
          </p>
          {frames.map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              <Input style={{ ...FIELD, width: 150 }} value={f.name}
                aria-label={`Frame ${i + 1} property`} placeholder="avg_price_3"
                onChange={(e) => setFrames((fs) => fs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <SelectField style={SELECT} value={f.what} aria-label={`Frame ${i + 1} shape`}
                onChange={(e) => setFrames((fs) => fs.map((x, j) => j === i ? { ...x, what: e.target.value as Shape } : x))}>
                <option value="avg-trailing">average of the last N</option>
                <option value="sum-cumulative">total to date</option>
                <option value="min-all">lowest ever</option>
                <option value="max-all">highest ever</option>
                <option value="count-all">how many readings</option>
                <option value="previous">the reading before</option>
              </SelectField>
              <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>of</span>
              <Input style={{ ...FIELD, width: 150 }} value={f.column}
                aria-label={`Frame ${i + 1} column`} placeholder="price"
                onChange={(e) => setFrames((fs) => fs.map((x, j) => j === i ? { ...x, column: e.target.value } : x))} />
              {f.what === "avg-trailing" && (
                <Input style={{ ...FIELD, width: 60 }} value={f.window} type="number" min={1}
                  aria-label={`Frame ${i + 1} readings`}
                  onChange={(e) => setFrames((fs) => fs.map((x, j) => j === i ? { ...x, window: e.target.value } : x))} />
              )}
              <Button variant="ghost" size="xs" onClick={() => setFrames((fs) => fs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" style={{ marginTop: 4 }}
            onClick={() => setFrames((fs) => [...fs, { name: "", what: "avg-trailing", column: "", window: "3" }])}>
            + Add a frame
          </Button>
        </div>
      )}
      {kind === "detail" && (
        <div style={{ marginTop: 8 }} data-testid="declare-rollups">
          <p className="aug-fs-xs" style={{ margin: "0 0 4px", color: "var(--t3)", lineHeight: 1.45 }}>
            Rollups over those rows — each becomes a property of the type, computed across the object&rsquo;s own rows
            before the join, so it can never multiply the objects.
          </p>
          {rollups.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
              <Input style={{ ...FIELD, width: 150 }} value={r.name}
                aria-label={`Rollup ${i + 1} property`} placeholder="units"
                onChange={(e) => setRollups((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <SelectField style={SELECT} value={r.agg} aria-label={`Rollup ${i + 1} agg`}
                onChange={(e) => setRollups((rs) => rs.map((x, j) => j === i ? { ...x, agg: e.target.value as RollupAgg } : x))}>
                <option value="sum">sum of</option>
                <option value="count">how many carry</option>
                <option value="avg">average of</option>
                <option value="min">lowest</option>
                <option value="max">highest</option>
              </SelectField>
              <Input style={{ ...FIELD, width: 150 }} value={r.column}
                aria-label={`Rollup ${i + 1} column`} placeholder="quantity"
                onChange={(e) => setRollups((rs) => rs.map((x, j) => j === i ? { ...x, column: e.target.value } : x))} />
              <Button variant="ghost" size="xs" onClick={() => setRollups((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="ghost" size="xs" style={{ marginTop: 4 }}
            onClick={() => setRollups((rs) => [...rs, { name: "", agg: "sum", column: "" }])}>
            + Add a rollup
          </Button>
          {reads === "table" && !sources && (
            <label className="aug-fs-xs" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "var(--t2)" }}>
              <Checkbox checked={absorb} aria-label="Absorb its type as a part"
                onChange={(e) => setAbsorb(e.target.checked)} />
              Fold that table&rsquo;s own type into {detail.display_name} as a part — hidden from the map, listed here
            </label>
          )}
        </div>
      )}
      {problem && <p className="aug-fs-xs" role="alert" style={{ margin: "6px 0 0", color: "var(--red5)", lineHeight: 1.45 }}>{problem}</p>}
    </div>
    </Door>
  );
}

type RollupAgg = NonNullable<RollupSpec["agg"]>;

interface RollupRow {
  name: string;
  agg: RollupAgg;
  column: string;
}

/** The frames a person can declare from here, each a shape they would recognise rather than the algebra's
 *  vocabulary. The API takes the full algebra; this offers the frames people actually ask for. */
type Shape = "avg-trailing" | "sum-cumulative" | "min-all" | "max-all" | "count-all" | "previous";

interface FrameRow {
  name: string;
  what: Shape;
  column: string;
  window: string;
}

function frameSpec(row: FrameRow): FrameSpec {
  const column = row.column.trim();
  if (row.what === "previous") return { column, offset: 1 };
  const [agg, range] = row.what.split("-") as [FrameSpec["agg"], FrameSpec["range"]];
  return range === "trailing"
    ? { column, agg, range, window: Math.max(1, Number(row.window) || 1) }
    : { column, agg, range };
}

function LinkSentence({ detail, link, onOpen }: { detail: ObjectTypeDetail; link: TypeLink; onOpen: (t: string) => void }) {
  const other = (
    <Button variant="ghost" size="xs" onClick={() => onOpen(link.to)} title={`Light ${link.to_name} up on the map and open it here`}>
      {link.to_name}
    </Button>
  );
  const verb = <span style={{ color: "var(--t2)" }}>{link.verb || "relates to"}</span>;
  const here = <span style={{ color: "var(--t2)" }}>{detail.display_name}</span>;
  return link.direction === "out"
    ? <>{here}{verb}{other}</>
    : <>{other}{verb}{here}</>;
}

/** ON-3b — name a link by the verb the business uses. The builder's generic name (`order_item_associated_with_
 *  shipment`) is what the data proposes; only a person knows the business said "shipped as". The mechanical name
 *  keeps working — this one is accepted beside it — so naming a link breaks no query and no saved path. */
function NameLink({ link, connectionId, schema, onChanged }: {
  link: TypeLink;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const editing = useEditing();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(link.business_name || "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const save = async () => {
    setBusy(true);
    setProblem("");
    try {
      await nameLink(connectionId, link.relationship, name.trim(), schema);
      savedToDraft("Changed");
      setOpen(false);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {link.business_name_source === "model" && (
        <span className="aug-fs-xs" style={{ color: "var(--vio4)" }}
          title="The explorer proposed this name — confirm it in Review, or change it here">
          name proposed by the explorer
        </span>
      )}
      {editing && (
        <Door open={open} onOpenChange={setOpen} busy={busy} label="Change" icon={null} variant="outline" testId="link-name" width={480}
          hint="Say this link the way the business says it — the mechanical name keeps working beside it"
          title="Change how this link is said" description={`${link.name} · ${link.on}`}>
          <Field label="In the business's words" hint="lower case, words joined by _ — the mechanical name keeps working beside it">
            <Input style={MONO} value={name} autoFocus disabled={busy} placeholder="shipped_as" aria-label={`Business name for ${link.name}`}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void save(); }} />
          </Field>
          <FormFoot busy={busy} ready={!!name.trim()} onSave={() => void save()} onCancel={() => setOpen(false)} problem={problem} />
        </Door>
      )}
    </span>
  );
}

/** The columns a link or a key can be read from: the entity's own, never one an expression or the edit layer supplies. */
function ownColumns(d: ObjectTypeDetail): string[] {
  return d.properties.filter((p) => p.source.binding !== "overlay" && !p.source.kind && !p.source.expression).map((p) => p.name);
}

/** The pair of columns two entities most likely meet on, read from their names: `orders.user_id` = `users.id`. A
 *  suggestion only — the server counts whatever is saved, and refuses a pair that does not join. */
export function suggestedJoin(from: ObjectTypeDetail, to: ObjectTypeDetail): { from: string; to: string } | null {
  const named = (d: ObjectTypeDetail) => {
    const table = d.bindings.find((b) => b.primary)?.table ?? "";
    const base = table.split(".").pop() ?? "";
    return [d.object_type, base.replace(/ies$/, "y").replace(/s$/, ""), base].filter(Boolean).map((n) => `${n}_id`);
  };
  const mine = ownColumns(from), theirs = ownColumns(to);
  const out = named(to).find((c) => mine.includes(c));
  if (out && to.key.property) return { from: out, to: to.key.property };
  const back = named(from).find((c) => theirs.includes(c));
  if (back && from.key.property) return { from: from.key.property, to: back };
  return null;
}

const TYPE_IT = "__another_column__";

/** ON-7 — the link form: another entity, the column on each side that joins them, and the verb the business uses. The
 *  columns are chosen from each entity's own, the likely pair already picked; the server checks both exist, refuses a
 *  name already taken, counts each side and how many keys meet, and the compiler follows the link as a found one. */
export function LinkForm({ detail, types, to: given, connectionId, schema, onDone, onCancel }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  /** The entity it links to, where the person already pointed at one (the Atlas). */
  to?: string;
  connectionId: string;
  schema?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const others = types.filter((t) => t.object_type !== detail.object_type);
  const [to, setTo] = useState(given ?? "");
  const [name, setName] = useState("");
  const [fromColumn, setFromColumn] = useState("");
  const [toColumn, setToColumn] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const target = others.some((t) => t.object_type === to) ? to : (others[0]?.object_type ?? "");
  // The far entity's own columns, to choose from; unread (or refused), its column is typed as before.
  const [far, setFar] = useState<ObjectTypeDetail | null>(null);
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    if (!target) return;
    let live = true;
    setFar(null);
    getObjectType(target, connectionId, schema)
      .then((next) => {
        if (!live || !next || next.path !== "object_type") return;
        setFar(next);
        const guess = suggestedJoin(detail, next);
        setFromColumn(guess?.from ?? "");
        setToColumn(guess?.to ?? "");
        setSuggested(!!guess);
      })
      .catch(() => { /* its column is typed */ });
    return () => { live = false; };
  }, [target, connectionId, schema, detail]);
  const ready = !!target && /^[a-z][a-z0-9_]{0,79}$/.test(name.trim()) && !!fromColumn.trim() && !!toColumn.trim();
  const row = others.find((t) => t.object_type === target);
  const already = detail.links.filter((l) => l.to === target || l.to_type === row?.id);
  const declare = async () => {
    setBusy(true);
    setProblem("");
    const spec: DeclaredLinkSpec = { from_entity: detail.id, to_entity: row?.id ?? target, name: name.trim(),
      from_column: fromColumn.trim(), to_column: toColumn.trim() };
    try {
      await declareLink(connectionId, spec, schema);
      savedToDraft("New link");
      onDone();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  // A column is chosen from the entity's own; one that is not listed (a long table shows its first properties) is typed.
  const [typed, setTyped] = useState<Record<string, boolean>>({});
  const column = (label: string, value: string, set: (v: string) => void, options: string[] | null, placeholder: string) => (
    options?.length && !typed[label] && (!value || options.includes(value)) ? (
      <SelectField style={MONO} value={value} aria-label={label}
        onChange={(e) => {
          setSuggested(false);
          if (e.target.value === TYPE_IT) { setTyped((was) => ({ ...was, [label]: true })); set(""); } else set(e.target.value);
        }}>
        <option value="">choose a column…</option>
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
        <option value={TYPE_IT}>another column…</option>
      </SelectField>
    ) : (
      <Input style={MONO} value={value} placeholder={placeholder} aria-label={label} onChange={(e) => { set(e.target.value); setSuggested(false); }} />
    )
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="declare-link">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label="From" style={{ flex: 1, minWidth: 150 }}>
          <Input value={detail.display_name} disabled aria-label="Link from" />
        </Field>
        <Field label="To" style={{ flex: 1, minWidth: 150 }}>
          <SelectField value={target} aria-label="Link target type" onChange={(e) => setTo(e.target.value)}>
            {others.map((t) => <option key={t.object_type} value={t.object_type}>{t.display_name}</option>)}
          </SelectField>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Field label={`${detail.display_name}'s column`} style={{ flex: 1, minWidth: 150 }}>
          {column("Link column on this type", fromColumn, setFromColumn, ownColumns(detail), detail.key.property)}
        </Field>
        <span className="aug-fs-sm" style={{ color: "var(--t3)", paddingBottom: 6 }}>=</span>
        <Field label={`${row?.display_name ?? "Its"}'s column`} style={{ flex: 1, minWidth: 150 }}>
          {column("Link column on the other type", toColumn, setToColumn, far ? ownColumns(far) : null, "its column")}
        </Field>
      </div>
      {suggested && (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }} data-testid="link-suggested">
          Suggested from the column names. Both sides are counted on the data when you save.
        </p>
      )}
      <Field label={`In words: one ${detail.display_name} is … one ${row?.display_name ?? "of them"}`}
        hint="lower case, words joined by _ — how the link is read aloud">
        <Input style={MONO} value={name} placeholder="placed_by" aria-label="Link verb" onChange={(e) => setName(e.target.value)} />
      </Field>
      {already.length > 0 && (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--amb4)", lineHeight: 1.45 }} data-testid="link-already">
          They are linked already: {already.map((l) => `${l.verb || l.name} (${l.cardinality})`).join(", ")}. A second link is
          for when it means something else.
        </p>
      )}
      <FormFoot busy={busy} ready={ready} onSave={() => void declare()} onCancel={onCancel} problem={problem} />
    </div>
  );
}

function AddRelationship({ detail, types, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Door open={open} onOpenChange={setOpen} label="New link" testId="link-door"
      disabled={types.every((t) => t.object_type === detail.object_type)}
      hint="A link the builder did not find — the column on each side that joins them, and the verb"
      title={`New link from ${detail.display_name}`}
      description="Which entity it belongs with, and the columns that match. How many of one belong to the other is counted, never typed.">
      <LinkForm detail={detail} types={types} connectionId={connectionId} schema={schema} onCancel={() => setOpen(false)}
        onDone={() => { setOpen(false); onChanged(); }} />
    </Door>
  );
}

/** 2026-09-22 — what a person withdrew on this type, and the door back: a builder-found binding or a found link
 *  the builder guessed wrong leaves the served graph on withdrawal (the compiler stops following it) and returns on
 *  Restore. In the History tab; with nothing withdrawn it is one muted line. */
function WithdrawnSection({ detail, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const editing = useEditing();
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const gone = detail.withdrawn;
  if (!gone || (gone.bindings.length === 0 && gone.links.length === 0)) {
    return (
      <Section title="Removed">
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>
          Nothing on {detail.display_name} has been withdrawn.
        </p>
      </Section>
    );
  }
  const act = async (key: string, write: () => Promise<void>) => {
    setBusy(key);
    setProblem("");
    try {
      await write();
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <Section title="Removed" aside="left out of the served ontology by a person">
      {gone.bindings.map((name) => (
        <div key={`b:${name}`} className="aug-fs-xs" data-testid="entity-withdrawn"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <span style={{ ...MONO, color: "var(--t2)" }}>{name}</span>
          <span style={{ color: "var(--t3)" }}>binding</span>
          {editing && (
            <Button variant="ghost" size="xs" disabled={busy === `b:${name}`} style={{ marginLeft: "auto" }}
              onClick={() => act(`b:${name}`, () => restoreBinding(connectionId, detail.id, name, schema))}>
              Put back
            </Button>
          )}
        </div>
      ))}
      {gone.links.map((l) => (
        <div key={`l:${l.relationship}`} className="aug-fs-xs" data-testid="entity-withdrawn"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <span style={{ ...MONO, color: "var(--t2)" }}>{l.relationship}</span>
          <span style={{ color: "var(--t3)" }}>link · {l.from_entity} → {l.to_entity}</span>
          {editing && (
            <Button variant="ghost" size="xs" disabled={busy === `l:${l.relationship}`} style={{ marginLeft: "auto" }}
              onClick={() => act(`l:${l.relationship}`, () => restoreLink(connectionId, l.relationship, schema))}>
              Put back
            </Button>
          )}
        </div>
      ))}
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

const VERSION_TAG: Record<string, string> = { declared: "aug-tag-blue", drafted: "aug-tag-violet", withdrawn: "aug-tag-gray" };

/** Arc OC-1, Arc FA (FA-3) — one declaration, version by version, newest first: when each took effect, who made it,
 *  where it came from, its note and what it changed. An earlier version goes back into the draft from its row — counted again and classed like any change, so readers get it only when a person publishes; why
 *  it cannot go back here is said instead of a button. */
function VersionsSection({ kind, targetId, name, stamp, connectionId, schema, onChanged }: {
  kind: string;
  targetId: string;
  name: string;
  /** A newer read of the element, so the history is read again with it. */
  stamp: unknown;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const editing = useEditing();
  const [history, setHistory] = useState<DeclarationHistory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState("");
  const [reread, setReread] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    getDeclarationHistory(kind, targetId, connectionId, schema)
      .then((next) => { if (live) setHistory(next); })
      .catch((e: unknown) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [kind, targetId, connectionId, schema, stamp, reread]);
  const putBack = async (version: number) => {
    setBusy(version);
    setProblem("");
    setSaid("");
    try {
      const out = await putBackVersion(connectionId, kind, targetId, version, schema);
      setSaid(out.said);
      setReread((n) => n + 1);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  // The history door says whether a version can go back here.
  if (error || !history) return null;
  const offer = history.put_back;
  return (
    <Section title="Versions" aside="every save and withdrawal, newest first">
      {history.versions.length === 0 ? (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>
          Nobody has declared anything on {name} yet — what the builder read is all there is.
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0 }}>
          {history.versions.map((v, i) => {
            const when = utcDayWords(v.in_force_from || v.recorded_at, true);
            const note = v.declaration_note || v.note;
            return (
              <li key={`v:${v.version ?? "kept"}:${i}`} data-testid="entity-version"
                style={{ listStyle: "none", padding: "7px 0", borderTop: i ? RULE : undefined }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span className="aug-fs-sm" style={{ ...MONO, color: "var(--t1)" }}>
                    {v.version == null ? "as found" : `v${v.version}`}
                  </span>
                  <span className={`aug-tag ${VERSION_TAG[v.state] ?? "aug-tag-gray"}`}>{v.state}</span>
                  <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>
                    {[when, v.by, v.source].filter(Boolean).join(" · ")}
                  </span>
                  {editing && offer.enabled && i > 0 && v.version != null && (
                    <Button variant="ghost" size="xs" style={{ marginLeft: "auto" }} disabled={busy !== null}
                      data-testid="entity-version-put-back" onClick={() => putBack(v.version as number)}
                      title="Write this version's fields into the draft — counted again, and read by everyone once the draft is published">
                      {busy === v.version ? "Putting back…" : "Put back into the draft"}
                    </Button>
                  )}
                </div>
                {note && <p className="aug-fs-xs" style={{ margin: "3px 0 0", color: "var(--t2)" }}>{note}</p>}
                {v.changes.length > 0 && (
                  <ul style={{ margin: "3px 0 0", padding: 0 }}>
                    {v.changes.slice(0, 6).map((c, j) => (
                      <li key={`c:${j}`} className="aug-fs-xs" style={{ ...MONO, listStyle: "none", color: "var(--t3)" }}>{c}</li>
                    ))}
                    {v.changes.length > 6 && (
                      <li className="aug-fs-xs" style={{ listStyle: "none", color: "var(--t3)" }}>
                        and {countNoun(v.changes.length - 6, "more change")}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {editing && !offer.enabled && offer.said && (
        <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--t3)" }} data-testid="entity-version-why-not">
          An earlier version cannot be put back here: {offer.said}.
        </p>
      )}
      {said && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--grn4)" }}>{said}</p>}
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
    </Section>
  );
}

/** Arc FA, FA-3 — an entity marked retiring: still served, and every reader is told what replaces it and when ("retiring
 *  on Tue 1 Dec 2026 — use Customer instead"; after the day, "past its retiring date"). While editing, the door to mark
 *  it — another entity, a day, a note — or to take the mark off; either waits in the draft as a change of meaning. A
 *  mark that could not be read says so (`retiring_said`) instead. */
function RetiringLine({ detail, types, connectionId, schema, onOpen, onChanged, readOnly }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onOpen: (objectType: string) => void;
  onChanged: () => void;
  readOnly: boolean;
}) {
  const editing = useEditing();
  const [open, setOpen] = useState(false);
  const [successor, setSuccessor] = useState("");
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  if (detail.retiring === undefined) {
    return detail.retiring_said
      ? <p className="aug-fs-xs" style={{ margin: "8px 0 0", color: "var(--t3)" }}>{detail.retiring_said}</p>
      : null;
  }
  const mark = detail.retiring;
  const others = types.filter((t) => t.id !== detail.id);
  const write = async (act: () => Promise<unknown>) => {
    setBusy(true);
    setProblem("");
    try {
      await act();
      setOpen(false);
      onChanged();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const successorRow = mark ? types.find((t) => t.id === mark.successor) : undefined;
  return (
    <div className="aug-fs-xs" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }} data-testid="entity-retiring">
      {mark && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="aug-tag aug-tag-amber">{mark.past ? "past its retiring date" : "retiring"}</span>
          <span style={{ color: "var(--t2)" }} data-testid="entity-retiring-said">
            {mark.past ? `past its retiring date, ${endedDay(mark.on)}` : `retiring on ${endedDay(mark.on)}`} — use{" "}
            {successorRow ? (
              <Button variant="ghost" size="xs" onClick={() => onOpen(successorRow.object_type)} title={`Open ${successorRow.display_name}`}>
                {mark.successor_name}
              </Button>
            ) : mark.successor_name}{" "}instead
          </span>
          {editing && !readOnly && (
            <Button variant="minimal" size="xs" disabled={busy} style={{ marginLeft: "auto" }}
              onClick={() => write(() => unmarkRetiring(connectionId, "entity", detail.id, schema))}
              title="It is no longer said to be going">
              Take the mark off
            </Button>
          )}
        </div>
      )}
      {mark?.note && <span style={{ color: "var(--t3)" }}>{mark.note}</span>}
      {!mark && editing && !readOnly && (
        <span>
        <Door open={open} onOpenChange={setOpen} busy={busy} label="Mark as retiring" icon={null} testId="entity-retiring" width={520}
          hint="Say it is going, and what to use instead — it keeps serving until it is removed"
          title={`Mark ${detail.display_name} as retiring`} description="It keeps serving; every reader is told to use the other instead.">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="entity-retiring-form">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <SelectField style={SELECT} value={successor} aria-label="Use instead" onChange={(e) => setSuccessor(e.target.value)}>
              <option value="">use instead…</option>
              {others.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
            </SelectField>
            <Input type="date" value={day} aria-label="Retiring on" onChange={(e) => setDay(e.target.value)}
              style={{ ...FIELD, width: 150 }} />
          </div>
          <Input value={note} aria-label="Note" placeholder="why, in a few words" onChange={(e) => setNote(e.target.value)}
            style={FIELD} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="outline" size="xs" disabled={busy || !successor || !day} data-testid="entity-retiring-save"
              onClick={() => write(() => markRetiring(connectionId,
                { kind: "entity", target_id: detail.id, successor, on: day, note: note.trim() || undefined }, schema))}>
              {busy ? "Saving…" : "Save to the draft"}
            </Button>
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {problem && <span role="alert" style={{ color: "var(--red5)" }}>{problem}</span>}
        </div>
        </Door>
        </span>
      )}
      {problem && !open && <span style={{ color: "var(--red5)" }}>{problem}</span>}
    </div>
  );
}

/** ON-7 — withdraw a link a person declared; since 2026-09-22 a FOUND link too (the join the builder guessed wrong
 *  leaves the served graph, and comes back from the Withdrawn section). */
function WithdrawLink({ link, connectionId, schema, onChanged }: {
  link: TypeLink;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  return (
    <RemoveAsk what={`the link ${link.business_name || link.verb || link.name}`} testId="link-remove"
      effect={link.carries?.length
        ? `${countNoun(link.carries.length, "declaration")} read through it and stop resolving; a question that walks from one entity to the other is refused.`
        : "A question that walks from one entity to the other is refused until it is put back."}
      remove={() => deleteLink(connectionId, link.relationship, schema)} onRemoved={() => { savedToDraft("Removed"); onChanged(); }} />
  );
}

function LinksSection({ detail, types, connectionId, schema, onOpen, onChanged, inDomain }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onOpen: (objectType: string) => void;
  onChanged: () => void;
  /** ON-8 — in an organisation's ontology an explorer's proposal is not confirmed from here (the explorer stays
   *  home-only); naming a link is declarative and opens there (2026-09-22). */
  inDomain?: boolean;
}) {
  const editing = useEditing();
  return (
    <Section title="Links" count={detail.links.length} aside={`${detail.counts.traversable_links} of ${detail.counts.links} followed by the compiler`}
      action={editing && <AddRelationship detail={detail} types={types} connectionId={connectionId} schema={schema} onChanged={onChanged} />}>
      {detail.links.length === 0 && <EmptyState variant="inline" title={`No link reaches out from ${detail.display_name}.`} />}
      {detail.links.map((link, i) => (
        <div key={`${link.relationship}:${link.name}`} style={{ padding: "7px 0", borderTop: i ? RULE : undefined }}
          data-testid="entity-link">
          <div className="aug-fs-xs" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <LinkSentence detail={detail} link={link} onOpen={onOpen} />
            <span className="aug-tag aug-tag-gray" style={MONO}>{link.cardinality}</span>
            <span className={`aug-tag ${link.traversable ? "aug-tag-green" : "aug-tag-amber"}`}>
              {link.traversable ? "followed" : "refused"}
            </span>
            {link.traversal === "cross-source" && (
              <span className="aug-tag aug-tag-gray" data-testid="entity-link-cross-source"
                title="Its two types live on two connections: the compiler reads the far side by key and joins it in the answer">
                cross-source
              </span>
            )}
            {link.origin === "human" && (
              <span className="aug-tag aug-tag-blue"
                title={link.provenance ? `declared — first proposed by ${link.provenance}` : "declared by a person"}>
                declared
              </span>
            )}
            {link.origin === "model" && !inDomain && (
              <>
                <span className="aug-tag aug-tag-violet" title={`proposed by ${link.provenance || "an explorer"}, not yet confirmed`}>
                  proposed
                </span>
                <ConfirmProposal target={{ kind: "link", relationship: link.relationship }} connectionId={connectionId}
                  schema={schema} onChanged={onChanged} />
              </>
            )}
            {/* a row's Change and Remove sit at its right edge, as on every card */}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <NameLink link={link} connectionId={connectionId} schema={schema} onChanged={onChanged} />
              {editing && (link.origin === "human" || link.origin === "model" || !inDomain) && (
                <WithdrawLink link={link} connectionId={connectionId} schema={schema} onChanged={onChanged} />
              )}
            </span>
          </div>
          <div className="aug-fs-xs" style={{ ...MONO, color: "var(--t3)", marginTop: 3, overflowWrap: "anywhere" }}>
            {link.business_name && <>{link.business_name}{link.business_name_source === "human" ? " (declared)" : ""} · </>}
            {link.name} · {link.on}
          </div>
          {link.why_not && <p className="aug-fs-xs" style={{ margin: "3px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>{link.why_not}</p>}
          {!!link.carries?.length && (
            <div className="aug-fs-xs" data-testid="link-carries" style={{ marginTop: 3, color: "var(--t2)", lineHeight: 1.45 }}>
              {link.carries.map((c) => (
                <div key={`${c.process}:${c.stage ?? c.promise ?? c.impact}`} title={c.how}>
                  carries {c.promise ? `the ${c.promise} promise of ${c.process_label}`
                    : c.impact ? `the impact ${c.impact}` : `${c.process_label} (stage ${c.stage})`}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </Section>
  );
}

function ActionsSection({ detail, connectionId, onDesignAction }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  /** Opens the action designer on this type; absent where it does not reach. */
  onDesignAction?: (entity: string) => void;
}) {
  const href = declaredActionsHref(connectionId);
  const editing = useEditing();
  const design = editing && onDesignAction && (
    <Button variant="outline" size="xs" data-testid="type-design-action" onClick={() => onDesignAction(detail.id)}>
      <Icon name="plus" size={12} /> New action
    </Button>
  );
  if (detail.actions.length === 0) {
    return (
      <Section title="Actions" count={0} action={design}>
        <EmptyState variant="inline" title={`No action takes a ${detail.display_name.toLowerCase()}.`}
          action={design ? undefined : <Link href={href}><Button variant="outline" size="xs">Open Actions</Button></Link>} />
      </Section>
    );
  }
  return (
    <Section title="Actions" count={detail.actions.length} action={design}>
      {detail.actions.map((a, i) => (
        <div key={a.id} style={{ padding: "7px 0", borderTop: i ? RULE : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: "var(--t3)", display: "inline-flex" }}><Icon name="bolt" size={13} /></span>
            <span className="aug-fs-sm" style={{ color: "var(--t1)", fontWeight: 600 }}>{a.display_name}</span>
            <span className="aug-tag aug-tag-gray">{a.kind}</span>
            {a.risk && <span className={`aug-tag ${RISK_TAG[a.risk] ?? "aug-tag-gray"}`}>{a.risk}</span>}
          </div>
          <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 2 }}>{a.why}</div>
          <div className="aug-fs-xs" style={{ ...MONO, color: "var(--t2)", marginTop: 3, overflowWrap: "anywhere" }}>
            ({a.params.map((p) => `${p.name}${p.kind === "object" ? `: ${p.object_type}` : ""}${p.required ? "" : "?"}`).join(", ")})
            {a.edits.length > 0 && <> → sets {a.edits.map((e) => `${e.object}.${e.property}`).join(", ")}</>}
          </div>
        </div>
      ))}
      <span style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <Link href={href}><Button variant="minimal" size="xs">Open in Actions</Button></Link>
      </span>
    </Section>
  );
}

/** Arc OC-3 — the words people use for this type and its properties (2026-10-09): each keyed to it, read from the table
 *  and column it comes from now; or naming its table or a column, with the key proposed — never keyed until a person
 *  says so. A keyed word reaches the agent as what it names, wherever the type's binding points. */
/** Arc OC-6 — the moves each property the edit layer holds may make (a review flag: unset → flagged → reviewed),
 *  enforced when an action sets it: an action off them is refused before it runs, with what is allowed. */
function EditStatesSection({ detail, connectionId, schema, onChanged }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  onChanged: () => void;
}) {
  const declared = Object.entries(detail.edit_states ?? {});
  const held = detail.properties.filter((p) => p.role === "overlay").map((p) => p.name);
  const editing = useEditing();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState("");
  const [states, setStates] = useState("");
  const [moves, setMoves] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const word = (s: string) => (s ? s : "unset");
  const save = async () => {
    const list = states.split(",").map((x) => x.trim()).filter(Boolean);
    const pairs = moves.split("\n").map((line) => line.split(/->|→/).map((x) => x.trim()))
      .filter((m) => m.length === 2).map(([a, b]) => [a === "unset" ? "" : a, b] as [string, string]);
    setBusy(true);
    setProblem("");
    try {
      const spec: EditStates = { states: list, moves: pairs, initial: "" };
      await declareEditStates(connectionId, detail.id, property.trim(), spec, schema);
      setOpen(false);
      onChanged();
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const door = !editing ? null : (
        <Door open={open} onOpenChange={setOpen} busy={busy} label="New moves" testId="edit-states" width={520}
          hint="Say which values a property the edit layer holds may move between" title={`How a property of ${detail.display_name} may move`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }} data-testid="edit-states-form">
          <Input value={property} aria-label="Property the edit layer holds" placeholder={held[0] ?? "review_status"}
            onChange={(e) => setProperty(e.target.value)} />
          <Input value={states} aria-label="Its states" placeholder="flagged, reviewed" onChange={(e) => setStates(e.target.value)} />
          <Textarea value={moves} rows={3} aria-label="Its moves, one per line" placeholder={"unset → flagged\nflagged → reviewed"}
            onChange={(e) => setMoves(e.target.value)} />
          {problem && <span className="aug-fs-xs" style={{ color: "var(--red5)" }}>{problem}</span>}
          <span style={{ display: "flex", gap: 6 }}>
            <Button size="xs" disabled={busy || !property.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save to the draft"}</Button>
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </span>
        </div>
        </Door>
  );
  return (
    <Section title="Moves the edit layer allows" aside={declared.length ? countNoun(declared.length, "property") : undefined} action={door}>
      {declared.map(([prop, spec]) => (
        <div key={prop} data-testid="edit-states-row" className="aug-fs-xs" style={{ padding: "4px 0", color: "var(--t2)" }}>
          <span style={{ color: "var(--t1)", fontWeight: 600 }}>{prop}</span>
          {": "}{spec.moves.map(([a, b]) => `${word(a)} → ${b}`).join(" · ")}
          {editing && (
            <RemoveAsk what={`the moves of ${prop}`} testId="edit-states-remove" back="They are made again from New moves."
              effect={`An action may then set ${prop} to any value.`}
              remove={() => withdrawEditStates(connectionId, detail.id, prop, schema)} onRemoved={() => { savedToDraft("Removed"); onChanged(); }} />
          )}
        </div>
      ))}
      {!declared.length && (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)" }}>
          None declared — an action may set {held.length ? held.join(", ") : "what it sets"} to any value.
        </p>
      )}
    </Section>
  );
}

function WordsSection({ detail, connectionId, schema }: { detail: ObjectTypeDetail; connectionId: string; schema?: string }) {
  const [rows, setRows] = useState<VocabularyKey[] | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    getOntologyKeys(connectionId, schema)
      .then((k) => { if (live) { setRows(k.vocabulary ?? []); setProblem(""); } })
      .catch((e: unknown) => { if (live) { setRows([]); setProblem(e instanceof Error ? e.message : String(e)); } });
    return () => { live = false; };
  }, [connectionId, schema, version]);
  const mine = (rows ?? []).filter((r) => {
    const target = r.keyed ? r.subject_id : r.proposal.subject;
    return !!target && (target === detail.id || target.startsWith(`${detail.id}.`));
  });
  const key = async (r: VocabularyKey) => {
    setBusy(r.synonym);
    setProblem("");
    try {
      await keyVocabularyEntry(connectionId, r, { kind: r.proposal.kind as "entity" | "property", subject: r.proposal.subject }, schema);
      setVersion((v) => v + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  };
  if (rows === null) return null;
  return (
    <Section title="Words people use" aside={mine.length ? countNoun(mine.length, "word") : undefined}>
      {mine.length === 0 && !problem && (
        <EmptyState variant="inline" title={`No word people use is recorded for ${detail.display_name.toLowerCase()} yet.`} />
      )}
      {mine.map((r, i) => (
        <div key={`${r.subject_kind}:${r.subject_id}:${r.synonym}`} data-testid="type-word" className="aug-fs-xs"
          style={{ padding: "6px 0", borderTop: i ? RULE : undefined, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "var(--t1)" }}>&ldquo;{r.synonym}&rdquo;</span>
          {r.keyed ? (
            <span style={{ color: "var(--t2)" }}>
              means {r.subject_id.replace(".", " · ")}
              <span style={{ color: "var(--t3)" }}>
                {r.reads ? ` — read from ${r.reads.table}${r.reads.column ? `.${r.reads.column}` : ""}` : " — not read here now"}
              </span>
            </span>
          ) : (
            <>
              <span style={{ color: "var(--t3)" }}>names {r.subject_kind} {r.subject_id} — {r.proposal.why}</span>
              <Button size="xs" variant="outline" disabled={!!busy} data-testid="type-word-key" onClick={() => void key(r)}>
                {busy === r.synonym ? "Keying…" : `Key it to ${r.proposal.subject.replace(".", " · ")}`}
              </Button>
            </>
          )}
        </div>
      ))}
      {problem && <p className="aug-fs-xs" style={{ color: "var(--red5)", margin: "6px 0 0" }}>{problem}</p>}
    </Section>
  );
}

function MetricsSection({ detail }: { detail: ObjectTypeDetail }) {
  return (
    <Section title="Verified metrics">
      {detail.metrics.length === 0 && <EmptyState variant="inline" title="No verified metric is defined on this type." />}
      {detail.metrics.map((m) => (
        <div key={m.id} style={{ padding: "5px 0" }} title={m.formula_sql}>
          <span className="aug-fs-sm" style={{ color: "var(--t1)" }}>{m.display_name}</span>
          {m.unit && <span className="aug-fs-xs" style={{ color: "var(--t3)" }}> {m.unit}</span>}
          <div className="aug-fs-xs" style={{ ...MONO, color: "var(--t3)", overflowWrap: "anywhere" }}>{m.formula_sql}</div>
        </div>
      ))}
      {detail.unverified_metrics.length > 0 && (
        <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--t3)" }}>
          {countNoun(detail.unverified_metrics.length, "unverified metric")} not used by the compiler:{" "}
          <span style={MONO}>{detail.unverified_metrics.join(", ")}</span>
        </p>
      )}
    </Section>
  );
}

function PathFinder({ detail, types, connectionId, schema, onOpen }: {
  detail: ObjectTypeDetail;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onOpen: (objectType: string) => void;
}) {
  const others = types.filter((t) => t.object_type !== detail.object_type);
  const [target, setTarget] = useState("");
  const [found, setFound] = useState<TypePaths | TypeRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const chosen = others.some((t) => t.object_type === target) ? target : (others[0]?.object_type ?? "");

  useEffect(() => {
    setFound(null);
    setProblem("");
  }, [detail.object_type]);

  const find = async () => {
    setBusy(true);
    setProblem("");
    try {
      setFound(await getTypePaths(detail.object_type, chosen, connectionId, schema));
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Path to" aside="how this type reaches another, hop by hop">
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <SelectField style={SELECT} value={chosen} aria-label="Target entity type"
          onChange={(e) => { setTarget(e.target.value); setFound(null); }}>
          {others.map((t) => <option key={t.object_type} value={t.object_type}>{t.display_name}</option>)}
        </SelectField>
        <Button variant="minimal" size="xs" onClick={find} disabled={busy || !chosen} data-testid="entity-find-paths">
          {busy ? "Finding…" : "Find paths"}
        </Button>
      </div>
      {problem && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--red5)" }}>{problem}</p>}
      {found?.path === "refused" && <p className="aug-fs-xs" style={{ margin: "6px 0 0", color: "var(--t3)" }}>{found.refused}</p>}
      {found?.path === "paths" && (
        found.paths.length === 0 ? (
          <EmptyState variant="inline" title={`No chain of links reaches ${found.to_name} within ${found.max_hops} hops.`} />
        ) : (
          <>
            <p className="aug-fs-xs" style={{ margin: "8px 0 2px", color: "var(--t3)" }}>
              {countNoun(found.found, "path")}{found.truncated ? `, the first ${found.paths.length} shown` : ""} · the
              compiler crosses at most {found.compiler_max_hops} links in one path
            </p>
            {found.paths.map((p) => <PathRow key={p.path} path={p} onOpen={onOpen} />)}
          </>
        )
      )}
    </Section>
  );
}

function PathRow({ path, onOpen }: { path: TypePath; onOpen: (objectType: string) => void }) {
  return (
    <div style={{ padding: "8px 0", borderTop: RULE }} data-testid="entity-path">
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span className={`aug-tag ${path.traversable ? "aug-tag-green" : "aug-tag-amber"}`}>
          {path.traversable ? "followed" : "refused"}
        </span>
        <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>
          {countNoun(path.length, "hop")} · {path.reach}
          {path.compiles_as.length > 0 ? ` · compiles as a ${path.compiles_as.join(" or a ")}` : ""}
        </span>
      </div>
      <ol style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
        {path.hops.map((hop, i) => (
          <li key={`${hop.link}:${i}`} className="aug-fs-xs" style={{ padding: "2px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ color: hop.traversable ? "var(--grn4)" : "var(--amb4)", display: "inline-flex" }}>
                <Icon name={hop.traversable ? "check" : "close"} size={12} label={hop.traversable ? "Followed" : "Refused"} />
              </span>
              <span style={{ color: "var(--t1)" }}>{hop.from_name}</span>
              <span style={{ color: "var(--t3)" }}>
                {hop.direction === "out" ? `— ${hop.verb || "relates to"} →` : `← ${hop.verb || "relates to"} —`}
              </span>
              <Button variant="ghost" size="xs" onClick={() => onOpen(hop.to)} title={`Light ${hop.to_name} up on the map and open it here`}>
                {hop.to_name}
              </Button>
              <span style={{ ...MONO, color: "var(--t3)" }}>{hop.cardinality}</span>
            </div>
            <div style={{ ...MONO, color: "var(--t3)", paddingLeft: 17 }}>{hop.link}</div>
            {hop.why_not && <div style={{ color: "var(--t3)", paddingLeft: 17, lineHeight: 1.45 }}>{hop.why_not}</div>}
          </li>
        ))}
      </ol>
      {path.why_not && <p className="aug-fs-xs" style={{ margin: "4px 0 0", color: "var(--t3)", lineHeight: 1.45 }}>{path.why_not}</p>}
    </div>
  );
}

/**
 * Change an entity: what it is called, the sentence that says what it is, the domain it is filed under — and, under
 * those, its key and the property that names one. Before 2026-11-11 a name or a sentence could not be changed anywhere
 * in the app, and the key sat behind a tab and the Edit switch. The words are saved together; the key and the naming
 * property are counted on the data, so each is saved by its own button and says what the count found.
 */
export function EntityDetailsForm({ detail, connectionId, schema, inDomain, onChanged, onDone }: {
  detail: ObjectTypeDetail;
  connectionId: string;
  schema?: string;
  inDomain: boolean;
  onChanged: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(detail.display_name);
  const [description, setDescription] = useState(detail.description ?? "");
  const [domain, setDomain] = useState(detail.domain ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const words = {
    ...(name.trim() !== detail.display_name ? { display_name: name.trim() } : {}),
    ...(description.trim() !== (detail.description ?? "") ? { description: description.trim() } : {}),
    ...(!inDomain && domain.trim() !== (detail.domain ?? "") ? { domain: domain.trim() } : {}),
  };
  const save = async () => {
    setBusy(true);
    setProblem("");
    try {
      await changeEntityWords(connectionId, detail.id, words, schema);
      savedToDraft("Changed");
      onChanged();
      onDone();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Editing.Provider value>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="entity-details-form">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="What one row is called" style={{ flex: 2, minWidth: 200 }}
            hint={<>Its id stays <span style={MONO}>{detail.id}</span> — links, rules and metrics point at that.</>}>
            <Input value={name} aria-label="Entity name" onChange={(e) => setName(e.target.value)} />
          </Field>
          {!inDomain && (
            <Field label="Domain" style={{ flex: 1, minWidth: 140 }}>
              <Input value={domain} aria-label="Entity domain" placeholder="Commerce" onChange={(e) => setDomain(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="What it is, in a sentence" hint="Read by people, and by the agent when it decides which entity a question is about.">
          <Textarea value={description} rows={3} aria-label="Entity description" onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <FormFoot busy={busy} ready={!!name.trim() && Object.keys(words).length > 0} onSave={() => void save()} onCancel={onDone} problem={problem} />
      </div>
      {!detail.platform && !inDomain && (
        <div style={{ margin: "0 -16px" }}>
          <KeySection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
          <DisplaySection detail={detail} connectionId={connectionId} schema={schema} onChanged={onChanged} />
        </div>
      )}
    </Editing.Provider>
  );
}

/** What a person asked to make or change from outside an entity's own page — the "New" menu, the Atlas. */
export interface AuthoringAsk {
  kind: "link" | "rule" | "change";
  /** The entity it is about (`object_type`); absent, the dialog asks which. */
  entity?: string;
  /** For a link: the entity it goes to, where the person pointed at one. */
  to?: string;
}

const ASK_TITLE: Record<AuthoringAsk["kind"], string> = { link: "New link", rule: "New rule", change: "Change an entity" };
const ASK_SAYS: Record<AuthoringAsk["kind"], string> = {
  link: "Which two entities belong together, and the columns that match. How many of one belong to the other is counted, never typed.",
  rule: "A named set of one entity's rows, so that people and metrics mean the same rows by the same word.",
  change: "Its name, the sentence that says what it is, its key and what names one. Each waits in the draft.",
};

/**
 * The same forms an entity's page opens, opened from anywhere: the "New" menu in the Ontology's title row and the bar
 * of the entity picked on the Atlas. It reads the entity the form is about — asking which, where none was pointed at —
 * and hands it to the one form there is for the job.
 */
export function EntityAuthoring({ ask, types, connectionId, schema, onClose, onChanged }: {
  ask: AuthoringAsk;
  types: TypeMapRow[];
  connectionId: string;
  schema?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [entity, setEntity] = useState(ask.entity ?? "");
  const [detail, setDetail] = useState<ObjectTypeDetail | null>(null);
  const [problem, setProblem] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!entity) return;
    let live = true;
    setProblem("");
    getObjectType(entity, connectionId, schema)
      .then((next) => {
        if (!live) return;
        if (next.path === "object_type") setDetail(next);
        else { setDetail(null); setProblem(next.refused); }
      })
      .catch((e: unknown) => { if (live) setProblem(errorText(e)); });
    return () => { live = false; };
  }, [entity, connectionId, schema, version]);
  const read = detail && detail.object_type === entity ? detail : null;
  const changed = () => { setVersion((v) => v + 1); onChanged(); };
  const done = () => { onChanged(); onClose(); };
  return (
    <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} width={ask.kind === "change" ? 680 : 620} testId="ontology-authoring"
      title={read && ask.kind === "change" ? `Change ${read.display_name}` : read ? `${ASK_TITLE[ask.kind]} ${ask.kind === "link" ? "from" : "on"} ${read.display_name}` : ASK_TITLE[ask.kind]}
      description={ASK_SAYS[ask.kind]}>
      {!ask.entity && (
        <Field label={ask.kind === "link" ? "From which entity" : "Which entity"}>
          <SelectField value={entity} aria-label="Which entity" onChange={(e) => setEntity(e.target.value)}>
            <option value="">choose an entity…</option>
            {types.map((t) => <option key={t.object_type} value={t.object_type}>{t.display_name}</option>)}
          </SelectField>
        </Field>
      )}
      {problem && <p className="aug-fs-xs" role="alert" style={{ margin: 0, color: "var(--red5)" }}>{problem}</p>}
      {entity && !read && !problem && <SkeletonRows rows={4} />}
      {read && ask.kind === "link" && (
        <LinkForm key={read.object_type} detail={read} types={types} to={ask.to} connectionId={connectionId} schema={schema} onDone={done} onCancel={onClose} />
      )}
      {read && ask.kind === "rule" && (
        <RuleForm key={read.object_type} detail={read} connectionId={connectionId} schema={schema} onDone={done} onCancel={onClose} />
      )}
      {read && ask.kind === "change" && (
        <EntityDetailsForm key={read.object_type} detail={read} connectionId={connectionId} schema={schema} inDomain={!!scopeDomain(connectionId)}
          onChanged={changed} onDone={onClose} />
      )}
    </FormDialog>
  );
}
