"use client";

/**
 * ON-3b — the entity-type map (ROADMAP §3.15; rebuilt on `@xyflow/react` 2026-09-12).
 *
 * A searchable rail of object types beside a canvas that draws the WHOLE business at once, with the most-linked
 * type in the middle — the map's first claim is which entity everything else hangs from. Picking a type lights it,
 * its links and the types on the other end of them, names those links with their verb and measured cardinality,
 * and opens it in the panel.
 *
 * The canvas is the library's, not ours: pan, zoom and drag are `@xyflow/react`'s, the fifth canvas in this app to
 * use it. A card a person drags STAYS there — the arrangement is remembered per connection in this browser, and
 * `layoutMap` only decides where a card starts before anyone has moved it.
 *
 * Every fact on a card is measured, not a paragraph (`GET /object-types`): whether the key is unique, and how many
 * of its links the compiler follows. The rest is the panel's, which is open beside it. A link the compiler refuses
 * is drawn dashed and says why on hover.
 *
 * A link is drawn straight, bending only at a right angle (the user, 2026-10-10: no curves) — React Flow's step path
 * with no rounding on its corners (`LinkEdge`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  Controls,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  type Edge as RFEdge,
  type EdgeProps,
  type Node as RFNode,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { EntityAuthoring, EntityTypePanel, type AuthoringAsk } from "@/components/ontology/EntityTypePanel";
import { Door, Field, FormFoot, savedToDraft } from "@/components/ontology/authoring";
import { BusinessAtlas } from "@/components/ontology/BusinessAtlas";
import { OntologyRegister, OntologyReview, TIER_TAG, targetOf } from "@/components/ontology/OntologyRegister";
import { useChromeBack, usePageChrome } from "@/components/shell/PageChrome";
import { ActionDesigner } from "@/components/ontology/ActionDesigner";
import { ProcessDesigner } from "@/components/ontology/ProcessDesigner";
import { ProcessPanel } from "@/components/ontology/ProcessPanel";
import { Button } from "@/components/ui/button";
import { IconSquare } from "@/components/ui/icon-square";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/motion";
import { getConnections, getMyPreferences, getTableColumns, putMyPreference } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { CARD, collapseParts, hubOf, type LabelSpot, layoutMap, linkLabelY, litBy, separateLabels } from "@/lib/entityMapLayout";
import {
  confirmProposals,
  declareEntity,
  exploreOntology,
  getOntologyDraft,
  getTypeMap,
  scopeDomain,
  type ConfirmTarget,
  type DeclaredEntitySpec,
  type DraftProposal,
  type OntologyDraft,
  type ProcessDetail,
  type ProcessRow,
  type ProposalTier,
  type RuleRow,
  type TypeMap,
  type TypeMapRow,
} from "@/lib/objectTypes";
import { SelectField } from "@/components/ui/select";

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const RULE = "1px solid var(--b1)";
/** How far a card or a link the picked type does not touch falls back. */
const UNLIT = 0.38;
const FIELD: React.CSSProperties = {
  ...MONO, background: "var(--bg-2)", color: "var(--t1)", border: RULE, borderRadius: "var(--r2)", padding: "2px 6px",
  minWidth: 0,
};
const SELECT: React.CSSProperties = { ...FIELD, maxWidth: 200 };

function keyWords(verified: boolean | null): string {
  return verified === true ? "key unique" : verified === false ? "key not unique" : "key unmeasured";
}

/**
 * Where a person's own arrangement lives: the per-user preference store (SP-3), keyed by connection and schema,
 * so it follows them to their next browser and their next machine. `localStorage` is this device's
 * paint-before-fetch cache and nothing more — the same seam the theme toggle uses.
 */
const LAYOUT_PREFERENCE = "ontology_map_layout";
const CACHE_KEY = "ont-map-layout";
const scopeOf = (connectionId: string, schema?: string) => `${connectionId}:${schema ?? ""}`;

type Positions = Record<string, { x: number; y: number }>;
type Layouts = Record<string, Positions>;

/** Only the positions that are two finite numbers survive a read, wherever they came from. */
function positionsOf(raw: unknown): Layouts {
  if (!raw || typeof raw !== "object") return {};
  const out: Layouts = {};
  for (const [scope, cards] of Object.entries(raw as Record<string, unknown>)) {
    if (!cards || typeof cards !== "object") continue;
    out[scope] = Object.fromEntries(Object.entries(cards as Positions)
      .filter(([, p]) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(([id, p]) => [id, { x: p.x, y: p.y }]));
  }
  return out;
}

function readCache(): Layouts {
  if (typeof window === "undefined") return {};
  try {
    return positionsOf(JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null"));
  } catch {
    return {};                                  // no storage, or something else wrote there: start from the layout
  }
}

function writeCache(layouts: Layouts): void {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(layouts)); } catch { /* the fetch still has it */ }
}

/** Which side of a card a link leaves by — whichever way the other card actually lies, recomputed as cards move,
 *  so a dragged card's links follow it round instead of trailing from where it used to be. */
function side(dx: number, dy: number): "t" | "r" | "b" | "l" {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "b" : "t");
}

interface CardData extends Record<string, unknown> {
  row: TypeMapRow;
  lit: boolean;
  picked: boolean;
  /** ON-8 — in an organisation's ontology, the name of the connection the type's rows live on. */
  source?: string;
}

/** ON-8 — a connection by its name where the name is known, else by its id. */
function nameOf(sources: Record<string, string>, connectionId: string | undefined): string {
  return connectionId ? sources[connectionId] ?? connectionId : "";
}

/** What the map holds, for the figures row above it: every entity it reads (parts included), its links, its declared
 *  processes and rules, and how many of an explorer's proposals wait for a person to confirm them. */
export interface MapSummary {
  entities: number;
  links: number;
  processes: number;
  rules: number;
  proposed: number;
}

/** What the "New" menu in the Ontology's title row asked for; `n` rises with each ask. */
export interface NewAsk { kind: "entity" | "link" | "process" | "rule" | "action"; n: number }

