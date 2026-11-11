"use client";

/**
 * The Business Atlas — one connection's ontology drawn as a business: each entity a structure shaped by what it does,
 * each declared process a route with its stages in sequence, the links between them, and on each stage what the
 * measurement counted. The scene is COMPOSED (`lib/atlas/compose.ts`) from what two doors already serve; nothing is
 * laid out by hand and nothing is counted here. A select opens the shell's inspector with the figures and the reason
 * the thing is drawn where it is.
 *
 * What is not known is said: an entity no deployed package matched is drawn plain and the Atlas says so; a connection
 * with no declared process shows an empty route that says so. Position is sequence, never geography.
 */
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { InspectorFacts, useInspector, type InspectorSubject } from "@/components/shell/Inspector";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/motion";
import { compose, SHAPES, type AtlasScene, type SceneLane } from "@/lib/atlas/compose";
import { modelOf } from "@/lib/atlas/model";
import { gutterOf, routesOf } from "@/lib/atlas/route";
import { formatCount, formatTimestamp, pct } from "@/lib/format";
import { getProcesses, getTypeMap, type ProcessesAndRules, type TypeMap, type TypeMapRow } from "@/lib/objectTypes";

import { AtlasDefs, DRAW, DRAW_STAGE, Pen, projection, type Projection } from "./atlas/draw";

const W = 1100, SHAPE = 590 / 1100, STAGE_PAD = 2.2;

/** The frame the scene is drawn in: its width on the page, and how tall it is for that width. The frame is sized to
 *  the window (`styles/atlas.css`), so the whole Atlas is on screen without scrolling; the drawing is fitted to it. */
function useFrame() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: W, shape: SHAPE });
  // Measured before the first paint, then on every resize: an observer alone reports late (and not at all while the
  // page is in the background), and a drawing fitted to the wrong shape sits off its own labels.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const take = (width: number, height: number) => {
      if (width > 0 && height > 0) setSize((was) => (was.width === width && Math.abs(was.shape - height / width) < 0.002 ? was : { width, shape: height / width }));
    };
    const box = el.getBoundingClientRect();
    take(box.width, box.height);
    if (typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(([entry]) => take(entry.contentRect.width, entry.contentRect.height));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return { ref, ...size };
}
const count = (n: number | null | undefined) => (n == null ? "not counted" : formatCount(n));

interface Props {
  connectionId: string; schema?: string; title: string;
  /** The entity map, where the page around the Atlas has already read it: the Atlas then reads only the processes. */
  map?: TypeMap;
  /** Inside another page, which scrolls and pads for it. */
  embedded?: boolean;
  /** Where the page around the Atlas has an entity's own page and a process's: a click on one opens that, the page
   *  that holds everything about it, and no side panel. Without them a click opens the inspector. */
  onOpenEntity?: (objectType: string) => void;
  onOpenProcess?: (processId: string) => void;
  /** Where the page around the Atlas can make and change things: the entity picked here gets a bar of what can be done
   *  with it, in the header's own row. "link" comes with the entity it goes to — the second one clicked. */
  onAct?: (act: AtlasAct, entity: TypeMapRow, to?: TypeMapRow) => void;
}

export type AtlasAct = "change" | "link" | "rule" | "process" | "action";

