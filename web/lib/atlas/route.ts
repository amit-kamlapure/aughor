/**
 * How the Atlas draws a link: flat on the ground, out to the nearer of the plane's two far edges, along a track of its
 * own outside the plane, and back in — never across the scene and never along another link.
 *
 * Only the left edge (u = 0) and the back edge (v = 0) are used: beyond them is open ground in the raised drawing,
 * while the other two edges carry the plane's walls. Each link has its own track, a step further out than the one
 * before, and links that share an end are spread along the edge so their last stretches lie side by side.
 */
import type { AtlasScene, SceneLink } from "./compose";

type Pt = [number, number];
const NEAR = 0.7, STEP = 0.32, SPREAD = 0.3;

/** How far outside the plane the furthest track lies: the margin a drawing must leave beyond the two far edges. */
export function gutterOf(scene: Pick<AtlasScene, "links">): number {
  return scene.links.length ? NEAR + (scene.links.length - 1) * STEP + 0.5 : 0;
}

/** Each link's path over the ground, as corners in ground units. */
export function routesOf(scene: Pick<AtlasScene, "links" | "lanes">): Map<SceneLink, Pt[]> {
  const first = scene.lanes[0];
  // what goes through the first leg is joined at the leg's start, at the plane's edge, not at its first stage
  const end = (id: string, q: Pt): Pt => (first?.process && first.entity === id ? first.start : q);
  const ends = scene.links.map((l) => ({ l, a: end(l.a, l.from), b: end(l.b, l.to) }));
  // links that share an end are spread across it, in the sequence they are drawn
  const sharing = new Map<string, number>(), turn = new Map<string, number>();
  const key = (q: Pt) => `${q[0].toFixed(2)}:${q[1].toFixed(2)}`;
  for (const e of ends) for (const q of [e.a, e.b]) sharing.set(key(q), (sharing.get(key(q)) ?? 0) + 1);
  const spread = (q: Pt, side: "left" | "back"): Pt => {
    const n = sharing.get(key(q)) ?? 1, i = turn.get(key(q)) ?? 0;
    turn.set(key(q), i + 1);
    const off = (i - (n - 1) / 2) * SPREAD;
    return side === "left" ? [q[0], q[1] + off] : [q[0] + off, q[1]];
  };
  const out = new Map<SceneLink, Pt[]>();
  ends.forEach(({ l, a, b }, i) => {
    const g = NEAR + i * STEP;
    const sideOf = (q: Pt): "left" | "back" => (q[0] <= q[1] ? "left" : "back");
    const sa = sideOf(a), sb = sideOf(b), pa = spread(a, sa), pb = spread(b, sb);
    const off = (q: Pt, side: "left" | "back"): Pt => (side === "left" ? [-g, q[1]] : [q[0], -g]);
    out.set(l, sa === sb ? [pa, off(pa, sa), off(pb, sb), pb] : [pa, off(pa, sa), [-g, -g], off(pb, sb), pb]);
  });
  return out;
}