export function EntityTypeMap({ connectionId, schema, onReleaseChanged, onSummary, reviewDraft = 0, view = "map", onView,
  page = null, onPage, newAsk }: {
  /** The "New" menu's ask: a form opens over whichever view is drawn, or a designer takes the page. */
  newAsk?: NewAsk;
  connectionId: string;
  schema?: string;
  /** Which of the Ontology's views is drawn (2026-11-10, the user's "Yes, build it" to the redesign mockup): the
   *  register of entities (where the page opens), the map as it always was, or the one review queue. */
  view?: "register" | "map" | "review";
  onView?: (view: "register" | "map" | "review") => void;
  /** In the register, the type open as a page of its own ("‹ Ontology" goes back to the register). */
  page?: string | null;
  onPage?: (objectType: string | null) => void;
  /** Something here declared or published — the release strip above re-reads. */
  onReleaseChanged?: () => void;
  /** Told what the map holds each time it is read — the figures row above the map says it. */
  onSummary?: (summary: MapSummary) => void;
  /** Bumped by the figures row's "to approve": the explorer draft opens its proposals for review. */
  reviewDraft?: number;
}) {
  const [map, setMap] = useState<TypeMap | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Bumped by a write in the panel (a declared display property, a measurement) so the map and the panel re-read.
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<OntologyDraft | null>(null);
  // ON-9 — a declared process opened from the rail takes the panel's place; opening a type gives it back.
  const [openProcess, setOpenProcess] = useState<string | null>(null);
  // The process designer takes the whole map's place while a process is being designed (2026-10-09): a business process
  // is designed on a page of its own, not in the panel's quarter of the screen. An action is designed the same way.
  const [designing, setDesigning] = useState<{ kind: "process" | "action"; entity?: string; editing?: ProcessDetail } | null>(null);
  const openType = (objectType: string) => {
    setOpenProcess(null);
    setSelected(objectType);
  };
  // A form opened from outside an entity's own page — the "New" menu, the bar of the entity picked on the Atlas.
  const [asking, setAsking] = useState<(AuthoringAsk & { n: number }) | null>(null);
  const [entityAsk, setEntityAsk] = useState(0);
  const asked = newAsk?.n ?? 0, askedKind = newAsk?.kind;
  useEffect(() => {
    if (!asked || !askedKind) return;
    if (askedKind === "entity") setEntityAsk((n) => n + 1);
    else if (askedKind === "process" || askedKind === "action") setDesigning({ kind: askedKind });
    else setAsking({ kind: askedKind, n: asked });
  }, [asked, askedKind]);
  // ON-8 — the organisation's ontology is a map over several connections: every type and binding names its own, and
  // the rail, the cards and the panel say which by name.
  const domain = scopeDomain(connectionId);
  const [sources, setSources] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!domain) return;
    let live = true;
    getConnections()
      .then((all) => { if (live) setSources(Object.fromEntries(all.map((c) => [c.id, c.name]))); })
      .catch(() => { /* a connection's id stands in for its name */ });
    return () => { live = false; };
  }, [domain]);

  useEffect(() => {
    let live = true;
    setError("");
    getTypeMap(connectionId, schema)
      .then((next) => {
        if (!live) return;
        setMap(next);
        setSelected((current) =>
          (current && next.object_types.some((t) => t.object_type === current) ? current : hubOf(collapseParts(next))));
      })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [connectionId, schema, version]);

  // ON-7b — the explorer's draft beside the map: what it proposed, and where each proposal stands now. A scope with no
  // draft — or an API older than the draft door — simply offers a first one.
  useEffect(() => {
    // ON-8 — an explorer drafts one connection's tables and never an organisation's ontology, which people alone edit.
    if (domain) return;
    let live = true;
    getOntologyDraft(connectionId, schema)
      .then((next) => { if (live) setDraft(next); })
      .catch(() => { if (live) setDraft(null); });
    return () => { live = false; };
  }, [connectionId, schema, version, domain]);

  // A type (or a process) open as a page in the register: its name is the page's title, and "‹ Ontology" goes back to
  // the register (the shell's way back, 2026-11-10).
  const pageType = view === "register" && page ? map?.object_types.find((t) => t.object_type === page) ?? null : null;
  const pageProcess = view === "register" && openProcess ? (map?.processes ?? []).find((p) => p.id === openProcess) ?? null : null;
  const pageTitle = pageProcess?.display_name ?? pageType?.display_name;
  usePageChrome(pageTitle ? { title: pageTitle, trail: [pageTitle] } : {});
  useChromeBack(pageTitle ? () => { setOpenProcess(null); onPage?.(null); } : null);

  // ON-7 — a part is not a card: it is folded into its parent. Memoised on the map itself, so a render that changes nothing
  // the map draws — the draft arriving, a search in the rail — hands the canvas the same map and re-lays nothing.
  const drawn = useMemo(() => (map ? collapseParts(map) : null), [map]);

  useEffect(() => {
    if (!map || !onSummary) return;
    onSummary({
      entities: map.object_types.length, links: map.links.length, processes: (map.processes ?? []).length,
      rules: (map.rules ?? []).length, proposed: draft?.counts.proposed ?? 0,
    });
  }, [map, draft, onSummary]);

  if (error) {
    return (
      <EmptyState icon="alert" title="The entity-type map could not be read"
        action={<Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)}>Try again</Button>}>
        {error}
      </EmptyState>
    );
  }
  if (!map || !drawn) return <div style={{ flex: 1, padding: 24 }}><SkeletonRows rows={6} /></div>;
  const declare = (spec: DeclaredEntitySpec) => declareEntity(connectionId, spec, schema).then((made) => {
    setVersion((v) => v + 1);
    setSelected(made.object_type);
    if (view === "register") onPage?.(made.object_type);
  });
  const explore = () => exploreOntology(connectionId, schema).then((next) => {
    setDraft(next);
    setVersion((v) => v + 1);
  });
  const confirm = (request: { all?: boolean; targets?: ConfirmTarget[] }) => confirmProposals(connectionId, request, schema).then((next) => {
    setDraft(next);
    setVersion((v) => v + 1);
    if (next.refused.length) throw new Error(next.refused.map((r) => r.why).join("; "));
  });
  const openPage = (objectType: string) => {
    setOpenProcess(null);
    setSelected(objectType);
    if (view !== "register") onView?.("register");
    onPage?.(objectType);
  };
  // The forms the "New" menu and the Atlas open, over whichever view is drawn.
  const overlays = (
    <>
      <DeclareEntity headless declare={declare} sources={domain ? sources : undefined}
        connectionId={domain ? undefined : connectionId} schema={schema} ask={entityAsk} />
      {asking && (
        <EntityAuthoring key={asking.n} ask={asking} types={map.object_types} connectionId={connectionId} schema={schema}
          onClose={() => setAsking(null)} onChanged={() => { setVersion((v) => v + 1); onReleaseChanged?.(); }} />
      )}
    </>
  );
  if (!selected || map.object_types.length === 0) {
    if (!domain) return <EmptyState icon="node" title="This ontology has no entities yet." />;
    // ON-8 — an organisation's ontology starts empty, so its first type is declared from here.
    return (
      <EmptyState icon="node" title="Nothing is declared in the organisation's ontology yet">
        Declare a type on any connection: its rows are read and its key counted there before anything is written.
        <DeclareEntity declare={declare} sources={sources} />
      </EmptyState>
    );
  }
  // ON-7 — picking a part lights its parent's card.
  if (designing?.kind === "action" && !domain) {
    return (
      <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }} data-testid="entity-type-map">
        {overlays}
        <ActionDesigner connectionId={connectionId} schema={schema} types={map.object_types} entity={designing.entity}
          onClose={() => setDesigning(null)}
          onDeclared={() => { setVersion((v) => v + 1); onReleaseChanged?.(); }}
          onPublished={() => onReleaseChanged?.()} />
      </div>
    );
  }
  if (designing && !domain) {
    return (
      <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }} data-testid="entity-type-map">
        {overlays}
        <ProcessDesigner connectionId={connectionId} schema={schema} types={map.object_types} entity={designing.entity}
          editing={designing.editing}
          takenIds={(map.processes ?? []).map((p) => p.id).filter((id) => id !== designing.editing?.id)}
          onClose={() => setDesigning(null)}
          onDeclared={() => { setVersion((v) => v + 1); onReleaseChanged?.(); }}
          onPublished={() => onReleaseChanged?.()} />
      </div>
    );
  }
  // ── The register (where the Ontology opens) and the review queue (2026-11-10) ─────────────────────────────────────
  if (view === "register") {
    if (pageProcess) {
      return (
        <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }} data-testid="entity-type-map">
        {overlays}
          <ProcessPanel full connectionId={connectionId} schema={schema} processId={pageProcess.id} version={version}
            onOpenType={openPage} onClose={() => setOpenProcess(null)} onChanged={() => setVersion((v) => v + 1)}
            onChangeProcess={domain ? undefined : (process) => setDesigning({ kind: "process", editing: process })} />
        </div>
      );
    }
    if (pageType) {
      return (
        <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }} data-testid="entity-type-map">
        {overlays}
          <EntityTypePanel full connectionId={connectionId} schema={schema} objectType={pageType.object_type} types={map.object_types}
            version={version} onOpen={openPage} onOpenProcess={setOpenProcess}
            onChanged={() => { setVersion((v) => v + 1); onReleaseChanged?.(); }}
            onDesignProcess={domain ? undefined : (entity) => setDesigning({ kind: "process", entity })}
            onDesignAction={domain ? undefined : (entity) => setDesigning({ kind: "action", entity })}
            sources={domain ? sources : undefined} />
        </div>
      );
    }
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflowY: "auto" }} data-testid="entity-type-map">
        {overlays}
        {/* A connection's ontology opens on its Business Atlas, with the register's tables folded under it. The
            organisation's ontology has no Atlas (it is one connection's picture), so its register opens on its tables. */}
        <OntologyRegister map={map} sources={domain ? sources : undefined}
          lead={domain ? undefined : <BusinessAtlas embedded connectionId={connectionId} schema={schema} title={schema || "This connection"} map={map}
            onOpenEntity={openPage} onOpenProcess={setOpenProcess}
            onAct={(act, entity, to) => {
              if (act === "process" || act === "action") setDesigning({ kind: act, entity: entity.id });
              else setAsking({ kind: act, entity: entity.object_type, to: to?.object_type, n: Date.now() });
            }} />}
          onOpen={openPage} onOpenProcess={setOpenProcess}
          declareDoor={<DeclareEntity bare declare={declare} sources={domain ? sources : undefined}
            connectionId={domain ? undefined : connectionId} schema={schema} />}
          onNewProcess={domain ? undefined : () => setDesigning({ kind: "process" })}
          onNewAction={domain ? undefined : () => setDesigning({ kind: "action" })} />
      </div>
    );
  }
  if (view === "review") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflowY: "auto" }} data-testid="entity-type-map">
        {overlays}
        <OntologyReview map={map} draft={domain ? null : draft} explore={domain ? undefined : explore}
          confirm={domain ? undefined : confirm} onOpen={openPage} />
      </div>
    );
  }

  const picked = map.object_types.find((t) => t.object_type === selected);
  const standing = picked?.absorbed_into && drawn.object_types.some((t) => t.object_type === picked.absorbed_into)
    ? picked.absorbed_into : selected;
  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }} data-testid="entity-type-map">
        {overlays}
      <TypeRail types={drawn.object_types} parts={map.object_types.filter((t) => t.absorbed_into)} selected={selected}
        query={query} onQuery={setQuery} onPick={openType}
        processes={map.processes ?? []} rules={map.rules ?? []} openProcess={openProcess}
        onPickProcess={(p) => {
          setSelected(p.entity);
          setOpenProcess(p.id);
        }}
        declare={declare}
        onNewProcess={domain ? undefined : () => setDesigning({ kind: "process" })}
        onNewAction={domain ? undefined : () => setDesigning({ kind: "action" })}
        sources={domain ? sources : undefined}
        draft={draft}
        reviewDraft={reviewDraft}
        explore={explore}
        confirm={confirm} />
      <MapCanvas map={drawn} selected={standing} onSelect={openType} scope={scopeOf(connectionId, schema)}
        sources={domain ? sources : undefined} />
      {openProcess ? (
        <ProcessPanel connectionId={connectionId} schema={schema} processId={openProcess} version={version}
          onOpenType={openType} onClose={() => setOpenProcess(null)} onChanged={() => setVersion((v) => v + 1)}
          onChangeProcess={domain ? undefined : (process) => setDesigning({ kind: "process", editing: process })} />
      ) : (
        <EntityTypePanel connectionId={connectionId} schema={schema} objectType={selected} types={map.object_types}
          version={version} onOpen={openType} onOpenProcess={setOpenProcess}
          onChanged={() => { setVersion((v) => v + 1); onReleaseChanged?.(); }}
          onDesignProcess={domain ? undefined : (entity) => setDesigning({ kind: "process", entity })}
          onDesignAction={domain ? undefined : (entity) => setDesigning({ kind: "action", entity })}
          sources={domain ? sources : undefined} />
      )}
    </div>
  );
}