export function BusinessAtlas({ connectionId, schema, title, map: given, embedded, onOpenEntity, onOpenProcess, onAct }: Props) {
  // What was read, kept with the scope it was read for: a read that lands after the connection changed is not shown.
  const scope = `${connectionId}/${schema ?? ""}`;
  const [read, setRead] = useState<{ scope: string; map?: TypeMap; declared?: ProcessesAndRules; failed?: string }>({ scope });
  const [drawn, setDrawn] = useState<"raised" | "flat">("raised");
  const [show, setShow] = useState("");
  // Where the zoom controls go: the header, which is on screen at every window size. Under the scene they fell
  // below the window on a wide one, where the scene is as tall as the page.
  const [controls, setControls] = useState<HTMLDivElement | null>(null);
  const inspector = useInspector();

  useEffect(() => {
    const put = (part: { map?: TypeMap; declared?: ProcessesAndRules; failed?: string }) =>
      setRead((was) => (was.scope === scope ? { ...was, ...part } : { scope, ...part }));
    if (!given) getTypeMap(connectionId, schema).then((map) => put({ map }))
      .catch((e: unknown) => put({ failed: e instanceof Error ? e.message : String(e) }));
    // The processes are their own door: when it fails the entities are still drawn, with an empty route.
    getProcesses(connectionId, schema).then((declared) => put({ declared }))
      .catch(() => put({ declared: { processes: [], rules: [] } }));
  }, [connectionId, schema, scope, given]);

  const { map: fetched = null, declared = null, failed = "" } = read.scope === scope ? read : {};
  const map = given ?? fetched;
  const shell = `aug-atlas${embedded ? " is-embedded" : ""}`;
  const model = useMemo(() => (map && declared ? modelOf(title, map, declared) : null), [map, declared, title]);
  const scene = useMemo(() => (model ? compose(model) : null), [model]);
  // The selection IS the inspector's subject: closing it there clears the mark here.
  const held = inspector.subject?.key ?? "";
  // Where the page around the Atlas has pages to open, a click SELECTS: the thing and its links are lit and its label
  // stays up, with a way into its page. Nothing opens until that is pressed, and no side panel opens at all.
  const pages = !!(onOpenEntity || onOpenProcess);
  const [chosen, setChosen] = useState<{ scope: string; key: string } | null>(null);
  // "Link to…" was pressed on the picked entity: the next entity clicked is the one it links to.
  const [linking, setLinking] = useState(false);
  const picked = pages ? (chosen?.scope === scope ? chosen.key : null) : held.startsWith("atlas:") ? held.slice(6) : null;

  if (failed) return <div className={shell}><EmptyState title="The Atlas could not be read">{failed}</EmptyState></div>;
  if (!scene || !map || !declared) return <div className={shell}><SkeletonRows rows={6} /></div>;
  if (!scene.structures.length && !scene.records.length && !scene.lanes.some((l) => l.stages.length)) {
    return <div className={shell}><EmptyState title="No entity to draw yet">The Atlas draws the entities of this ontology once it is built.</EmptyState></div>;
  }

  /** Open what a key names: an entity's own page, a process's, or — where there is neither — the inspector. */
  const open = (key: string) => {
    // an entity — as a structure, a mark, the entity a leg is of, or a filter — has its own page
    const entity = /^(entity|filter):/.test(key) ? map.object_types.find((t) => t.id === key.slice(key.indexOf(":") + 1)) : undefined;
    if (entity && onOpenEntity) return onOpenEntity(entity.object_type);
    // a stage, a move, what left and a promise are all the process's
    const of = /^(stage|move|exit|promise):/.test(key) ? declared.processes.find((p) => key.split(":").slice(1).join(":").startsWith(p.id)) : undefined;
    if (of && onOpenProcess) return onOpenProcess(of.id);
    const subject = subjectOf(key, scene, map, declared);
    if (subject) inspector.inspect(subject);
  };
  const rowOf = (key: string | null) => (key?.startsWith("entity:") ? map.object_types.find((t) => t.id === key.slice(7)) : undefined);
  const pickedRow = onAct ? rowOf(picked) : undefined;
  const pick = (key: string) => {
    if (!pages) { if (key) open(key); return; }
    if (linking && pickedRow) {
      const to = rowOf(key);
      setLinking(false);
      if (to && to.id !== pickedRow.id) { onAct?.("link", pickedRow, to); return; }
    }
    setChosen((was) => (!key || (was?.scope === scope && was.key === key) ? null : { scope, key }));
  };
  const plain = scene.structures.filter((s) => !s.role).length;
  const legs = scene.lanes.filter((l) => l.process);
  const shown = legs.some((l) => l.process === show) ? show : "";       // a process that is no longer there is not a view
  const look: Look = { show: shown };

  return (
    <div className={shell} data-testid="business-atlas">
      <div className="aug-atlas-frame">
        {/* one row, so the scene is the first thing on the page: what it is, which process, how it is drawn, how close */}
        <div className="aug-atlas-head">
          {pickedRow && onAct ? (
            // the picked entity's own bar, in the title's place: the row keeps its height, and nothing floats over the scene
            <div className="aug-atlas-acts" data-testid="atlas-acts">
              <Button variant="outline" size="xs" data-testid="atlas-act-open" onClick={() => onOpenEntity?.(pickedRow.object_type)} title={`Open ${pickedRow.display_name}'s page`}>
                <b>{pickedRow.display_name}</b> ›
              </Button>
              {linking ? (
                <>
                  <span className="aug-tag aug-tag-blue" data-testid="atlas-linking">Now click the entity it links to</span>
                  <Button variant="ghost" size="xs" onClick={() => setLinking(false)}>Cancel</Button>
                </>
              ) : (
                <>
                  {!pickedRow.key && pickedRow.table && (
                    <Button variant="default" size="xs" data-testid="atlas-act-key" onClick={() => onAct("change", pickedRow)} title="Nothing tells two of its rows apart yet">Set its key</Button>
                  )}
                  <Button variant="outline" size="xs" data-testid="atlas-act-link" onClick={() => setLinking(true)} title={`Link ${pickedRow.display_name} to another entity — click that one next`}>Link to…</Button>
                  <Button variant="outline" size="xs" data-testid="atlas-act-change" onClick={() => onAct("change", pickedRow)} title="Its name, what it is, its key and what names one">Change</Button>
                  <Button variant="outline" size="xs" data-testid="atlas-act-process" onClick={() => onAct("process", pickedRow)}>New process</Button>
                  <Button variant="outline" size="xs" data-testid="atlas-act-rule" onClick={() => onAct("rule", pickedRow)}>New rule</Button>
                  <Button variant="outline" size="xs" data-testid="atlas-act-action" onClick={() => onAct("action", pickedRow)}>New action</Button>
                </>
              )}
            </div>
          ) : (
            <h2 title="The journey is the declared processes, joined where a measured link joins them; each zone is a domain, beside the leg it links to. Position is sequence, not geography.">{title} — Business Atlas</h2>
          )}
          <div className="aug-atlas-tools">
            {legs.length > 1 && (
              <Segmented<string> label="Which process to show" value={shown} onChange={setShow}
                options={[{ value: "", label: "Everything" }, ...legs.map((l) => ({ value: l.process as string, label: l.name, title: `Dim everything but ${l.name} and the zones beside it` }))]} />
            )}
            <Segmented<"raised" | "flat"> label="How the Atlas is drawn" value={drawn} onChange={setDrawn}
              options={[{ value: "raised", label: <span data-testid="atlas-raised">Raised</span>, title: "Structures with height, seen from a corner" },
                { value: "flat", label: <span data-testid="atlas-flat">Flat</span>, title: "The same scene from above: exact, nothing hidden" }]} />
            <div className="aug-atlas-zoomer" ref={setControls} />
          </div>
        </div>
        <div className="aug-atlas-stage">
          <ZoomPane key={`${scope}/${drawn}`} controls={controls}>
            {drawn === "raised" ? <Scene scene={scene} picked={picked} onPick={pick} onOpen={pages ? open : undefined} look={look} /> : <Flat scene={scene} picked={picked} onPick={pick} onOpen={pages ? open : undefined} look={look} />}
          </ZoomPane>
        </div>
        {plain > 0 && (
          <div className="aug-atlas-said" data-testid="atlas-plain-said">
            {plain === scene.structures.length
              ? "Nothing says what these entities are yet, so each is drawn as the same plain block. Open an entity and choose its shape, or deploy a package that names them."
              : `${formatCount(plain)} of ${formatCount(scene.structures.length)} entities are drawn as the plain block: nobody has chosen a shape for them and no deployed package names them.`}
          </div>
        )}
        <div className="aug-atlas-legend">
          <span><i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--grn3)" }} />Measured stage</span>
          <span><i style={{ width: 7, height: 7, background: "var(--atlas-ring)" }} />Entity</span>
          <span><i style={{ width: 9, height: 9, transform: "rotate(45deg)", background: "var(--atlas-record)" }} />Record of activity</span>
          <span><i style={{ width: 18, borderTop: "3px solid var(--blue3)" }} />Measured move</span>
          <span><i style={{ width: 18, borderTop: "3px solid var(--amb3)" }} />One process hands to the next</span>
          <span><i style={{ width: 18, borderTop: "1px dotted var(--atlas-link)" }} />Link</span>
          <span><i style={{ width: 9, height: 9, border: "1px dashed var(--red3)" }} />Not connected yet</span>
          <span><i style={{ width: 9, height: 9, background: "var(--red1)", border: "1px solid var(--red3)" }} />Past a promise</span>
          {scene.filters.map((f) => (
            <Button key={f.key} variant="ghost" size="xs" className={`left-out${picked === f.key ? " is-picked" : ""}`} data-testid="atlas-filter" title="Linked from nearly everything, so it is a way of slicing the scene and not a place in it" onClick={() => pick(f.key)}>{f.name} is not drawn</Button>
          ))}
          <span className="tally">{`${formatCount(scene.zones.length)} ${scene.zones.length === 1 ? "zone" : "zones"} · ${formatCount(scene.structures.length)} ${scene.structures.length === 1 ? "structure" : "structures"}${scene.records.length ? ` · ${formatCount(scene.records.length)} ${scene.records.length === 1 ? "record" : "records"} of activity` : ""} · ${legs.length === 0 ? "no process declared" : `${formatCount(legs.length)} ${legs.length === 1 ? "process" : "processes"}`}`}</span>
        </div>
      </div>
    </div>
  );
}

const ZOOM_MIN = 1, ZOOM_MAX = 5;
/** How close the Atlas opens (the user, 2026-11-11: "keep the atlas zoomed by default on 120%"): a little closer than
 *  the whole scene, about its middle. "Fit" still shows all of it. */
const ZOOM_OPEN = 1.2;
/** How far the scene is zoomed. The scene is drawn larger — never a painted layer stretched — and a label keeps the
 *  size it is read at. */
const Zoom = createContext(1);
interface View { k: number; x: number; y: number }

/** Closer and further, and moved about: the scene under a scale the reader sets. Pinch or ⌘/Ctrl-scroll zooms about the
 *  pointer, a drag moves it, a double-click steps in, and the three controls do the same for a keyboard. A plain scroll
 *  is left to the page. Zooming changes how large the scene is drawn and nothing about what is selected. */
