/**
 * The Business Atlas composer: a model of a business in, a scene out.
 *
 * The scene is the business as it RUNS, not a diagram of its entities. Its spine is one journey: the declared
 * processes joined end to end wherever a measured link joins what goes through one to what goes through the next.
 * Beside the journey stand zones — one per domain the ontology gives its entities — each next to the leg of the
 * journey its entities link to; a zone that links to none stands aside. An entity that most others link to is a way
 * of slicing everything, so it is a filter and not a place. An entity linked to nothing but filters is said to be
 * unconnected, never tidied away.
 *
 * It reads what each entity DOES (its roles), its domain, the links between entities and the stages of each declared
 * process, and nothing else — so one composer serves every business. It knows no industry, no package and no entity
 * by name; `compose.test.ts` holds it to that by reading this file. A scene gets richer by adding a shape to `SHAPES`,
 * never by writing a scene for a business.
 *
 * The output is geometry on a flat ground, in ground units. Drawing it — the projection, the faces, the theme — is the
 * renderer's, and a second renderer (a flat one) reads the same scene. Position is sequence, never geography.
 */

/** What an entity does. A deployed package says it (`pack_roles` on the entity map); the composer draws by it. */
export const ROLES = ["party", "place", "asset", "catalog", "stock", "transaction", "event", "calendar"] as const;
export type Role = (typeof ROLES)[number];

/** One shape per role, plus shapes that refine a role's and the plain one for a role nobody said. `w` × `d` is
 *  the footprint in ground units; `h` is the height a label must clear; `says` is the shape in words. */
export const SHAPES = {
  site: { w: 6.4, d: 5.2, h: 60, says: "a site with bays" },
  depot: { w: 6.4, d: 5.2, h: 60, says: "a depot with docks" },
  airfield: { w: 6.4, d: 5.2, h: 62, says: "a terminal, a tower and a strip" },
  storefront: { w: 6.4, d: 5.2, h: 36, says: "a row of fronts on a street" },
  factory: { w: 6.4, d: 5.2, h: 60, says: "a hall, a stack and a line" },
  campus: { w: 6.4, d: 5.2, h: 40, says: "joined buildings on a path" },
  terminal: { w: 6.4, d: 5.2, h: 44, says: "a shed, a gantry and lanes" },
  territory: { w: 6.4, d: 5.2, h: 18, says: "stepped plates of ground" },
  cluster: { w: 3.8, d: 3.6, h: 46, says: "a cluster" },
  units: { w: 3.4, d: 3.0, h: 32, says: "units on a plinth" },
  services: { w: 3.4, d: 3.0, h: 56, says: "glass towers joined by bridges" },
  vault: { w: 3.4, d: 3.0, h: 30, says: "a vault with rails" },
  folios: { w: 3.4, d: 3.0, h: 30, says: "overlapping slabs" },
  mast: { w: 3.4, d: 3.0, h: 72, says: "a mast over a hut" },
  contract: { w: 3.4, d: 3.0, h: 16, says: "a signed plate" },
  pods: { w: 3.8, d: 3.6, h: 22, says: "pods on a shared plate" },
  grid: { w: 3.2, d: 2.8, h: 32, says: "terraced blocks" },
  tiles: { w: 3.6, d: 3.0, h: 30, says: "a tiled block" },
  stack: { w: 3.2, d: 2.8, h: 30, says: "a stack" },
  hub: { w: 2.8, d: 2.8, h: 38, says: "a hub" },
  layers: { w: 3.6, d: 3.6, h: 64, says: "stacked layers" },
  bars: { w: 2.8, d: 2.6, h: 34, says: "a row of periods" },
  plinth: { w: 2.6, d: 2.6, h: 22, says: "a plain plinth" },
} as const;
export type Shape = keyof typeof SHAPES;