/** A key as a mark: ✓ when the data proved it unique, and a dot that says what is wrong when it did not. */
function KeyMark({ verified }: { verified: boolean | null }) {
  if (verified === true) return <span style={{ color: "var(--grn4)" }} title="key unique">✓ key</span>;
  if (verified === false) return <span style={{ color: "var(--red4)" }}>● key not unique</span>;
  return <span style={{ color: "var(--amb4)" }}>● key not counted</span>;
}

function matches(t: TypeMapRow, wanted: string): boolean {
  return [t.display_name, t.object_type, t.id, t.table].some((s) => s.toLowerCase().includes(wanted));
}

function TypeRail({ types, parts, selected, query, onQuery, onPick, processes, rules, openProcess, onPickProcess, declare,
  onNewProcess, onNewAction, sources, draft, reviewDraft, explore, confirm }: {
  types: TypeMapRow[];
  /** ON-7 — the types folded into a parent: listed under the cards, still openable by name. */
  parts: TypeMapRow[];
  selected: string;
  query: string;
  onQuery: (q: string) => void;
  onPick: (objectType: string) => void;
  /** ON-9 — the declared processes and rules, and the process open in the panel. */
  processes: ProcessRow[];
  rules: RuleRow[];
  openProcess: string | null;
  onPickProcess: (process: ProcessRow) => void;
  declare: (spec: DeclaredEntitySpec) => Promise<void>;
  /** Opens the process designer; absent where it does not reach (an organisation's ontology). */
  onNewProcess?: () => void;
  /** Opens the action designer; absent where it does not reach. */
  onNewAction?: () => void;
  /** ON-8 — set in an organisation's ontology: its connections by id, which each row names and a declaration picks. */
  sources?: Record<string, string>;
  /** ON-7b — the explorer's draft, and the two doors it offers: a draft, and a confirmation. */
  draft: OntologyDraft | null;
  /** Bumped from the figures row: open the draft's proposals for review. */
  reviewDraft: number;
  explore: () => Promise<void>;
  confirm: (request: { all?: boolean; targets?: ConfirmTarget[] }) => Promise<void>;
}) {
  const wanted = query.trim().toLowerCase();
  const shown = wanted ? types.filter((t) => matches(t, wanted)) : types;
  const shownParts = wanted ? parts.filter((t) => matches(t, wanted)) : parts;
  const row = (t: TypeMapRow, part: boolean) => {
    const current = t.object_type === selected;
    return (
      <Button key={t.object_type} variant="plain" size="sm" onClick={() => onPick(t.object_type)}
        aria-current={current ? "true" : undefined} data-testid={part ? "entity-rail-part" : "entity-rail-row"}
        title={part ? `Open ${t.display_name}, a part of ${t.absorbed_into}` : `Light ${t.display_name} up on the map and open it here`}
        className="h-auto w-full justify-start py-1.5"
        style={current ? { background: "var(--bg-sel)" } : undefined}>
        {/* A row is a mark, a name, its count of objects, and one line of marks — the approved mockup's rail
            (2026-10-10); the square (2026-10-25) says what kind of thing the name is, and every name starts at one x. */}
        <span style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", columnGap: 8, rowGap: 1, width: "100%",
                       textAlign: "left", alignItems: "center" }}>
          <IconSquare name={part ? "layers" : "node"} title={part ? "a part of another type" : "an entity type"} />
          <span className="aug-fs-sm" style={{ color: "var(--t1)", fontWeight: current ? 600 : 500, overflow: "hidden",
                                                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.display_name}
          </span>
          <span className="aug-fs-xs" style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}
            title={t.rows == null ? "its rows are not counted" : `${formatCount(t.rows)} rows`}>
            {t.rows == null ? "—" : formatCount(t.rows)}
          </span>
          {/* ON-8 — the connection on a line of its own: a name like "LuxExperience (explorer draft)" would push the key
              and the links off the rail's edge. */}
          {sources && t.connection_id && (
            <span className="aug-fs-xs" data-testid="entity-rail-connection" title={`read from ${nameOf(sources, t.connection_id)}`}
              style={{ gridColumn: "2 / -1", color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              on {nameOf(sources, t.connection_id)}
            </span>
          )}
          <span className="aug-fs-xs" style={{ gridColumn: "2 / -1", color: "var(--t3)" }}>
            {part ? `part of ${t.absorbed_into}` : (
              <>
                <KeyMark verified={t.key_verified} />
                {` · ${t.links} ${t.links === 1 ? "link" : "links"}`}
                {t.parts?.length ? ` · ${t.parts.length} ${t.parts.length === 1 ? "part" : "parts"}` : ""}
              </>
            )}
            {t.unconfirmed ? (
              <span style={{ color: "var(--vio4)" }} title="an explorer proposed this, and no person has confirmed it yet">
                {` · ● ${t.unconfirmed} proposed`}
              </span>
            ) : null}
          </span>
        </span>
      </Button>
    );
  };
  return (
    <nav aria-label="Entity types"
      style={{ width: 212, flexShrink: 0, borderRight: RULE, display: "flex", flexDirection: "column", minHeight: 0,
               background: "var(--bg-0)" }}>
      <div style={{ padding: "10px 10px 6px" }}>
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Find an entity type"
          aria-label="Find an entity type" data-testid="entity-rail-search" />
        <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 6 }}>
          {shown.length === types.length ? `${types.length} types` : `${shown.length} of ${types.length} types`}
          {parts.length ? ` · ${parts.length} ${parts.length === 1 ? "part" : "parts"}` : ""}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 10px" }}>
        {shown.length === 0 && shownParts.length === 0 && <EmptyState variant="inline" title={`No type matches “${query.trim()}”.`} />}
        {shown.map((t) => row(t, false))}
        {shownParts.length > 0 && (
          <div className="aug-fs-xs" style={{ color: "var(--t3)", padding: "8px 8px 2px", textTransform: "uppercase",
                                              letterSpacing: ".06em", fontWeight: 600 }}>
            Parts
          </div>
        )}
        {shownParts.map((t) => row(t, true))}
        <DeclarationRows processes={processes} rules={rules} openProcess={openProcess} onPickProcess={onPickProcess}
          onPickType={onPick} onNewProcess={onNewProcess} onNewAction={onNewAction} />
      </div>
      {!sources && <ExplorerDraft draft={draft} explore={explore} confirm={confirm} onOpen={onPick} reviewSignal={reviewDraft} />}
      <DeclareEntity declare={declare} sources={sources} />
    </nav>
  );
}