function ZoomPane({ children, controls }: { children: React.ReactNode; controls: HTMLElement | null }) {
  const pane = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: ZOOM_OPEN, x: 0, y: 0 });
  // It opens about its middle, which needs the pane's size: placed once it is measured, before the first paint, and
  // never again — after that where the scene sits is the reader's.
  useLayoutEffect(() => {
    const box = pane.current?.getBoundingClientRect();
    if (!box?.width) return;
    setView((was) => (was.k === ZOOM_OPEN && !was.x && !was.y ? held({ k: ZOOM_OPEN, x: (box.width * (1 - ZOOM_OPEN)) / 2, y: (box.height * (1 - ZOOM_OPEN)) / 2 }, box.width, box.height) : was));
  }, []);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);

  const zoomAbout = (factor: number, cx?: number, cy?: number) => setView((was) => {
    const box = pane.current?.getBoundingClientRect();
    const w = box?.width ?? 0, h = box?.height ?? 0;
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, was.k * factor));
    const ax = cx ?? w / 2, ay = cy ?? h / 2;
    return held({ k, x: ax - ((ax - was.x) * k) / was.k, y: ay - ((ay - was.y) * k) / was.k }, w, h);
  });

  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    // Not passive: a pinch (which a trackpad reports as Ctrl-scroll) must not also zoom the whole page.
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAbout(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const down = (e: React.PointerEvent) => { if (e.button === 0) drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;       // a click that trembles is still a click
    d.moved = true;
    const box = pane.current?.getBoundingClientRect();
    setView((was) => held({ k: was.k, x: d.x + dx, y: d.y + dy }, box?.width ?? 0, box?.height ?? 0));
  };
  const up = () => { const d = drag.current; drag.current = d?.moved ? { ...d, px: NaN } : null; };
  // A drag that ends over a structure must not also select it.
  const click = (e: React.MouseEvent) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } drag.current = null; };

  return (
    <div className="aug-atlas-pane" data-testid="atlas-pane" data-zoom={view.k.toFixed(2)}>
      <div className={`aug-atlas-view${view.k > 1 ? " is-zoomed" : ""}`} ref={pane}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onClickCapture={click}
        onDoubleClick={(e) => { const box = e.currentTarget.getBoundingClientRect(); zoomAbout(1.6, e.clientX - box.left, e.clientY - box.top); }}>
        <div className="aug-atlas-zoom" style={{ width: `${view.k * 100}%`, height: `${view.k * 100}%`, transform: `translate(${view.x}px, ${view.y}px)` }}>
          <Zoom.Provider value={view.k}>{children}</Zoom.Provider>
        </div>
      </div>
      {controls && createPortal(<>
        <Button variant="outline" size="xs" aria-label="Zoom out" title="Zoom out — or pinch, or ⌘-scroll" disabled={view.k <= ZOOM_MIN} onClick={() => zoomAbout(1 / 1.4)} data-testid="atlas-zoom-out">−</Button>
        <span className="pct" aria-live="polite">{`${Math.round(view.k * 100)}%`}</span>
        <Button variant="outline" size="xs" aria-label="Zoom in" title="Zoom in — or pinch, or ⌘-scroll; drag to move" disabled={view.k >= ZOOM_MAX} onClick={() => zoomAbout(1.4)} data-testid="atlas-zoom-in">+</Button>
        <Button variant="outline" size="xs" title="Show the whole scene" disabled={view.k === 1 && view.x === 0 && view.y === 0} onClick={() => setView({ k: 1, x: 0, y: 0 })} data-testid="atlas-zoom-fit">Fit</Button>
      </>, controls)}
    </div>
  );
}
/** The scene never leaves its frame: at any scale some edge of it stays where the frame's edge is, or beyond. */
function held(v: View, w: number, h: number): View {
  const lim = (at: number, size: number) => Math.min(0, Math.max(size * (1 - v.k), at));
  return { k: v.k, x: lim(v.x, w), y: lim(v.y, h) };
}

/** A label's two presses. The first selects what it names; once selected, the label carries a way in (›) and the next
 *  press opens the page. Where nothing can be opened, a press only selects. */
function flagsOf(picked: string | null, onPick: (key: string) => void, onOpen?: (key: string) => void) {
  return {
    flag: (key: string) => (e: React.MouseEvent) => { e.stopPropagation(); if (picked === key && onOpen) onOpen(key); else onPick(key); },
    go: (key: string) => (picked === key && onOpen ? <span className="go" data-testid="atlas-go" title="Open its page">›</span> : null),
  };
}
/** How the reader asked to see it: one process, or all of them. */
interface Look { show: string }
type Pt = [number, number];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
/** Where a move is said: a third of the way along it, so the label is clear of the next stage's. */
const early = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3];
/** Across a leg, on the side the journey turns toward: forward of a leg along u, back from one along v. */
const across = (lane: SceneLane, q: Pt, t: number): Pt => (lane.along === "u" ? [q[0], q[1] + t] : [q[0] - t, q[1]]);
const ahead = (lane: SceneLane, q: Pt, t: number): Pt => (lane.along === "u" ? [q[0] + t, q[1]] : [q[0], q[1] + t]);
const partsSaid = (n: number) => `+${formatCount(n)} ${n === 1 ? "part" : "parts"}`;
const daysSaid = (d: number) => `median ${formatCount(d)} ${d === 1 ? "day" : "days"}`;
/** A stage's label lies on the ground beside it, on the side its zones stand: over the stage it would hide what is behind. */
const stageAt = (lane: SceneLane, st: { u: number; v: number }): Pt => across(lane, [st.u, st.v], -2.0);
/** How far across a leg a move is said, and where what leaves is said: behind its pad, clear of the first move. */
const MOVE_OFF = 2.5;
/** The entity a journey is of is said at its start, on the side its zones stand, reading toward the start. */
const goesAt = (lane: SceneLane): Pt => across(lane, ahead(lane, lane.start, 0.6), -1.3);
const exitAt = (lane: SceneLane): Pt => across(lane, ahead(lane, lane.exit!.to, -1.3), 0.2);
const moveSaid = (m: SceneLane["moves"][number]) => `${m.count === null ? "" : `${formatCount(m.count)} moved`}${m.count !== null && m.days !== null ? " · " : ""}${m.days === null ? "" : daysSaid(m.days)}`;