const ROLE_SHAPE: Record<Role, Shape> = {
  place: "site", party: "cluster", asset: "units", catalog: "tiles", stock: "stack", transaction: "hub",
  event: "layers", calendar: "bars",
};
/** A shape a package may ask for (`drawn_as`), and the one role it refines: it never changes what an entity does. */
const REFINES: Partial<Record<Shape, Role>> = {
  depot: "place", airfield: "place", storefront: "place", factory: "place", campus: "place",
  terminal: "place", territory: "place",
  services: "asset", vault: "asset", folios: "asset", mast: "asset", contract: "asset",
  pods: "party", grid: "stock",
};
/** What a shape says an entity is: the role it is the plain shape of, or the one it refines; "" for the plain plinth. */
export function roleOfShape(shape: string): Role | "" {
  return REFINES[shape as Shape] ?? (ROLES.find((r) => ROLE_SHAPE[r] === shape) ?? "");
}
/** Every shape there is to choose from, under what it says an entity is — the plain one for each first. */
export function shapeCatalogue(): { role: Role | ""; shapes: Shape[] }[] {
  const all = Object.keys(SHAPES) as Shape[];
  return [...ROLES.map((role) => ({ role: role as Role | "", shapes: [ROLE_SHAPE[role], ...all.filter((s) => REFINES[s] === role)] })),
    { role: "" as const, shapes: all.filter((s) => !roleOfShape(s)) }];
}
/** When an entity is said to do several things, the most telling one draws it. */
const TELLING: Role[] = ["place", "asset", "stock", "catalog", "party", "transaction", "calendar", "event"];

export interface AtlasEntity {
  id: string;
  name: string;
  roles: string[];
  /** The domain the ontology gives it; its zone. */
  domain?: string;
  /** A shape a package asks for; used only where it refines a role the entity has. */
  drawn_as?: string;
  /** How many there are; null when not counted, absent when nothing is measured. */
  count?: number | null;
  /** Who says what it does: the package and its own name for the entity. */
  said_by?: string;
  /** A person chose its shape: that is used before any package's word. */
  chosen?: boolean;
  /** The entities that are parts of this one. A part is read under its parent, so it gets no structure of its own. */
  parts?: string[];
}
export interface AtlasStage {
  key: string;
  label: string;
  reached?: number | null;
  /** How many moved here from the stage before. */
  moved?: number | null;
  /** How long the move from the stage before took, at the median, in days. */
  days?: number | null;
  /** A promise on this stage that objects are already past. */
  past?: { key: string; count: number } | null;
}
export interface AtlasProcess {
  id: string;
  name: string;
  /** The entity that goes through it: its stages ARE the route, so it gets no structure of its own. */
  entity: string;
  measured: boolean;
  stages: AtlasStage[];
  exit?: { key: string; count: number | null; label: string } | null;
}
export interface AtlasModel {
  title: string;
  /** False for a package's expected shape: nothing in it was counted on a source. */
  measured: boolean;
  entities: AtlasEntity[];
  /** `a` is the end the link is read from: "a verb b". `part` names the part of `a` or of `b` the link really is on,
   *  when it is drawn from its parent. */
  links: { a: string; b: string; verb: string; part?: string }[];
  processes: AtlasProcess[];
}

export interface SceneStructure {
  key: string;
  entity: string;
  name: string;
  role: Role | "";
  shape: Shape;
  u: number; v: number; w: number; d: number; h: number;
  count: number | null;
  measured: boolean;
  /** Its parts, by name: drawn under it, never beside it. */
  parts: string[];
  zone: string;
  /** Linked to nothing, or to nothing but filters: the ontology does not yet say how it takes part. */
  loose: boolean;
  why: string;
}
export interface SceneStage {
  key: string;
  label: string;
  index: number;
  shape: "first" | "mid" | "last";
  u: number; v: number;
  reached: number | null;
  days: number | null;
  past: { key: string; count: number } | null;
  why: string;
}
/** One leg of the journey: a process, its stages in sequence along one axis of the ground. */
export interface SceneLane {
  process: string | null;
  name: string;
  /** The entity that goes through the process, by id and by name, and its parts: it has no structure, so its route
   *  says them. */
  entity: string;
  entityName: string;
  parts: string[];
  measured: boolean;
  /** The axis it runs along, and where it starts and ends. Legs alternate, so the journey turns and never doubles back. */
  along: "u" | "v";
  start: [number, number]; end: [number, number];
  stages: SceneStage[];
  moves: { from: string; to: string; key: string; count: number | null; days: number | null; a: [number, number]; b: [number, number] }[];
  exit: { key: string; count: number | null; label: string; from: [number, number]; to: [number, number] } | null;
}
/** Where one leg hands over to the next: the measured link that joins the two, or the lack of one. */
export interface SceneJoint { key: string; from: [number, number]; to: [number, number]; verb: string; count: number | null; before: string; after: string; entity: string; parts: string[]; linked: boolean; why: string }
/** A zone: the entities of one domain, on one plate. `leg` is the process it stands beside; null when it stands aside. */
export interface SceneZone { key: string; name: string; u: number; v: number; w: number; d: number; leg: string | null; why: string }
/** A record of activity: an entity whose rows are events ABOUT things (an interaction, a snapshot, a session). It is
 *  drawn as a mark in its zone, never as a structure — the picture is of the business's things, and what happens
 *  between them. It stays an entity everywhere else. */