const RAIL_HEADING: React.CSSProperties = {
  color: "var(--t3)", padding: "8px 8px 2px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600,
};

function breachWords(rate: number | null): string {
  return rate == null ? "not counted" : `${(rate * 100).toFixed(2)}% broken`;
}

/** ON-9 — the declared processes and rules under the types: a process opens in the panel, with its type lit on the
 *  map; a rule opens the type it is a segment of. Each row says what the data counted, not what was declared. */
function DeclarationRows({ processes, rules, openProcess, onPickProcess, onPickType, onNewProcess, onNewAction }: {
  processes: ProcessRow[];
  rules: RuleRow[];
  openProcess: string | null;
  onPickProcess: (process: ProcessRow) => void;
  onPickType: (objectType: string) => void;
  onNewProcess?: () => void;
  onNewAction?: () => void;
}) {
  if (!processes.length && !rules.length && !onNewProcess && !onNewAction) return null;
  return (
    <>
      {(processes.length > 0 || onNewProcess) && <div className="aug-fs-xs" style={RAIL_HEADING}>Processes</div>}
      {processes.map((p) => {
        const current = p.id === openProcess;
        return (
          <Button key={p.id} variant="plain" size="sm" onClick={() => onPickProcess(p)} data-testid="entity-rail-process"
            aria-current={current ? "true" : undefined} className="h-auto w-full justify-start py-1.5"
            title={`Open the ${p.display_name} process — its stages, timings and promises`}
            style={current ? { background: "var(--bg-hover)" } : undefined}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, gap: 1 }}>
              <span className="aug-fs-sm" style={{ color: "var(--t1)", fontWeight: current ? 600 : 500 }}>{p.display_name}</span>
              <span className="aug-fs-xs" style={{ color: p.verified === false ? "var(--red5)" : "var(--t3)" }}>
                {p.entity} · {p.stages.length} stages
                {p.promises.map((promise) => ` · ${promise.name} ${breachWords(promise.breach_rate)}`).join("")}
              </span>
            </span>
          </Button>
        );
      })}
      {onNewProcess && (
        <Button variant="ghost" size="sm" onClick={onNewProcess} data-testid="entity-rail-new-process"
          className="justify-start py-1.5" title="Design a business process from the data — its stages, promises and exits">
          <Icon name="plus" size={12} /> New process
        </Button>
      )}
      {onNewAction && <div className="aug-fs-xs" style={RAIL_HEADING}>Actions</div>}
      {onNewAction && (
        <Button variant="ghost" size="sm" onClick={onNewAction} data-testid="entity-rail-new-action"
          className="justify-start py-1.5" title="Decide an action people can press on an object — what it does, when it is allowed, who approves">
          <Icon name="plus" size={12} /> New action
        </Button>
      )}
      {rules.length > 0 && <div className="aug-fs-xs" style={RAIL_HEADING}>Rules</div>}
      {rules.map((r) => (
        <Button key={r.id} variant="plain" size="sm" onClick={() => onPickType(r.entity)} data-testid="entity-rail-rule"
          className="h-auto w-full justify-start py-1.5" title={`Open ${r.entity}, where ${r.display_name} reads as a segment`}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, gap: 1 }}>
            <span className="aug-fs-sm" style={{ color: "var(--t1)", fontWeight: 500 }}>{r.display_name}</span>
            <span className="aug-fs-xs" style={{ color: r.verified === false ? "var(--red5)" : "var(--t3)" }}>
              {r.entity} · {r.admitted == null ? "not counted" : `admits ${formatCount(r.admitted)}`}
              {r.scopes?.length ? ` · scopes ${r.scopes.join(", ")}` : ""}
              {r.flags ? ` · ${r.flags} flagged` : ""}
            </span>
          </span>
        </Button>
      ))}
    </>
  );
}