/** The scene: the drawing under, the labels over it as ordinary controls a keyboard reaches. */
function Scene({ scene, picked, onPick, onOpen, look }: { scene: AtlasScene; picked: string | null; onPick: (key: string) => void; onOpen?: (key: string) => void; look: Look }) {
  const { flag, go } = flagsOf(picked, onPick, onOpen);
  // the ground is drawn with room beyond its two far edges for the tracks the links run along
  const { ref: world, width, shape } = useFrame();
  const H = Math.round(W * shape);
  const at = useMemo<Projection>(() => { const g = gutterOf(scene), on = projection({ u: scene.extent.u + g, v: scene.extent.v + g }, W, H); return (u, v, z = 0) => on(u + g, v + g, z); }, [scene, H]);
  const where = (q: Pt, z = 0): React.CSSProperties => { const [x, y] = at(q[0], q[1], z); return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }; };
  // The drawing answers a pointer; the labels over it are the controls a keyboard and a screen reader reach.
  const act = (key: string) => ({ onClick: (e: React.MouseEvent) => { e.stopPropagation(); onPick(key); } });
  const pickedEntity = picked?.startsWith("entity:") ? picked.slice(7) : null;
  const zoneLeg = useMemo(() => new Map(scene.zones.map((z) => [z.key, z.leg])), [scene]);
  const dim = (of: string | null | undefined) => (look.show && of !== look.show ? " is-dim" : "");
  const ground = useMemo(() => groundOf(scene, at), [scene, at]);
  const routes = useMemo(() => routesOf(scene), [scene]);
  const last = scene.lanes[scene.lanes.length - 1];
  /** A joint is said just past the corner it turns, on the outside of the turn, clear of both legs' stages. */
  const jointAt = (j: AtlasScene["joints"][number]): Pt => { const i = scene.joints.indexOf(j), was = scene.lanes[i]; return was ? across(was, ahead(was, j.from, 2.6), -0.4) : mid(j.from, j.to); };
  const k = useContext(Zoom);
  // Nothing stands over the scene at rest. A name, a stage, a count and a time are WRITTEN on the ground; the label
  // that says the rest — parts, a promise past, the link a joint is — is a tip, shown while the pointer is on the
  // thing or on its mark, and to a keyboard while the mark has focus.
  const [over, setOver] = useState<string | null>(null);
  const hover = (key: string) => ({ onMouseEnter: () => setOver(key), onMouseLeave: () => setOver((was) => (was === key ? null : was)) });
  const tip = (key: string) => (over === key ? " is-over" : "");
  void width; void k;
  /** A name written on the ground, along the near edge of what it names. */
  const written = (key: string, q: Pt, text: string, cls: string, along: "u" | "v" = "u", anchor?: "end") => {
    const [x, y] = at(q[0], q[1]), s = (at(1, 0)[0] - at(0, 0)[0]) / 22;
    // along u it reads down the ground to the right; along v it reads up the ground to the right, so it is never upside down
    const m = along === "u" ? [s, s / 2, -s, s / 2] : [s, -s / 2, s, s / 2];
    return <text key={key} className={`aug-atlas-written ${cls}`} textAnchor={anchor} transform={`matrix(${m.map((n) => n.toFixed(3)).join(",")},${x.toFixed(1)},${y.toFixed(1)})`}>{text}</text>;
  };
  /** A process's name, written on its own bed before its first stage: the composer leaves it the room. */
  const routeName = (lane: SceneLane) => (lane.along === "u"
    ? written(`route:${lane.process}`, [lane.start[0] + (lane === scene.lanes[0] ? 1.2 : 0.9), lane.start[1] + 0.24], lane.name, "is-route")
    : written(`route:${lane.process}`, [lane.start[0] - 0.85, lane.start[1] + 1.0], lane.name, "is-route", "v", "end"));
  const raised = [
    ...scene.structures.map((s) => ({ depth: s.u + s.v + (s.w + s.d) / 2, node: (() => {
      const pen = new Pen(at);
      pen.pad(s.u, s.v, s.w, s.d, s.measured ? "entity" : "expected");
      DRAW[s.shape](pen, s.u, s.v, s.w, s.d, s.count);
      return <g key={s.key} className={`aug-atlas-st${s.measured ? "" : " is-expected"}${s.loose ? " is-loose" : ""}${picked === s.key ? " is-picked" : ""}${dim(zoneLeg.get(s.zone))}`} data-name={s.name} data-shape={s.shape} {...act(s.key)} {...hover(s.key)}>{pen.out}</g>;
    })() })),
    ...scene.lanes.flatMap((lane) => lane.stages.map((st) => ({ depth: st.u + st.v, node: (() => {
      const pen = new Pen(at), u = st.u - STAGE_PAD / 2, v = st.v - STAGE_PAD / 2;
      pen.pad(u, v, STAGE_PAD, STAGE_PAD, !lane.measured ? "expected" : st.past ? "past" : "stage");
      DRAW_STAGE[st.shape](pen, u, v);
      return <g key={st.key} className={`aug-atlas-st${lane.measured ? "" : " is-expected"}${picked === st.key ? " is-picked" : ""}${dim(lane.process)}`} data-stage={st.label} {...act(st.key)} {...hover(st.key)}>{pen.out}</g>;
    })() }))),
  ].sort((p, q) => p.depth - q.depth).map((x) => x.node);

  return (
    <div className="aug-atlas-world" ref={world}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onClick={() => onPick("")} aria-label={`The business of ${scene.title}: ${[...scene.lanes.filter((l) => l.process).map((l) => l.name), ...scene.structures.map((s) => s.name)].join(", ")}.`}>
        <AtlasDefs />
        {ground}
        {scene.zones.map((z) => {
          const pen = new Pen(at), aside = z.leg === null && scene.lanes.some((l) => l.process);
          pen.poly([at(z.u, z.v + z.d), at(z.u + z.w, z.v + z.d), at(z.u + z.w, z.v + z.d, -5), at(z.u, z.v + z.d, -5)], "var(--atlas-pad-side)");
          pen.poly([at(z.u + z.w, z.v), at(z.u + z.w, z.v + z.d), at(z.u + z.w, z.v + z.d, -5), at(z.u + z.w, z.v, -5)], "var(--atlas-pad-under)");
          pen.poly([at(z.u, z.v), at(z.u + z.w, z.v), at(z.u + z.w, z.v + z.d), at(z.u, z.v + z.d)], "var(--atlas-lane)", { className: "aug-atlas-zone-plate", stroke: "var(--atlas-lane-line)", strokeWidth: 1.2, fillOpacity: aside ? 0.5 : 0.85, strokeDasharray: aside ? "7 6" : undefined });
          return <g key={z.key} className={`aug-atlas-zone${aside ? " is-aside" : ""}${picked === z.key ? " is-picked" : ""}${dim(z.leg)}`} data-zone={z.name} {...act(z.key)}>{pen.out}{written("name", [z.u + 0.45, z.v + z.d - 0.35], z.name.toUpperCase(), "is-zone")}</g>;
        })}
        {scene.structures.map((s) => <g key={`w:${s.key}`} className={dim(zoneLeg.get(s.zone)).trim()}>{written(s.key, [s.u - 0.1, s.v + s.d + 0.98], s.name, "is-entity")}</g>)}
        {scene.lanes.map((lane, i) => <g key={lane.process ?? `none-${i}`} className={dim(lane.process).trim()} data-route={lane.process ? lane.name : undefined}>{laneOf(lane, at)}{lane.process && routeName(lane)}</g>)}
        {scene.lanes[0]?.process && (() => { const l = scene.lanes[0], a0 = ahead(l, l.start, 0.25), head = ahead(l, l.start, 0.9);
          return <polygon className="aug-atlas-cap is-start" points={[at(...across(l, a0, -0.38)), at(...head), at(...across(l, a0, 0.38))].map((q) => q.join(",")).join(" ")} {...hover(`goes:${l.process}`)} {...act(`entity:${l.entity}`)} />; })()}
        {last?.process && (() => { const c = ahead(last, last.end, -0.55);
          return <polygon className="aug-atlas-cap is-end" points={[at(c[0] - 0.3, c[1] - 0.3), at(c[0] + 0.3, c[1] - 0.3), at(c[0] + 0.3, c[1] + 0.3), at(c[0] - 0.3, c[1] + 0.3)].map((q) => q.join(",")).join(" ")} />; })()}
        {scene.records.map((r) => {
          const p = at(r.u, r.v), g = 5.5;
          return <polygon key={r.key} className={`aug-atlas-record${picked === r.key ? " is-picked" : ""}${dim(zoneLeg.get(r.zone))}`} data-name={r.name} data-record=""
            points={`${p[0]},${p[1] - g} ${p[0] + g * 1.7},${p[1]} ${p[0]},${p[1] + g} ${p[0] - g * 1.7},${p[1]}`} {...act(r.key)} {...hover(r.key)} />;
        })}
        {scene.lanes.flatMap((lane) => lane.moves.map((m) => (
          <Arrow key={m.key} tail={at(...m.a)} tip={at(...m.b)} label={`${m.from} to ${m.to}`}
            className={`aug-atlas-move${lane.measured ? "" : " is-expected"}${picked === `move:${m.key}` ? " is-picked" : ""}${dim(lane.process)}`} {...(lane.measured ? act(`move:${m.key}`) : {})} {...hover(`move:${m.key}`)} />
        )))}
        {/* past its last stage a leg runs on to where the journey turns: drawn as a way on, not as a counted move */}
        {scene.lanes.slice(0, -1).flatMap((lane) => { const end = lane.stages[lane.stages.length - 1]; return end ? [
          <Arrow key={`on:${lane.process}`} tail={at(...ahead(lane, [end.u, end.v], STAGE_PAD / 2 + 0.15))} tip={at(...ahead(lane, lane.end, -0.2))} label="on to the next process" className={`aug-atlas-move is-expected${dim(lane.process)}`} />] : []; })}
        {scene.joints.map((j) => (
          <Arrow key={j.key} tail={at(...j.from)} tip={at(...j.to)} label={`${j.after} ${j.verb || "follows"} ${j.before}`}
            className={`aug-atlas-move is-joint${j.linked ? "" : " is-expected"}${picked === j.key ? " is-picked" : ""}`} {...act(j.key)} {...hover(j.key)} />
        ))}
        {scene.lanes.flatMap((lane) => (lane.exit ? [
          <Arrow key={lane.exit.key} tail={at(...lane.exit.from)} tip={at(...across(lane, lane.exit.to, -0.85))} label="leaves the process"
            className={`aug-atlas-move is-exit${picked === lane.exit.key ? " is-picked" : ""}${dim(lane.process)}`} {...act(lane.exit.key)} {...hover(lane.exit.key)} />,
          (() => { const pen = new Pen(at), [u, v] = [lane.exit.to[0] - 1, lane.exit.to[1] - 0.8];
            pen.pad(u, v, 2, 1.6, "expected");
            pen.line(at(u + 0.5, v + 0.4), at(u + 1.5, v + 1.2), "var(--t3)", { strokeWidth: 2, strokeLinecap: "round" });
            pen.line(at(u + 1.5, v + 0.4), at(u + 0.5, v + 1.2), "var(--t3)", { strokeWidth: 2, strokeLinecap: "round" });
            return <g key={`${lane.exit.key}:pad`} className={`aug-atlas-st${picked === lane.exit.key ? " is-picked" : ""}${dim(lane.process)}`} {...act(lane.exit.key)} {...hover(lane.exit.key)}>{pen.out}</g>; })(),
        ] : []))}
        {/* what the journey says, written on the ground beside it: each stage and how many reached it, a promise past,
            how long a move took, what left, the entity it is of and the entity each later leg is of */}
        {scene.lanes.filter((l) => l.process).map((lane, i) => {
          const u = lane.along === "u", f = lane.stages[0];
          return (
            <g key={`said:${lane.process}`} className={dim(lane.process).trim()} data-said={lane.name}>
              {lane.stages.map((st) => { const text = `${String(st.index + 1).padStart(2, "0")}  ${st.label}${st.reached === null ? "" : `  ${formatCount(st.reached)}`}`;
                // in front of the stage, where nothing that stands can hide it — and clear of the spur what leaves takes
                const from = st.u + (st.index === 0 && lane.exit ? 0.6 : -1.0);
                return u ? written(st.key, [from, st.v + 1.95], text, "is-stage") : written(st.key, [st.u + 1.75, st.v + 1.0], text, "is-stage", "v"); })}
              {lane.stages.filter((st) => st.past).map((st) => (u
                ? written(`${st.key}:past`, [st.u - 1.0, st.v + 2.85], `${formatCount(st.past!.count)} overdue`, "is-past")
                : written(`${st.key}:past`, [st.u + 2.65, st.v + 1.0], `${formatCount(st.past!.count)} overdue`, "is-past", "v")))}
              {lane.moves.filter((m) => m.days !== null).map((m) => (u
                ? written(`took:${m.key}`, [m.a[0] + 0.5, m.a[1] + 1.1], daysSaid(m.days!), "is-said")
                : written(`took:${m.key}`, [m.a[0] - 1.0, m.b[1] - 0.15], daysSaid(m.days!), "is-said", "v")))}
              {lane.exit && written(`left:${lane.exit.key}`, u ? [lane.exit.to[0] + 1.3, lane.exit.to[1] + 0.4] : [lane.exit.to[0] - 1.0, lane.exit.to[1] + 1.5], `${count(lane.exit.count)} ${lane.exit.label}`, "is-said")}
              {i === 0 && f && written(`goes:${lane.process}`, u ? [lane.start[0], lane.start[1] - 0.9] : [lane.start[0] + 1.75, lane.start[1] + 0.2],
                `${lane.entityName}${lane.parts.length ? `  ${partsSaid(lane.parts.length)}` : ""}`, "is-said", lane.along)}
            </g>
          );
        })}
        {scene.joints.map((j, i) => { const next = scene.lanes[i + 1], text = j.linked ? j.after : `no link to ${j.before}`;
          return next ? <g key={`said:${j.key}`}>{next.along === "v"
            ? written(j.key, [j.from[0] + 2.65, j.from[1] + 4.3], text, j.linked ? "is-said" : "is-past", "v")
            : written(j.key, [j.from[0] + 0.6, j.from[1] - 2.2], text, j.linked ? "is-said" : "is-past")}</g> : null; })}
        {/* links lie flat: out to a far edge of the plane, along a track of their own outside it, and back in */}
        {scene.links.map((l) => (
          <polyline key={`${l.a}>${l.b}:${l.verb}`} className={`aug-atlas-link${pickedEntity === l.a || pickedEntity === l.b ? " is-picked" : ""}`} data-link={`${l.a}>${l.b}`}
            points={(routes.get(l) ?? []).map((q) => at(q[0], q[1]).map((n) => n.toFixed(1)).join(",")).join(" ")} />
        ))}
        {/* what stands, back to front */}
        {raised}
      </svg>

      {scene.structures.map((s) => {
        const [x, y] = at(s.u + s.w / 2, s.v + s.d / 2, s.h + 6);
        return (
          <div key={s.key} className={`aug-atlas-mark is-tucked${picked === s.key ? " is-picked" : ""}${over === s.key ? " is-over" : ""}${s.loose ? " is-loose" : ""}${dim(zoneLeg.get(s.zone))}`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
            <Button variant="ghost" size="xs" className="aug-atlas-board" aria-label={s.name} onClick={flag(s.key)}>
              <span className={`dot ${s.measured ? "is-entity" : "is-expected"}`} /><span>{s.name}</span>{s.count !== null && <span className="n"><b>{formatCount(s.count)}</b></span>}{s.parts.length > 0 && <span className="n" data-testid="atlas-parts">{partsSaid(s.parts.length)}</span>}
            {go(s.key)}</Button>
            <span className="aug-atlas-stem" />
          </div>
        );
      })}
      {scene.records.map((r) => (
        <div key={r.key} className={`aug-atlas-mark is-record is-tucked${picked === r.key ? " is-picked" : ""}${over === r.key ? " is-over" : ""}${dim(zoneLeg.get(r.zone))}`} style={(() => { const [x, y] = at(r.u, r.v, 0); return { left: `${(x / W) * 100}%`, top: `${((y - 6) / H) * 100}%` }; })()}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" aria-label={r.name} onClick={flag(r.key)}>
            <span className="dot is-record" /><span className="n"><b>{r.name}</b>{r.count !== null && ` ${formatCount(r.count)}`}</span>
          {go(r.key)}</Button>
          <span className="aug-atlas-stem" />
        </div>
      ))}
      {scene.lanes.flatMap((lane) => lane.stages.map((st) => (
        <div key={st.key} className={`aug-atlas-mark is-stage is-tucked${picked === st.key ? " is-picked" : ""}${tip(st.key)}${dim(lane.process)}`} style={where([st.u, st.v], 31)}>
          <Button variant="ghost" size="xs" className="aug-atlas-board" onClick={flag(st.key)}>
            {/* the journey says it starts on its first stage and ends on its last */}
            {st.index === 0 && lane === scene.lanes[0] && <span className="n route" data-testid="atlas-route-start"><span className="cap is-start" />starts</span>}
            <span className="ix">{String(st.index + 1).padStart(2, "0")}</span><span className={`dot${lane.measured ? "" : " is-expected"}`} /><span>{st.label}</span>
            {st.reached !== null && <span className="n"><b>{formatCount(st.reached)}</b></span>}
            {lane === last && st.index === lane.stages.length - 1 && st.index > 0 && <span className="n route"><span className="cap is-end" />ends</span>}
          {go(st.key)}</Button>
          {st.past && <Button variant="destructive" size="xs" className="aug-atlas-board is-past" onClick={flag(st.past!.key)}>{`${formatCount(st.past.count)} overdue`}{go(st.past!.key)}</Button>}
          <span className="aug-atlas-stem" />
        </div>
      )))}
      {scene.lanes.flatMap((lane) => lane.moves.filter((m) => m.count !== null || m.days !== null).map((m) => (
        <div key={m.key} className={`aug-atlas-mark is-on-ground is-tip${tip(`move:${m.key}`)}${picked === `move:${m.key}` ? " is-picked" : ""}${dim(lane.process)}`} style={where(across(lane, mid(m.a, m.b), 0.2))}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" onClick={flag(`move:${m.key}`)}><span className="n">{m.count !== null && <><b>{formatCount(m.count)}</b> moved</>}{m.count !== null && m.days !== null && " · "}{m.days !== null && daysSaid(m.days)}</span>{go(`move:${m.key}`)}</Button>
        </div>
      )))}
      {scene.lanes.flatMap((lane) => (lane.exit ? [
        <div key={lane.exit.key} className={`aug-atlas-mark is-on-ground is-tip${tip(lane.exit.key)}${picked === lane.exit.key ? " is-picked" : ""}${dim(lane.process)}`} style={where(lane.exit.to)}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" onClick={flag(lane.exit!.key)}><span className="n"><b>{count(lane.exit.count)}</b> left · {lane.exit.label}</span>{go(lane.exit!.key)}</Button>
        </div>] : []))}
      {scene.joints.map((j) => (
        <div key={j.key} className={`aug-atlas-mark is-on-ground is-tip${tip(j.key)}${picked === j.key || picked === `entity:${j.entity}` ? " is-picked" : ""}`} style={where(mid(j.from, j.to))}>
          <Button variant="ghost" size="xs" className={`aug-atlas-board is-quiet${j.linked ? "" : " is-gap"}`} data-testid="atlas-joint" onClick={flag(j.linked ? `entity:${j.entity}` : j.key)}>
            <span className="n">{j.linked ? <>{j.count !== null && <b>{formatCount(j.count)}</b>} <b>{j.after}</b>{j.parts.length > 0 && ` ${partsSaid(j.parts.length)}`} · {j.verb} {j.before}</> : <>no link joins <b>{j.after}</b> to <b>{j.before}</b></>}</span>
          {go(j.linked ? `entity:${j.entity}` : j.key)}</Button>
        </div>
      ))}
      {scene.lanes.filter((l, i) => l.process && i === 0).map((lane) => (
        <div key={`goes:${lane.process}`} className={`aug-atlas-mark is-on-ground is-tip${tip(`goes:${lane.process}`)}${picked === `entity:${lane.entity}` ? " is-picked" : ""}${dim(lane.process)}`} style={where(lane.start)}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" data-testid="atlas-route-entity" onClick={flag(`entity:${lane.entity}`)}>
            <span className="n"><b>{lane.entityName}</b>{lane.parts.length > 0 && ` ${partsSaid(lane.parts.length)}`}</span>
          {go(`entity:${lane.entity}`)}</Button>
        </div>
      ))}
      {scene.lanes.filter((l) => !l.process).map((lane) => (
        <div key="none" className="aug-atlas-mark is-on-ground" style={where(mid(lane.start, lane.end))} data-testid="atlas-no-process">
          <span className="aug-atlas-board is-quiet">No process is declared on this ontology</span>
        </div>
      ))}
    </div>
  );
}