export interface SceneRecord { key: string; entity: string; name: string; count: number | null; u: number; v: number; measured: boolean; zone: string; loose: boolean; why: string }
export interface SceneLink { a: string; b: string; verb: string; from: [number, number]; to: [number, number] }
/** An entity most others link to: a way of slicing everything, so a filter over the scene and not a place in it. */
export interface SceneFilter { key: string; entity: string; name: string; count: number | null; linked: number; why: string }
export interface AtlasScene {
  title: string;
  measured: boolean;
  extent: { u: number; v: number };
  zones: SceneZone[];
  structures: SceneStructure[];
  records: SceneRecord[];
  lanes: SceneLane[];
  joints: SceneJoint[];
  links: SceneLink[];
  filters: SceneFilter[];
}

const GAP = 1.1;          // between two structures of a zone
const PAD = 0.9;          // a zone's margin around what stands in it
const NAME = 1.3;         // the strip along a zone's near edge where its name is written
const WRITTEN = 1.15;     // the strip in front of a structure where its name is written
const LETTER = 0.31;      // how much ground a written letter takes: a name is given the room to be read
const ACROSS = 3;         // structures abreast in a zone before a second row
const BESIDE = 4.3;       // between a leg and the zones beside it: room for the stages' labels on the ground
const STAGE_PAD = 2.2;    // a stage's platform, square
const STAGE_PITCH = 6.4;  // the least room a stage needs along its leg
const TURN = 4.4;         // the room a leg leaves after the corner before its first stage
const BEHIND = 27;        // how much may stand behind a leg before the rest stands in front of it
const OTHER = "Other";    // the zone of an entity the ontology gives no domain

const a = (word: string) => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;

export function roleOf(roles: string[]): Role | "" {
  return TELLING.find((r) => roles.includes(r)) ?? "";
}

export function shapeOf(entity: Pick<AtlasEntity, "roles" | "drawn_as">): Shape {
  const role = roleOf(entity.roles);
  const asked = entity.drawn_as as Shape | undefined;
  if (asked && role && REFINES[asked] === role) return asked;
  return role ? ROLE_SHAPE[role] : "plinth";
}

/** The processes as one journey: a process follows the one whose entity its own entity links to. Ties break on the
 *  id, so the same model always gives the same journey. `joined[i]` is the link that joins leg i to the leg before. */
export function journeyOf(model: AtlasModel): { legs: AtlasProcess[]; joined: ({ verb: string } | null)[] } {
  const procs = [...model.processes].sort((x, y) => x.id.localeCompare(y.id));
  const after = new Map<string, { p: AtlasProcess; verb: string }[]>(procs.map((p) => [p.id, []]));
  const follows = new Set<string>();
  for (const q of procs) {
    for (const p of procs) {
      if (p === q || p.entity === q.entity || follows.has(q.id)) continue;
      const between = model.links.filter((l) => l.a === q.entity && l.b === p.entity);
      const link = between.find((l) => !l.part) ?? between[0];      // the entity's own link before one of its parts'
      if (link) { after.get(p.id)!.push({ p: q, verb: link.verb }); follows.add(q.id); }
    }
  }
  const legs: AtlasProcess[] = [], joined: ({ verb: string } | null)[] = [];
  const walk = (p: AtlasProcess, by: { verb: string } | null) => {
    legs.push(p); joined.push(by);
    for (const next of after.get(p.id)!) walk(next.p, { verb: next.verb });
  };
  for (const p of procs) if (!follows.has(p.id)) walk(p, null);
  return { legs, joined };
}

