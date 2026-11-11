/**
 * The Business Atlas model of ONE connection's ontology, read from what two doors already serve: the entity map
 * (`GET /object-types` — each entity, its count, its links, and what a deployed package says it does) and the declared
 * processes (`GET /ontology/processes` — stages, moves, the exit, promises). Nothing is counted here and nothing is
 * guessed: an entity no package matched has no role and is drawn plain; a count that was not taken stays null.
 */
import type { ProcessesAndRules, TypeMap } from "@/lib/objectTypes";
import { roleOfShape, SHAPES, type AtlasModel } from "./compose";

export function modelOf(title: string, map: TypeMap, declared: ProcessesAndRules | null): AtlasModel {
  const byApiName = new Map(map.object_types.map((t) => [t.object_type, t]));
  // ON-7 — a part is read under its parent: it is not drawn beside it, and its links are drawn from the parent, the
  // way the entity map draws them (`shown_from`, `shown_to`). It stays an entity; only the picture folds.
  const standing = map.object_types.filter((t) => !t.absorbed_into);
  return {
    title,
    measured: true,
    entities: standing.map((t) => {
      // A person's own choice of shape comes first, and the shape says what the entity is; then the word of a package
      // deployed and matched; else only what the builder measured of the table.
      const chosen = t.drawn_as && t.drawn_as in SHAPES ? t.drawn_as : "";
      const said = chosen ? roleOfShape(chosen) : "";
      return {
      id: t.id,
      name: t.display_name,
      roles: chosen ? (said ? [said] : []) : t.pack_roles?.length ? t.pack_roles : t.role === "event" ? ["event"] : [],
      domain: t.domain || undefined,
      drawn_as: chosen || t.pack_drawn_as || undefined,
      chosen: !!chosen || undefined,
      count: t.rows ?? null,
      said_by: !chosen && t.pack && t.pack_object ? `the ${t.pack} package's ${t.pack_object}` : undefined,
      parts: (t.parts ?? []).map((p) => p.display_name),
      };
    }),
    links: map.links.flatMap((l) => {
      const a = byApiName.get(l.shown_from ?? l.from), b = byApiName.get(l.shown_to ?? l.to);
      const part = l.shown_from && l.shown_from !== l.from ? byApiName.get(l.from) : l.shown_to && l.shown_to !== l.to ? byApiName.get(l.to) : undefined;
      return a && b && a.id !== b.id ? [{ a: a.id, b: b.id, verb: l.verb || l.business_name.replace(/_/g, " "), ...(part ? { part: part.display_name } : {}) }] : [];
    }),
    processes: (declared?.processes ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || p.id,
      entity: p.entity_id,
      measured: true,
      stages: p.stages.map((s, i) => {
        const before = i ? p.stages[i - 1].name : null;
        const move = before ? (p.observed ?? []).find((m) => m.from_stage === before && m.to_stage === s.name) : null;
        const past = s.promise && (s.promise.open_overdue ?? 0) > 0
          ? { key: `promise:${p.id}:${s.promise.name}`, count: s.promise.open_overdue as number } : null;
        return { key: `stage:${p.id}:${s.name}`, label: s.display_name || s.name, reached: s.reached, moved: move ? move.objects : null, days: s.transition?.p50_days ?? null, past };
      }),
      exit: p.leaves ? { key: `exit:${p.id}`, count: p.leaves.left, label: p.leaves.values.join(", ") } : null,
    })),
  };
}