/** The same scene from above. Every zone is its plot, every structure its footprint, every leg a straight band; the
 *  labels are the same controls, so what is selected, and what the inspector says of it, does not depend on how the
 *  Atlas is drawn. */
function Flat({ scene, picked, onPick, onOpen, look }: { scene: AtlasScene; picked: string | null; onPick: (key: string) => void; onOpen?: (key: string) => void; look: Look }) {
  const { flag, go } = flagsOf(picked, onPick, onOpen);
  // the plan is drawn with the same margin beyond its two far edges, for the tracks the links run along
  const G = gutterOf(scene), U = scene.extent.u + G, V = scene.extent.v + G;
  const box = (u: number, v: number, w: number, d: number): React.CSSProperties => ({ left: `${((u + G) / U) * 100}%`, top: `${((v + G) / V) * 100}%`, width: `${(w / U) * 100}%`, height: `${(d / V) * 100}%` });
  const point = (q: Pt): React.CSSProperties => ({ left: `${((q[0] + G) / U) * 100}%`, top: `${((q[1] + G) / V) * 100}%` });
  const routes = routesOf(scene);
  const frame = useFrame();
  const pickedEntity = picked?.startsWith("entity:") ? picked.slice(7) : null;
  const zoneLeg = new Map(scene.zones.map((z) => [z.key, z.leg]));
  const dim = (of: string | null | undefined) => (look.show && of !== look.show ? " is-dim" : "");
  const last = scene.lanes[scene.lanes.length - 1];
  const arrow = (key: string, a: Pt, b: Pt, cls: string, on?: () => void) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
    const base: Pt = [b[0] - 0.42 * dx, b[1] - 0.42 * dy];
    return (
      <g key={key} className={`aug-atlas-move ${cls}`} onClick={on}>
        <path className="hit" d={`M${a} L${b}`} /><path className="ln" d={`M${a} L${base}`} />
        <polygon className="hd" points={`${b[0]},${b[1]} ${base[0] - 0.2 * dy},${base[1] + 0.2 * dx} ${base[0] + 0.2 * dy},${base[1] - 0.2 * dx}`} />
      </g>
    );
  };
  return (
    <div className="aug-atlas-world aug-atlas-flat-frame" ref={frame.ref}>
    {/* the same frame as the raised drawing, so switching between them moves nothing on the page: the plan is fitted inside */}
    <div className="aug-atlas-flat" style={{ aspectRatio: `${U} / ${V}`, ...(U / V > 1 / frame.shape ? { width: "100%" } : { height: "100%" }) }} data-testid="atlas-flat-scene">
      {scene.zones.map((z) => (
        <Button key={z.key} variant="ghost" size="xs" className={`aug-atlas-flat-zone${z.leg === null && scene.lanes.some((l) => l.process) ? " is-aside" : ""}${picked === z.key ? " is-picked" : ""}${dim(z.leg)}`} style={box(z.u, z.v, z.w, z.d)} data-zone={z.name} onClick={() => onPick(z.key)}>
          <span className="name">{z.name}</span>
        </Button>
      ))}
      {scene.lanes.map((lane, i) => (
        <div key={lane.process ?? `none-${i}`} className={`aug-atlas-flat-lane${lane.process && lane.measured ? "" : " is-expected"}${dim(lane.process)}`}
          style={lane.along === "u" ? box(lane.start[0], lane.start[1] - 0.6, lane.end[0] - lane.start[0] + 0.6, 1.2) : box(lane.start[0] - 0.6, lane.start[1] - 0.6, 1.2, lane.end[1] - lane.start[1] + 0.6)} data-route={lane.process ? lane.name : undefined}>
          {lane.process && <span className={`name is-along-${lane.along}`}>{lane.name}</span>}
        </div>
      ))}
      {scene.structures.map((s) => (
        <div key={s.key} className={`aug-atlas-flat-plot${s.measured ? "" : " is-expected"}${s.loose ? " is-loose" : ""}${picked === s.key ? " is-picked" : ""}${dim(zoneLeg.get(s.zone))}`} style={box(s.u, s.v, s.w, s.d)} data-name={s.name} data-shape={s.shape}>
          <span className="name">{s.name}</span>
          <span className="shape">{SHAPES[s.shape].says}</span>
        </div>
      ))}
      <svg viewBox={`${-G} ${-G} ${U} ${V}`} preserveAspectRatio="none" aria-hidden>
        {scene.links.map((l) => (
          <polyline key={`${l.a}>${l.b}:${l.verb}`} className={`aug-atlas-link${pickedEntity === l.a || pickedEntity === l.b ? " is-picked" : ""}`} data-link={`${l.a}>${l.b}`}
            points={(routes.get(l) ?? []).map((q) => q.join(",")).join(" ")} />
        ))}
        {scene.lanes.flatMap((lane) => lane.moves.map((m) => arrow(m.key, m.a, m.b, `${lane.measured ? "" : "is-expected"}${picked === `move:${m.key}` ? " is-picked" : ""}${dim(lane.process)}`, lane.measured ? () => onPick(`move:${m.key}`) : undefined)))}
        {scene.joints.map((j) => arrow(j.key, j.from, j.to, `is-joint${j.linked ? "" : " is-expected"}${picked === j.key ? " is-picked" : ""}`, () => onPick(j.key)))}
        {scene.lanes.flatMap((lane) => (lane.exit ? [arrow(lane.exit.key, lane.exit.from, across(lane, lane.exit.to, -0.6), `is-exit${picked === lane.exit.key ? " is-picked" : ""}${dim(lane.process)}`, () => onPick(lane.exit!.key))] : []))}
        {scene.lanes[0]?.process && (() => { const l = scene.lanes[0], a0 = ahead(l, l.start, 0.25), tip = ahead(l, l.start, 0.9);
          return <polygon className="aug-atlas-cap is-start" points={[across(l, a0, -0.38), tip, across(l, a0, 0.38)].map((q) => q.join(",")).join(" ")} />; })()}
        {last?.process && (() => { const c = ahead(last, last.end, -0.55); return <rect className="aug-atlas-cap is-end" x={c[0] - 0.3} y={c[1] - 0.3} width={0.6} height={0.6} />; })()}
      </svg>
      {scene.structures.map((s) => (
        <div key={s.key} className={`aug-atlas-mark is-on-ground is-tucked${picked === s.key ? " is-picked" : ""}${dim(zoneLeg.get(s.zone))}`} style={point([s.u + s.w / 2, s.v + s.d / 2])}>
          <Button variant="ghost" size="xs" className="aug-atlas-board" aria-label={s.name} onClick={flag(s.key)}>
            <span className={`dot ${s.measured ? "is-entity" : "is-expected"}`} /><span>{s.name}</span>{s.count !== null && <span className="n"><b>{formatCount(s.count)}</b></span>}{s.parts.length > 0 && <span className="n" data-testid="atlas-parts">{partsSaid(s.parts.length)}</span>}
          {go(s.key)}</Button>
        </div>
      ))}
      {scene.records.map((r) => (
        <div key={r.key} className={`aug-atlas-mark is-on-ground is-record${picked === r.key ? " is-picked" : ""} is-tucked${dim(zoneLeg.get(r.zone))}`} style={point([r.u, r.v])}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" aria-label={r.name} onClick={flag(r.key)}>
            <span className="dot is-record" /><span className="n"><b>{r.name}</b>{r.count !== null && ` ${formatCount(r.count)}`}</span>
          {go(r.key)}</Button>
        </div>
      ))}
      {scene.lanes.flatMap((lane) => lane.stages.map((st) => (
        <div key={st.key} className={`aug-atlas-mark is-on-ground is-stage${picked === st.key ? " is-picked" : ""}${dim(lane.process)}`} style={point(across(lane, [st.u, st.v], -1.5))}>
          <Button variant="ghost" size="xs" className="aug-atlas-board" onClick={flag(st.key)}>
            {st.index === 0 && lane === scene.lanes[0] && <span className="n route" data-testid="atlas-route-start"><span className="cap is-start" />starts</span>}
            <span className="ix">{String(st.index + 1).padStart(2, "0")}</span><span className={`dot${lane.measured ? "" : " is-expected"}`} />{st.label}
            {st.reached !== null && <span className="n"><b>{formatCount(st.reached)}</b></span>}
            {lane === last && st.index === lane.stages.length - 1 && st.index > 0 && <span className="n route"><span className="cap is-end" />ends</span>}
          {go(st.key)}</Button>
          {st.past && <Button variant="destructive" size="xs" className="aug-atlas-board is-past" onClick={flag(st.past!.key)}>{`${formatCount(st.past.count)} overdue`}{go(st.past!.key)}</Button>}
        </div>
      )))}
      {scene.lanes.flatMap((lane) => lane.moves.filter((m) => m.count !== null || m.days !== null).map((m) => (
        <div key={m.key} className={`aug-atlas-mark is-on-ground${dim(lane.process)}`} style={point(across(lane, mid(m.a, m.b), 1.15))}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" onClick={flag(`move:${m.key}`)}><span className="n">{m.count !== null && <><b>{formatCount(m.count)}</b> moved</>}{m.count !== null && m.days !== null && " · "}{m.days !== null && daysSaid(m.days)}</span>{go(`move:${m.key}`)}</Button>
        </div>
      )))}
      {scene.lanes.flatMap((lane) => (lane.exit ? [
        <div key={lane.exit.key} className={`aug-atlas-mark is-on-ground${dim(lane.process)}`} style={point(lane.exit.to)}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" onClick={flag(lane.exit!.key)}><span className="n"><b>{count(lane.exit.count)}</b> left · {lane.exit.label}</span>{go(lane.exit!.key)}</Button>
        </div>] : []))}
      {scene.joints.map((j) => (
        <div key={j.key} className="aug-atlas-mark is-on-ground" style={point(mid(j.from, j.to))}>
          <Button variant="ghost" size="xs" className={`aug-atlas-board is-quiet${j.linked ? "" : " is-gap"}`} data-testid="atlas-joint" onClick={flag(j.linked ? `entity:${j.entity}` : j.key)}>
            <span className="n">{j.linked ? <>{j.count !== null && <b>{formatCount(j.count)}</b>} <b>{j.after}</b>{j.parts.length > 0 && ` ${partsSaid(j.parts.length)}`} · {j.verb} {j.before}</> : <>no link joins <b>{j.after}</b> to <b>{j.before}</b></>}</span>
          {go(j.linked ? `entity:${j.entity}` : j.key)}</Button>
        </div>
      ))}
      {scene.lanes.filter((l, i) => l.process && i === 0).map((lane) => (
        <div key={`goes:${lane.process}`} className={`aug-atlas-mark is-on-ground${dim(lane.process)}`} style={point(across(lane, ahead(lane, lane.start, 0.9), 1.3))}>
          <Button variant="ghost" size="xs" className="aug-atlas-board is-quiet" data-testid="atlas-route-entity" onClick={flag(`entity:${lane.entity}`)}>
            <span className="n"><b>{lane.entityName}</b>{lane.parts.length > 0 && ` ${partsSaid(lane.parts.length)}`}</span>
          {go(`entity:${lane.entity}`)}</Button>
        </div>
      ))}
      {scene.lanes.filter((l) => !l.process).map((lane) => (
        <div key="none" className="aug-atlas-mark is-on-ground" style={point(mid(lane.start, lane.end))} data-testid="atlas-no-process">
          <span className="aug-atlas-board is-quiet">No process is declared on this ontology</span>
        </div>
      ))}
    </div>
    </div>
  );
}