/** ON-7b — the explorer's draft, from the rail. A person asks an explorer to map the business — one model call, and the
 *  button says so — then reads what it proposed and what the data refused, and confirms. What the explorer proposed
 *  already reads on the map, marked proposed, until a person confirms it or withdraws it where it lives. */
function ExplorerDraft({ draft, explore, confirm, onOpen, reviewSignal = 0 }: {
  draft: OntologyDraft | null;
  explore: () => Promise<void>;
  confirm: (request: { all?: boolean; targets?: ConfirmTarget[] }) => Promise<void>;
  onOpen: (objectType: string) => void;
  /** Bumped from the figures row's "to approve": the proposals open here, in view. */
  reviewSignal?: number;
}) {
  const [busy, setBusy] = useState<"" | "explore" | "confirm">("");
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reviewSignal) return;
    setOpen(true);
    box.current?.scrollIntoView?.({ block: "nearest" });
  }, [reviewSignal]);
  const run = draft?.runs[0];
  const counts = draft?.counts;
  const act = async (what: "explore" | "confirm", write: () => Promise<void>) => {
    setBusy(what);
    setProblem("");
    try {
      await write();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  const gone = counts ? counts.withdrawn + counts.released : 0;
  return (
    <div ref={box} style={{ padding: "8px 10px", borderTop: RULE, display: "flex", flexDirection: "column", gap: 6 }}
      data-testid="explorer-draft">
      <div className="aug-fs-xs" style={{ color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
        Explorer draft
      </div>
      {run && counts ? (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t2)", lineHeight: 1.45 }} data-testid="explorer-draft-counts"
          title={`${run.provenance}${run.fallback ? " (a fallback answered)" : ""} · ${run.at}`}>
          {counts.proposed} proposed · {counts.confirmed} confirmed · {counts.refused} refused
          {gone ? ` · ${gone} withdrawn` : ""}
        </p>
      ) : (
        <p className="aug-fs-xs" style={{ margin: 0, color: "var(--t3)", lineHeight: 1.45 }}>
          An explorer reads these tables and proposes the business: which tables are one entity, the links between them,
          the processes its objects go through and the sets of objects it names. One model call. Every claim is measured
          before it lands and stays proposed until you confirm it.
        </p>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("explore", explore)}
          data-testid="explorer-draft-run"
          title="One model call: an explorer proposes entities, parts, links, processes and rules, and the data measures each before it lands">
          {busy === "explore" ? "Drafting…" : run ? "Draft again" : "Draft the business"}
        </Button>
        {counts && counts.proposed > 0 && (
          <Button variant="outline" size="xs" disabled={!!busy} onClick={() => act("confirm", () => confirm({ all: true }))}
            data-testid="explorer-draft-confirm-all" title="Make every proposal still the model's yours, exactly as measured">
            {busy === "confirm" ? "Confirming…" : `Confirm ${counts.proposed}`}
          </Button>
        )}
        {!!draft?.proposals.length && (
          <Button variant="ghost" size="xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "Review"}
          </Button>
        )}
      </div>
      {open && draft && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {draft.proposals.map((p) => (
            <div key={p.key} style={{ padding: "5px 0", borderTop: RULE }} data-testid="explorer-proposal">
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span className={`aug-tag ${TIER_TAG[p.tier]}`}>{p.tier}</span>
                {p.tier === "proposed" && (
                  <Button variant="minimal" size="xs" disabled={!!busy}
                    onClick={() => act("confirm", () => confirm({ targets: [targetOf(p)] }))}>
                    Confirm
                  </Button>
                )}
                {p.object_type && p.tier !== "refused" && p.tier !== "withdrawn" && (
                  <Button variant="minimal" size="xs" onClick={() => onOpen(p.object_type)}>Open</Button>
                )}
              </div>
              <div className="aug-fs-xs" style={{ ...MONO, color: "var(--t1)", overflowWrap: "anywhere", marginTop: 2 }}>
                {p.sentence}
              </div>
              <div className="aug-fs-xs" style={{ color: "var(--t3)", lineHeight: 1.45, overflowWrap: "anywhere" }}
                title={p.note}>
                {p.tier === "refused" || !p.reason ? p.note : p.reason}
              </div>
            </div>
          ))}
        </div>
      )}
      {problem && <p className="aug-fs-xs" style={{ margin: 0, color: "var(--red5)", lineHeight: 1.45 }}>{problem}</p>}
    </div>
  );
}

/** ON-7 — a new entity: what it reads, what one row is, and what tells two apart. The id is made from the name and the
 *  key chosen from the table's own columns. The server reads the source's columns and counts its key before anything is
 *  written; a table that already backs an entity is refused with the reason — rename or absorb that one instead. */
function pascal(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("").replace(/^(\d)/, "E$1").slice(0, 64);
}

/** The column most likely to be a table's key, by its name: `id`, else the first that ends in `_id`. A suggestion —
 *  the server counts whichever is saved and refuses one that repeats. */
function likelyKey(columns: string[]): string {
  return columns.find((c) => c.toLowerCase() === "id") ?? columns.find((c) => /_id$/i.test(c)) ?? "";
}

function DeclareEntity({ declare, sources, bare = false, connectionId, schema, ask = 0, headless = false }: {
  /** No button of its own: the form only, opened by `ask` (the "New" menu). */
  headless?: boolean;
  /** Under the register's table rather than at the rail's foot: no rail edge, the page's width. */
  bare?: boolean;
  declare: (spec: DeclaredEntitySpec) => Promise<void>;
  /** ON-8 — set in an organisation's ontology: the connections a type's rows may live on, by id. */
  sources?: Record<string, string>;
  /** One connection's ontology: its table's columns are read, so the key is chosen from them and not typed. */
  connectionId?: string;
  schema?: string;
  /** Bumped by the "New" menu: the form opens. */
  ask?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (ask) setOpen(true); }, [ask]);
  const [id, setId] = useState("");
  const [idSaid, setIdSaid] = useState(false);
  const [name, setName] = useState("");
  const [reads, setReads] = useState<"table" | "query">("table");
  const [source, setSource] = useState("");
  const [key, setKey] = useState("");
  const [keySaid, setKeySaid] = useState(false);
  const [domain, setDomain] = useState("");
  const [connection, setConnection] = useState("");
  const [schemaName, setSchemaName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // The table's own columns, read a moment after the name stops changing: the key is then chosen, with the likely one
  // already picked. A table that cannot be read leaves the key to be typed, as before.
  const [columns, setColumns] = useState<string[]>([]);
  const table = reads === "table" && !sources && connectionId ? source.trim() : "";
  useEffect(() => {
    setColumns([]);
    if (!table || !connectionId) return;
    let live = true;
    const wait = setTimeout(() => {
      Promise.resolve().then(() => getTableColumns(connectionId, table, schema))
        .then((cols) => {
          if (!live) return;
          const names = (cols ?? []).map((c) => c.name);
          setColumns(names);
          if (!keySaid) setKey(likelyKey(names));
        })
        .catch(() => { /* the key is typed */ });
    }, 350);
    return () => { live = false; clearTimeout(wait); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a key the person chose is not overwritten by a later read
  }, [table, connectionId, schema]);
  const ready = /^[A-Z][A-Za-z0-9]{0,63}$/.test(id.trim()) && !!name.trim() && !!source.trim() && !!key.trim()
    && (!sources || !!connection);
  const submit = async () => {
    setBusy(true);
    setProblem("");
    const spec: DeclaredEntitySpec = { id: id.trim(), display_name: name.trim(),
      backing: { primary_key: key.trim(), ...(reads === "table" ? { table: source.trim() } : { sql: source.trim() }) } };
    if (sources) {
      spec.backing.connection_id = connection;
      if (reads === "table" && schemaName.trim()) spec.backing.schema_name = schemaName.trim();
    }
    if (domain.trim()) spec.domain = domain.trim();
    try {
      await declare(spec);
      savedToDraft("New entity");
      setOpen(false);
      setId(""); setIdSaid(false); setName(""); setSource(""); setKey(""); setKeySaid(false); setDomain(""); setConnection(""); setSchemaName("");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={headless ? { display: "contents" } : bare ? { paddingTop: 10 } : { padding: "6px 10px 10px", borderTop: RULE }}>
      <Door open={open} onOpenChange={setOpen} busy={busy} label={headless ? undefined : "New entity"} testId="entity-declare" title="New entity"
        hint="A thing the business keeps — what it reads, what one row is, and what tells two apart"
        description={sources
          ? "Three answers make an entity: what it reads, on any of the organisation's connections; what one row is; and what tells two rows apart. Its columns are read and its key counted there before anything is written."
          : "Three answers make an entity: what it reads, what one row is, and what tells two rows apart. Its columns are read and its key counted before anything is written."}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="entity-declare-form">
          {sources && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label="On which connection" style={{ flex: 2, minWidth: 180 }}>
                <SelectField value={connection} aria-label="Entity connection"
                  onChange={(e) => setConnection(e.target.value)} data-testid="entity-declare-connection">
                  <option value="">connection…</option>
                  {Object.entries(sources).map(([cid, label]) => <option key={cid} value={cid}>{label}</option>)}
                </SelectField>
              </Field>
              {reads === "table" && (
                <Field label="Schema" style={{ flex: 1, minWidth: 110 }}>
                  <Input style={FIELD} value={schemaName} placeholder="schema" aria-label="Entity schema" onChange={(e) => setSchemaName(e.target.value)} />
                </Field>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="What it reads" style={{ minWidth: 110 }}>
              <SelectField value={reads} aria-label="Entity source kind"
                onChange={(e) => { setReads(e.target.value as "table" | "query"); setKey(""); setKeySaid(false); }}>
                <option value="table">a table</option>
                <option value="query">a SELECT</option>
              </SelectField>
            </Field>
            <Field label={reads === "table" ? "The table" : "The SELECT — one row per object"} style={{ flex: 1, minWidth: 220 }}>
              <Input style={FIELD} value={source}
                aria-label={reads === "table" ? "Entity table" : "Entity SELECT"}
                placeholder={reads === "table" ? "purchase_orders" : "SELECT … one row per object"}
                onChange={(e) => setSource(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="One row is one…" style={{ flex: 2, minWidth: 180 }}>
              <Input value={name} placeholder="Purchase order" aria-label="Entity display name"
                onChange={(e) => { setName(e.target.value); if (!idSaid) setId(pascal(e.target.value)); }} />
            </Field>
            <Field label="Domain (optional)" style={{ flex: 1, minWidth: 140 }}>
              <Input value={domain} placeholder="Commerce" aria-label="Entity domain" onChange={(e) => setDomain(e.target.value)} />
            </Field>
          </div>
          <Field label="What tells two apart — its key"
            hint={columns.length ? (key && !keySaid ? "Suggested from the column's name. It is counted on the data when you save; a key that repeats is refused."
              : "It is counted on the data when you save; a key that repeats is refused.") : "The column that is different on every row."}>
            {columns.length ? (
              <SelectField style={FIELD} value={key} aria-label="Entity key column" onChange={(e) => { setKey(e.target.value); setKeySaid(true); }}>
                <option value="">choose a column…</option>
                {columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
            ) : (
              <Input style={FIELD} value={key} placeholder="Key column" aria-label="Entity key column"
                onChange={(e) => { setKey(e.target.value); setKeySaid(true); }} />
            )}
          </Field>
          <Field label="Its id" hint="Made from the name. Links, rules and metrics point at it, so it does not change afterwards.">
            <Input style={FIELD} value={id} placeholder="Id — PascalCase, e.g. PurchaseOrder" aria-label="Entity id"
              onChange={(e) => { setId(e.target.value); setIdSaid(true); }} />
          </Field>
          <FormFoot busy={busy} ready={ready} onSave={() => void submit()} onCancel={() => setOpen(false)} busyLabel="Counting…" problem={problem} />
        </div>
      </Door>
    </div>
  );
}

/** One entity type on the canvas. Handles on all four sides, invisible: a link leaves by whichever side the type
 *  it reaches actually lies on, and that is recomputed as cards move. */
function EntityCard({ data }: NodeProps<RFNode<CardData>>) {
  const { row, lit, picked, source } = data;
  return (
    <div className="aug-panel" data-testid="entity-map-card"
      style={{ width: CARD.w, height: CARD.h, padding: "8px 12px", display: "flex", flexDirection: "column",
               justifyContent: "center", gap: 2, opacity: lit ? 1 : UNLIT, cursor: "pointer",
               borderColor: picked ? "var(--blue4)" : undefined,
               boxShadow: picked ? "0 0 0 2px var(--blue1)" : undefined }}>
      {(["t", "r", "b", "l"] as const).map((id) => (
        <React.Fragment key={id}>
          <Handle type="source" id={id} position={SIDES[id]} style={HANDLE} isConnectable={false} />
          <Handle type="target" id={`${id}-in`} position={SIDES[id]} style={HANDLE} isConnectable={false} />
        </React.Fragment>
      ))}
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span className="aug-fs-sm"
          style={{ color: "var(--t1)", fontWeight: picked ? 600 : 500, overflow: "hidden",
                   textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.display_name}
        </span>
        {/* The business name leads and the physical table follows in mono (Aughor Intelligence · 03 — "an
            ontology that only shows table names is a schema diagram"). On one line, because the card is a
            fixed 196×58 the layout places by: the table gives way first, and hides when it IS the name. */}
        {row.table && row.table.split(".").pop() !== row.display_name && (
          <span className="aug-entity-card-table" title={row.table}>{row.table.split(".").pop()}</span>
        )}
        {/* ON-7b — what an explorer proposed here that no person has confirmed yet */}
        {row.unconfirmed ? (
          <span className="aug-tag aug-tag-violet" data-testid="entity-map-card-proposed" style={{ flexShrink: 0 }}
            title={row.origin === "model" ? `proposed by ${row.provenance || "an explorer"}` : "an explorer proposed part of this"}>
            {row.origin === "model" ? "proposed" : `${row.unconfirmed} proposed`}
          </span>
        ) : null}
      </span>
      <span className="aug-fs-xs" style={{ color: "var(--t3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        title={source ? `read from ${source}` : undefined}>
        {source ? `on ${source} · ` : ""}
        {keyWords(row.key_verified)} · {row.traversable_links} of {row.links} {row.links === 1 ? "link" : "links"}
        {row.parts?.length ? ` · ${row.parts.length} ${row.parts.length === 1 ? "part" : "parts"}` : ""}
      </span>
    </div>
  );
}

const SIDES = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left } as const;
const HANDLE: React.CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1, border: "none" };
const NODE_TYPES = { entity: EntityCard };

/** How round a link's corner is: not at all. A link runs straight and turns at a right angle, never along a curve. */
export const LINK_CORNER_RADIUS = 0;

interface Ends {
  sourceX: number; sourceY: number; sourcePosition: Position;
  targetX: number; targetY: number; targetPosition: Position;
}

/** Where a link runs and where its label is centred, from its two handle points. The edge draws with it and the map
 *  keeps labels apart with it (`separateLabels`), so the two agree on where every label starts. */
function linkGeometry(ends: Ends): { path: string; labelX: number; labelY: number } {
  const [path, labelX, labelY] = getSmoothStepPath({ ...ends, borderRadius: LINK_CORNER_RADIUS });
  return { path, labelX, labelY: linkLabelY(ends.sourcePosition, ends.sourceY, ends.targetY, labelY) };
}

/** The point a link leaves or reaches a card by: the middle of that side, where the card's handle sits. */
function handlePoint(topLeft: { x: number; y: number }, at: "t" | "r" | "b" | "l"): { x: number; y: number } {
  const x = at === "l" ? topLeft.x : at === "r" ? topLeft.x + CARD.w : topLeft.x + CARD.w / 2;
  const y = at === "t" ? topLeft.y : at === "b" ? topLeft.y + CARD.h : topLeft.y + CARD.h / 2;
  return { x, y };
}

/** A link between two cards: straight runs that turn only at a right angle — React Flow's step path with square
 *  corners — and its label lifted clear above its two cards on a sideways link, which would otherwise clip it
 *  (`linkLabelY`), then moved by `data.labelShift`, the step the map gave it so it lands on no other label. */
export function LinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, label,
  labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius, interactionWidth, data }: EdgeProps) {
  const { path, labelX, labelY } = linkGeometry({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const shift = typeof data?.labelShift === "number" ? data.labelShift : 0;
  return (
    <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={interactionWidth}
      label={label} labelX={labelX} labelY={labelY + shift} labelStyle={labelStyle}
      labelShowBg={labelShowBg} labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius} />
  );
}

const EDGE_TYPES = { link: LinkEdge };

function MapCanvas({ map, selected, onSelect, scope, sources }: {
  map: TypeMap;
  selected: string;
  onSelect: (objectType: string) => void;
  scope: string;
  /** ON-8 — set in an organisation's ontology: each card names the connection its type lives on. */
  sources?: Record<string, string>;
}) {
  const hub = useMemo(() => hubOf(map) ?? selected, [map, selected]);
  const start = useMemo(() => layoutMap(map, hub), [map, hub]);
  const rows = useMemo(() => new Map(map.object_types.map((t) => [t.object_type, t])), [map]);
  const lit = useMemo(() => litBy(map, selected), [map, selected]);
  /** Every map this person has arranged. The cache is read BEFORE the first paint — reading only from the store
   *  would draw the map at the layout's positions and then jump — and the store's answer wins when it lands. */
  const [layouts, setLayouts] = useState<Layouts>(readCache);
  useEffect(() => {
    let live = true;
    getMyPreferences()
      .then(({ preferences }) => {
        if (!live) return;
        const stored = positionsOf(preferences[LAYOUT_PREFERENCE]);
        setLayouts(stored);
        writeCache(stored);
      })
      // An unreachable store leaves the cached arrangement standing — cosmetic, never blocking.
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const moved = useMemo(() => layouts[scope] ?? {}, [layouts, scope]);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode<CardData>>([]);
  const [edges, setEdges] = useEdgesState<RFEdge>([]);

  // The cards: where the layout starts them, or where this person left them.
  useEffect(() => {
    setNodes(start.nodes.flatMap((node) => {
      const row = rows.get(node.objectType);
      if (!row) return [];
      const at = moved[node.objectType] ?? { x: node.x - CARD.w / 2, y: node.y - CARD.h / 2 };
      return [{
        id: node.objectType, type: "entity", position: at, draggable: true,
        data: { row, lit: true, picked: false, source: sources ? nameOf(sources, row.connection_id) : undefined },
      } satisfies RFNode<CardData>];
    }));
  }, [start, rows, moved, setNodes, sources]);

  // Lighting is a re-read of the cards already on the canvas, never a re-layout: picking a type must not move it.
  useEffect(() => {
    setNodes((current) => current.map((node) => {
      const on = lit.nodes.size === 0 || lit.nodes.has(node.id);
      const picked = node.id === selected;
      return node.data.lit === on && node.data.picked === picked
        ? node
        : { ...node, data: { ...node.data, lit: on, picked } };
    }));
  }, [lit, selected, setNodes]);

  // The links, drawn between whichever sides the two cards now face — recomputed from live positions, so an edge
  // follows a card that was dragged rather than pointing at where it used to be.
  useEffect(() => {
    const corner = new Map(nodes.map((n) => [n.id, n.position]));
    const at = new Map(nodes.map((n) => [n.id, { x: n.position.x + CARD.w / 2, y: n.position.y + CARD.h / 2 }]));
    const drawn = map.links.flatMap((link) => {
      const [a, b] = [at.get(link.from), at.get(link.to)];
      if (!a || !b || link.from === link.to) return [];
      const on = lit.links.has(link.relationship);
      const verb = link.verb || "relates to";
      // ON-7 — a link drawn from a parent's card on behalf of one of its parts says which part it came through.
      const via = (link as { via?: string }).via;
      // ON-7b — a link an explorer proposed and no person has confirmed is drawn in the proposal colour and says so.
      const proposed = link.origin === "model";
      // ON-8 — a link whose two types live on two connections is read by key, not joined: drawn dotted, and it says so.
      const crosses = link.traversal === "cross-source";
      // Arc OC-5 — what the declarations route through it: a promise kept through it, a process's stage, an impact.
      const carried = [...new Set((link.carries ?? []).map((c) => c.promise ?? c.impact ?? c.process_label))];
      const ink = !link.traversable ? "var(--amb4)" : proposed ? "var(--vio4)" : "var(--blue3)";
      return [{
        id: link.relationship, type: "link", source: link.from, target: link.to,
        sourceHandle: side(b.x - a.x, b.y - a.y), targetHandle: `${side(a.x - b.x, a.y - b.y)}-in`,
        // Only the picked type's links are named: every label at once is what made this map unreadable.
        label: on
          ? `${verb} · ${link.cardinality}${via ? ` · via ${via}` : ""}${crosses ? " · cross-source" : ""}${proposed ? " · proposed" : ""}`
            + (carried.length ? ` · carries ${carried.join(", ")}` : "")
          : undefined,
        labelShowBg: true,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: "var(--bg-0)", stroke: link.traversable ? "var(--b2)" : "var(--amb2)" },
        labelStyle: { fill: "var(--t2)", fontSize: "var(--aug-fs-xs)" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: ink },
        style: { stroke: ink,
                 strokeWidth: on ? 2 : 1.25, strokeDasharray: !link.traversable ? "5 4" : crosses ? "1 4" : undefined,
                 strokeLinecap: crosses ? "round" : undefined,
                 opacity: on || lit.links.size === 0 ? 0.95 : UNLIT },
        data: { why: link.traversable ? "" : link.why_not ?? "", crosses },
      } satisfies RFEdge];
    });
    // Two named links whose labels would land on one another — two links between the same two cards share one path
    // and so one label point — are stepped apart before they reach the canvas (`separateLabels`).
    const spots: LabelSpot[] = drawn.flatMap((edge) => {
      const [from, to] = [corner.get(edge.source), corner.get(edge.target)];
      if (typeof edge.label !== "string" || !from || !to) return [];
      const out = edge.sourceHandle;
      const into = edge.targetHandle.slice(0, 1) as keyof typeof SIDES;
      const [s, t] = [handlePoint(from, out), handlePoint(to, into)];
      const { labelX, labelY } = linkGeometry({ sourceX: s.x, sourceY: s.y, sourcePosition: SIDES[out],
                                                targetX: t.x, targetY: t.y, targetPosition: SIDES[into] });
      return [{ id: edge.id, x: labelX, y: labelY, text: edge.label, sideways: out === "l" || out === "r" }];
    });
    const shifts = separateLabels(spots, nodes.map((n) => n.position));
    setEdges(drawn.map((edge) => ({ ...edge, data: { ...edge.data, labelShift: shifts.get(edge.id) ?? 0 } })));
  }, [map.links, nodes, lit, setEdges]);

  /** One drop is one write: the cache for this device's next paint, the store for every other one. */
  const keep = useCallback((positions: Positions) => {
    setLayouts((current) => {
      const next = { ...current, [scope]: positions };
      writeCache(next);
      putMyPreference(LAYOUT_PREFERENCE, next).catch(() => { /* the cache holds it for this device */ });
      return next;
    });
  }, [scope]);

  const drop = useCallback((_e: unknown, node: RFNode) => {
    keep({ ...(layouts[scope] ?? {}), [node.id]: { x: node.position.x, y: node.position.y } });
  }, [keep, layouts, scope]);

  const reset = useCallback(() => keep({}), [keep]);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, background: "var(--bg-canvas)" }} data-testid="entity-map-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={(_e, node) => onSelect(node.id)}
        onNodeDragStop={drop}
        fitView
        fitViewOptions={{ padding: 0.14, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "var(--bg-canvas)" }}
      >
        <Controls showInteractive={false} />
        {Object.keys(moved).length > 0 && (
          <Panel position="top-right">
            <Button variant="outline" size="xs" onClick={reset}
              title="Put every card back where the map started it">
              <Icon name="refresh" size={12} /> Reset arrangement
            </Button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export { MONO };