/** The entities most others link to. Such an entity says nothing of how the business runs — it is what everything is
 *  sliced by — so it is taken out of the scene and offered as a filter. */
export function filtersOf(model: AtlasModel): Map<string, number> {
  const through = new Set(model.processes.map((p) => p.entity));
  const linked = new Map<string, Set<string>>();
  for (const l of model.links) if (l.a !== l.b) (linked.get(l.b) ?? linked.set(l.b, new Set()).get(l.b)!).add(l.a);
  const least = Math.max(4, Math.ceil(model.entities.length / 3));
  return new Map([...linked].filter(([id, from]) => !through.has(id) && from.size >= least).map(([id, from]) => [id, from.size]));
}

export function compose(model: AtlasModel): AtlasScene {
  const through = new Set(model.processes.map((p) => p.entity));
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  const sliced = filtersOf(model);
  const near = new Map<string, Set<string>>(model.entities.map((e) => [e.id, new Set<string>()]));
  for (const l of model.links) {
    if (l.a !== l.b && near.has(l.a) && near.has(l.b) && !sliced.has(l.a) && !sliced.has(l.b)) { near.get(l.a)!.add(l.b); near.get(l.b)!.add(l.a); }
  }
  const { legs, joined } = journeyOf(model);

  // 1 · sequence: breadth-first over the links, from what goes through the journey. It sorts the zones along a leg
  //     and the structures in a zone.
  const steps = new Map<string, number>();
  const queue = legs.map((p) => p.entity).filter((id) => near.has(id));
  queue.forEach((id) => steps.set(id, 0));
  const sequence: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    sequence.push(id);
    for (const next of [...near.get(id)!].sort()) if (!steps.has(next)) { steps.set(next, steps.get(id)! + 1); queue.push(next); }
  }
  for (const e of [...model.entities].sort((x, y) => x.id.localeCompare(y.id))) if (!steps.has(e.id)) sequence.push(e.id);
  const rank = new Map(sequence.map((id, i) => [id, i]));

  // 2 · zones: the entities of each domain, on one plate. What goes through a process is its route and a filter is
  //     not a place, so neither stands in a zone. A record of activity is marked in its zone, not built.
  const isRecord = (e: AtlasEntity) => roleOf(e.roles) === "event";
  const standing = model.entities.filter((e) => !through.has(e.id) && !sliced.has(e.id));
  const domains = [...new Set(standing.map((e) => e.domain || OTHER))].sort();
  type Item = { e: AtlasEntity; shape: Shape; w: number; d: number; u: number; v: number; room: number };
  /** What is written beside a structure: its name alone. How many there are is on its label, with the rest. */
  const writtenOf = (e: AtlasEntity) => e.name.length;
  type Zone = { key: string; name: string; items: Item[]; marks: AtlasEntity[]; w: number; d: number; u: number; v: number; leg: number | null };
  const zones: Zone[] = domains.map((name) => {
    const mine = standing.filter((e) => (e.domain || OTHER) === name).sort((x, y) => rank.get(x.id)! - rank.get(y.id)!);
    const items: Item[] = mine.filter((e) => !isRecord(e)).map((e) => { const shape = shapeOf(e); return { e, shape, w: SHAPES[shape].w, d: SHAPES[shape].d, u: 0, v: 0, room: Math.max(SHAPES[shape].w, writtenOf(e) * LETTER) }; });
    const marks = mine.filter(isRecord);
    // rows of up to ACROSS structures; each row as deep as its deepest
    let w = 0, d = PAD;
    for (let i = 0; i < items.length; i += ACROSS) {
      const row = items.slice(i, i + ACROSS), deep = Math.max(...row.map((it) => it.d));
      let u = PAD;
      for (const it of row) { it.u = u; it.v = d + (deep - it.d); u += it.room + GAP; }
      w = Math.max(w, u - GAP + PAD); d += deep + WRITTEN + GAP;      // each row keeps room for its names on the ground
    }
    if (!items.length) d += 0.4;
    w = Math.max(w, PAD * 2 + marks.length * 2.4, name.length * 0.52 + 1.2, 5.4);
    d += (marks.length ? 1.5 : 0) + NAME - (items.length ? GAP : 0) + (items.length ? 0.4 : 0);
    // the leg it stands beside: the first leg any of its entities links to
    const at = legs.findIndex((p) => mine.some((e) => near.get(e.id)!.has(p.entity)));
    return { key: `zone:${name}`, name, items, marks, w, d, u: 0, v: 0, leg: at < 0 ? null : at };
  });
  const firstStep = (z: Zone) => Math.min(...[...z.items.map((it) => it.e), ...z.marks].map((e) => rank.get(e.id)!));
  zones.sort((x, y) => firstStep(x) - firstStep(y) || x.name.localeCompare(y.name));

  // 3 · the journey: legs alternate between the two axes of the ground, so it turns and never doubles back. Zones stand
  //     behind an even leg and to the far side of an odd one; what does not fit behind the first leg stands in front
  //     of it, in the corner the journey turns round, with the zones that stand aside.
  const span = (n: number) => Math.max(n, 2) * STAGE_PITCH;
  const beside = (i: number) => zones.filter((z) => z.leg === i);
  const row = (zs: Zone[]) => zs.reduce((sum, z) => sum + z.w + GAP, -GAP);
  const behind: Zone[] = [], inFront: Zone[] = [];
  let used = 0;
  for (const z of beside(0).length || legs.length ? beside(0) : zones) {
    if (used + z.w <= Math.max(BEHIND, span(legs[0]?.stages.length ?? 0))) { behind.push(z); used += z.w + GAP; } else inFront.push(z);
  }
  const aside = legs.length ? zones.filter((z) => z.leg === null) : [];
  const deepest = (zs: Zone[]) => Math.max(0, ...zs.map((z) => z.d));
  const origin: [number, number] = [1.2, 1 + deepest(behind) + (behind.length ? BESIDE : 0.8)];
  const lanes: SceneLane[] = [], joints: SceneJoint[] = [];
  const centre = new Map<string, [number, number]>();
  let cursor: [number, number] = [...origin];
  const lanesIn: (AtlasProcess | null)[] = legs.length ? legs : [null];
  lanesIn.forEach((p, i) => {
    const along: "u" | "v" = i % 2 === 0 ? "u" : "v";
    const n = p?.stages.length ?? 0;
    const here = i === 0 ? behind : beside(i);
    // a leg begins with room for its name, written on its own bed before its first stage — and, after a corner, for the turn
    const named = p ? p.name.length * LETTER * 1.2 + 1.6 : 0, before = i ? Math.max(TURN, named) : named;
    const length = Math.max(span(n), i === 0 || along === "u" ? row(here) : here.reduce((sum, z) => sum + z.d + GAP, -GAP)) + before;
    const start: [number, number] = [...cursor];
    const point = (t: number): [number, number] => (along === "u" ? [start[0] + t, start[1]] : [start[0], start[1] + t]);
    const end = point(length);
    const lead = before + STAGE_PITCH / 2;
    const at = (k: number) => point(n > 1 ? lead + (k * (length - lead - STAGE_PITCH / 2)) / (n - 1) : length / 2);
    // the zones beside this leg
    if (along === "u") { let u = start[0]; for (const z of here) { z.u = u; z.v = start[1] - BESIDE - z.d; u += z.w + GAP; } }
    else { let v = start[1] + before; for (const z of here) { z.u = start[0] + BESIDE; z.v = v; v += z.d + GAP; } }
    if (!p) { lanes.push({ process: null, name: "", entity: "", entityName: "", parts: [], measured: false, along, start, end, stages: [], moves: [], exit: null }); cursor = end; return; }
    centre.set(p.entity, at(0));
    const half = STAGE_PAD / 2 + 0.15;
    const nudge = (q: [number, number], t: number): [number, number] => (along === "u" ? [q[0] + t, q[1]] : [q[0], q[1] + t]);
    const stages: SceneStage[] = p.stages.map((s, k) => ({
      key: s.key, label: s.label, index: k, shape: k === 0 ? "first" : k === n - 1 ? "last" : "mid", u: at(k)[0], v: at(k)[1],
      reached: s.reached ?? null, days: s.days ?? null, past: s.past ?? null,
      why: `Stage ${k + 1} of ${n} of ${p.name}, in sequence along its leg of the journey. Position is sequence, not geography.`,
    }));
    const moves = p.stages.slice(1).map((s, k) => ({
      from: p.stages[k].key, to: s.key, key: `${p.id}:${p.stages[k].key}>${s.key}`, count: s.moved ?? null, days: s.days ?? null,
      a: nudge(at(k), half), b: nudge(at(k + 1), -half + 0.1),
    }));
    // what leaves does so into the corner the journey turns round: forward of an even leg, back from an odd one
    const off = (q: [number, number], t: number): [number, number] => (along === "u" ? [q[0], q[1] + t] : [q[0] - t, q[1]]);
    const exit = p.exit ? { ...p.exit, from: off(at(0), STAGE_PAD / 2 + 0.05), to: off(at(0), 3.4) } : null;
    const goes = byId.get(p.entity);
    lanes.push({ process: p.id, name: p.name, entity: p.entity, entityName: goes?.name ?? p.entity, parts: [...(goes?.parts ?? [])].sort(), measured: p.measured, along, start, end, stages, moves, exit });
    if (i) {
      const was = legs[i - 1], by = joined[i];
      joints.push({
        key: `joint:${was.id}>${p.id}`, from: start, to: nudge(at(0), -half), verb: by?.verb ?? "", count: goes?.count ?? null,
        before: byId.get(was.entity)?.name ?? was.entity, after: goes?.name ?? p.entity, entity: p.entity, parts: [...(goes?.parts ?? [])].sort(), linked: by !== null,
        why: by ? `${p.name} follows ${was.name} because ${goes?.name ?? p.entity} links to ${byId.get(was.entity)?.name ?? was.entity} (“${by.verb}”). That measured link is what joins the two processes into one journey.`
          : `No link joins ${goes?.name ?? p.entity} to ${byId.get(was.entity)?.name ?? was.entity}, so ${p.name} is drawn after ${was.name} without a claim that one leads to the other.`,
      });
    }
    cursor = end;
  });

  // 4 · the corner: zones that did not fit behind the first leg, then the ones that stand aside, in rows
  const first = lanes[0], turn = lanes.length > 1 ? first.end[0] - BESIDE : Math.max(first.end[0], 24);
  let rowU = origin[0], rowV = origin[1] + (legs[0]?.exit ? 5.6 : 3.2), rowDeep = 0;
  for (const z of [...inFront, ...aside]) {
    if (rowU > origin[0] && rowU + z.w > turn) { rowU = origin[0]; rowV += rowDeep + GAP; rowDeep = 0; }
    z.u = rowU; z.v = rowV; rowU += z.w + GAP; rowDeep = Math.max(rowDeep, z.d);
  }

  // 5 · what stands in each zone, and the records marked along its near edge
  const linksOf = (id: string) => model.links.filter((l) => l.a !== l.b && (l.a === id || l.b === id));
  const isLoose = (id: string) => linksOf(id).every((l) => sliced.has(l.a === id ? l.b : l.a));
  const seedName = legs.length ? byId.get(legs[0].entity)?.name ?? "" : "";
  const structures: SceneStructure[] = [], records: SceneRecord[] = [], sceneZones: SceneZone[] = [];
  for (const z of zones) {
    const leg = z.leg === null ? null : legs[z.leg];
    sceneZones.push({
      key: z.key, name: z.name, u: z.u, v: z.v, w: z.w, d: z.d, leg: leg?.id ?? null,
      why: leg ? `${z.name} is a domain the ontology gives its entities. It stands beside ${leg.name} because an entity in it links to ${byId.get(leg.entity)?.name ?? leg.entity}.`
        : legs.length ? `${z.name} is a domain the ontology gives its entities. None of them links to what goes through the journey, so it stands aside.`
        : `${z.name} is a domain the ontology gives its entities.`,
    });
    for (const it of z.items) {
      const role = roleOf(it.e.roles), n = steps.get(it.e.id), count = it.e.count ?? null, loose = isLoose(it.e.id);
      const bays = (it.shape === "site" || it.shape === "depot") && count !== null && count > 0 && count <= 12;
      const u = z.u + it.u, v = z.v + it.v;
      centre.set(it.e.id, [u + it.w / 2, v + it.d / 2]);
      const where = loose ? (linksOf(it.e.id).length ? "It links to nothing but what everything is sliced by, so the ontology does not yet say how it takes part." : "It links to no other entity, so the ontology does not yet say how it takes part.")
        : n === undefined ? "It links to nothing on the journey."
        : `It stands in ${z.name}, ${n} link${n === 1 ? "" : "s"} from ${seedName}; position is sequence, not geography.`;
      structures.push({
        key: `entity:${it.e.id}`, entity: it.e.id, name: it.e.name, role, shape: it.shape, u, v, w: it.w, d: it.d, h: SHAPES[it.shape].h, count,
        measured: model.measured, parts: [...(it.e.parts ?? [])].sort(), zone: z.key, loose,
        why: `Drawn as ${SHAPES[it.shape].says} because ${it.e.chosen ? "a person chose that shape for it"
          : !role ? "nobody has chosen its shape and no deployed package says what it is"
          : it.e.said_by ? `it matches ${it.e.said_by}, ${a(role)}` : `it is ${a(role)}`}${bays ? "; one bay each" : ""}. ${where}`,
      });
    }
    z.marks.forEach((e, k) => {
      const u = z.u + PAD + 1.2 + k * 2.4, v = z.v + z.d - NAME - 0.75;
      centre.set(e.id, [u, v]);
      records.push({
        key: `entity:${e.id}`, entity: e.id, name: e.name, count: e.count ?? null, u, v, measured: model.measured, zone: z.key, loose: isLoose(e.id),
        why: `Marked, not built: its rows are records of activity, not things. It stands in ${z.name}, the domain the ontology gives it.`,
      });
    });
  }

  // A link said twice in the model (found by the builder, then named by a person) is one line.
  const links: SceneLink[] = [], drawn = new Set<string>();
  for (const l of model.links) {
    const from = centre.get(l.a), to = centre.get(l.b), id = `${l.a}>${l.b}:${l.verb}`;
    if (!from || !to || l.a === l.b || drawn.has(id) || (through.has(l.a) && through.has(l.b))) continue;
    drawn.add(id);
    links.push({ a: l.a, b: l.b, verb: l.verb, from, to });
  }
  links.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b) || x.verb.localeCompare(y.verb));

  const filters: SceneFilter[] = [...sliced].sort(([x], [y]) => x.localeCompare(y)).map(([id, linked]) => ({
    key: `filter:${id}`, entity: id, name: byId.get(id)?.name ?? id, count: byId.get(id)?.count ?? null, linked,
    why: `${linked} of the ${model.entities.length} entities link to it, so it is a way of slicing all of them and not a place the business runs through. It is offered as a filter and left out of the picture.`,
  }));

  const reach = [...sceneZones.map((z) => [z.u + z.w, z.v + z.d]), ...lanes.flatMap((l) => [l.end, l.start, ...(l.exit ? [[l.exit.to[0] + 1.2, l.exit.to[1] + 1.2]] : [])])];
  const U = Math.max(12, ...reach.map((q) => q[0])) + 1.4, V = Math.max(8, ...reach.map((q) => q[1])) + 1.4;
  return { title: model.title, measured: model.measured, extent: { u: U, v: V }, zones: sceneZones, structures, records, lanes, joints, links, filters };
}