function Arrow({ tail: from, tip: to, className, label, ...rest }: { tail: [number, number]; tip: [number, number]; className: string; label: string } & React.SVGProps<SVGGElement>) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]), L = 11, Wd = 5.5;
  const base: [number, number] = [to[0] - L * Math.cos(angle), to[1] - L * Math.sin(angle)];
  const head = [to, [base[0] - Wd * Math.sin(angle), base[1] + Wd * Math.cos(angle)], [base[0] + Wd * Math.sin(angle), base[1] - Wd * Math.cos(angle)]];
  return (
    <g className={className} data-name={label} {...rest}>
      <path className="hit" d={`M${from} L${to}`} /><path className="ln" d={`M${from} L${base}`} />
      <polygon className="hd" points={head.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} />
    </g>
  );
}

/** The ground and its grid. */
function groundOf(scene: AtlasScene, at: Projection): React.ReactNode[] {
  const pen = new Pen(at), { u: U, v: V } = scene.extent;
  const top = [at(0, 0), at(U, 0), at(U, V), at(0, V)];
  pen.poly([at(0, V), at(U, V), at(U, V, -16), at(0, V, -16)], "var(--atlas-ground-edge)");
  pen.poly([at(U, 0), at(U, V), at(U, V, -16), at(U, 0, -16)], "var(--atlas-ground-under)");
  pen.poly(top, "url(#atlas-ground)", { stroke: "var(--atlas-ground-line)", strokeWidth: 1 });
  pen.poly(top, "url(#atlas-glow)");
  for (let i = 1; i < U; i++) pen.line(at(i, 0), at(i, V), "var(--atlas-grid)");
  for (let j = 1; j < V; j++) pen.line(at(0, j), at(U, j), "var(--atlas-grid)");
  return pen.out;
}
/** The bed a leg of the journey runs along, and the spur what leaves it takes. */
function laneOf(lane: SceneLane, at: Projection): React.ReactNode[] {
  const pen = new Pen(at), firm = lane.process !== null && lane.measured;
  const rect = (u: number, v: number, w: number, d: number) => [at(u, v), at(u + w, v), at(u + w, v + d), at(u, v + d)];
  const bed = lane.along === "u" ? rect(lane.start[0], lane.start[1] - 0.6, lane.end[0] - lane.start[0] + 0.6, 1.2) : rect(lane.start[0] - 0.6, lane.start[1] - 0.6, 1.2, lane.end[1] - lane.start[1] + 0.6);
  pen.poly(bed, "var(--atlas-lane)", { stroke: "var(--atlas-lane-line)", strokeWidth: 1, ...(firm ? {} : { strokeDasharray: "6 6", fillOpacity: 0.55 }) });
  if (lane.exit) {
    const f = lane.exit.from, t = lane.exit.to;
    pen.poly(lane.along === "u" ? rect(f[0] - 0.3, f[1], 0.6, t[1] - f[1] - 0.8) : rect(t[0] + 0.8, f[1] - 0.3, f[0] - t[0] - 0.8, 0.6), "var(--atlas-lane)", { stroke: "var(--atlas-lane-line)", strokeWidth: 1 });
  }
  return pen.out;
}

/** What the inspector says of a selected thing: the figures the doors returned, and why it is drawn as it is. */
function subjectOf(key: string, scene: AtlasScene, map: TypeMap, declared: ProcessesAndRules): InspectorSubject | null {
  const facts = (rows: { label: string; value: React.ReactNode; note?: React.ReactNode }[], why?: string): InspectorSubject["tabs"] => ({
    overview: <><InspectorFacts rows={rows} />{why && <p className="aug-inspector-note" data-testid="atlas-why">{why}</p>}</>,
  });
  const zone = scene.zones.find((z) => z.key === key);
  if (zone) {
    const inside = [...scene.structures, ...scene.records].filter((x) => x.zone === key).map((x) => x.name);
    return { key: `atlas:${key}`, kind: "Zone", title: zone.name, meta: "a domain in the ontology", tabs: facts([
      { label: "Entities", value: formatCount(inside.length), note: inside.join(", ") || undefined },
      { label: "Stands beside", value: zone.leg ? scene.lanes.find((l) => l.process === zone.leg)?.name ?? zone.leg : "nothing: it stands aside" },
    ], zone.why) };
  }
  const joint = scene.joints.find((j) => j.key === key);
  if (joint) {
    return { key: `atlas:${key}`, kind: joint.linked ? "Link" : "Not modelled", title: joint.linked ? `${joint.after} ${joint.verb} ${joint.before}` : `${joint.after} and ${joint.before}`, tabs: facts([
      { label: joint.after, value: count(joint.count) },
      { label: "Joined by", value: joint.linked ? `the link “${joint.verb}”` : "no link" },
    ], joint.why) };
  }
  const filter = scene.filters.find((f) => f.key === key);
  if (filter) {
    return { key: `atlas:${key}`, kind: "Filter", title: filter.name, tabs: facts([
      { label: "Objects", value: count(filter.count) },
      { label: "Linked from", value: `${formatCount(filter.linked)} entities` },
    ], filter.why) };
  }
  if (key.startsWith("entity:")) {
    const s = scene.structures.find((x) => x.key === key), t = map.object_types.find((x) => `entity:${x.id}` === key);
    const lane = scene.lanes.find((l) => `entity:${l.entity}` === key), record = scene.records.find((x) => x.key === key);
    if (!t || (!s && !lane && !record)) return null;
    const parts = s ? s.parts : lane ? lane.parts : [];
    const why = s ? s.why : record ? record.why : `It goes through ${lane!.name}, so its stages are that leg of the journey and it has no structure of its own.`;
    const links = map.links.filter((l) => l.from === t.object_type || l.to === t.object_type);
    return { key: `atlas:${key}`, kind: record ? "Record of activity" : "Entity", title: t.display_name, meta: t.table || undefined, tabs: facts([
      { label: "Objects", value: count(t.rows) },
      { label: "What it does", value: t.pack_roles?.length ? t.pack_roles.join(", ") : "not said", note: t.pack ? `the ${t.pack} package's ${t.pack_object}` : "no deployed package matched it" },
      { label: "Key", value: t.key || "none declared", note: t.key_verified ? "counted unique" : undefined },
      ...(parts.length ? [{ label: "Parts", value: parts.join(", "), note: "read under it; each still answers by its own name" }] : []),
      { label: "Links", value: formatCount(links.length), note: links.slice(0, 6).map((l) => `${l.from === t.object_type ? "→" : "←"} ${l.from === t.object_type ? l.to : l.from} · ${l.verb || l.cardinality}`).join("; ") || undefined },
    ], why) };
  }
  for (const p of declared.processes) {
    const lane = scene.lanes.find((l) => l.process === p.id);
    if (!lane) continue;
    for (const [i, st] of p.stages.entries()) {
      if (key === `stage:${p.id}:${st.name}`) {
        return { key: `atlas:${key}`, kind: "Stage", title: st.display_name || st.name, meta: `${i + 1} of ${p.stages.length} · ${p.display_name || p.id}`, tabs: facts([
          { label: "Reached it", value: count(st.reached), note: st.share != null && p.objects != null ? `${pct(st.share, 2)} of ${formatCount(p.objects)} objects` : undefined },
          { label: "Reached when", value: "timestamp" in st.anchor ? `${st.anchor.timestamp} is set` : st.anchor.state.join(", ") },
          { label: "Promise", value: st.promise ? st.promise.name : "none declared" },
        ], lane.stages[i]?.why) };
      }
      if (st.promise && key === `promise:${p.id}:${st.promise.name}`) {
        const pr = st.promise;
        return { key: `atlas:${key}`, kind: "Promise", title: pr.name, meta: `on ${st.display_name || st.name} · ${p.display_name || p.id}`, tabs: facts([
          { label: "Not reached, already past", value: count(pr.open_overdue) },
          { label: "Broke it", value: count(pr.breached), note: pr.breach_rate != null ? `${pct(pr.breach_rate, 2)} of the ${count(pr.reached)} that reached it` : undefined },
          { label: "Kept it", value: count(pr.kept) },
          { label: "Not reached yet", value: count(pr.open) },
          { label: "As of", value: pr.as_of ? formatTimestamp(pr.as_of) : "not measured", note: "the data's own clock" },
        ], pr.note) };
      }
      const before = i ? p.stages[i - 1] : null;
      if (before && key === `move:${p.id}:stage:${p.id}:${before.name}>stage:${p.id}:${st.name}`) {
        const seen = (p.observed ?? []).find((m) => m.from_stage === before.name && m.to_stage === st.name), t = st.transition;
        return { key: `atlas:${key}`, kind: "Move", title: `${before.name} → ${st.name}`, meta: p.display_name || p.id, tabs: facts([
          { label: "Moved", value: count(seen?.objects), note: seen ? (seen.declared ? "a declared move" : "seen in the data, not declared") : undefined },
          { label: "Median", value: t?.p50_days != null ? `${t.p50_days} days` : "not timed" },
          { label: "9 in 10 within", value: t?.p90_days != null ? `${t.p90_days} days` : "not timed" },
          { label: "Out of sequence", value: count(t?.out_of_order) },
        ]) };
      }
    }
    if (key === `exit:${p.id}` && p.leaves) {
      return { key: `atlas:${key}`, kind: "Leaves the process", title: `${p.leaves.property} is ${p.leaves.values.join(", ")}`, meta: p.display_name || p.id, tabs: facts([
        { label: "Left", value: count(p.leaves.left) }, { label: "Could not be read", value: count(p.leaves.unknown) },
      ], p.leaves.note) };
    }
  }
  return null;
}
