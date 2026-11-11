/**
 * The Business Atlas's drawing: a scene's geometry (`lib/atlas/compose.ts`) as lit isometric shapes.
 *
 * One projection and one pen. Every colour is a token from `styles/atlas.css`, declared for the dark and the light
 * theme, so the scene is the page's theme and never a dark panel on a light page. A shape here is drawn for a ROLE —
 * nothing in this file knows which business it is drawing either.
 */
import type { ReactNode, SVGProps } from "react";

import type { SceneStage, Shape } from "@/lib/atlas/compose";

type Pt = [number, number];
type Face = "top" | "left" | "right" | "line";
/** A material: three lit faces and an edge, each a token. */
export type Material = "steel" | "wall" | "roof" | "warm" | "lit" | "glass" | "amber" | "teal" | "tile-a" | "tile-b" | "tile-c";
const tone = (m: Material, f: Face) => `var(--atlas-${m}-${f})`;

export interface Projection { (u: number, v: number, z?: number): Pt }

/** Ground units to the drawing: `u` runs right and down, `v` left and down, `z` straight up. */
export function projection(extent: { u: number; v: number }, width = 1100, height = 590): Projection {
  const span = extent.u + extent.v;
  // Above the ground: room for the tallest structure at the far corner and the tip over it. Below: the plane's wall.
  // (Labels no longer stand over the scene — a stage's lies on the ground, an entity's is a tip — so little is kept.)
  const above = 84, below = 22;
  const s = Math.min((width - 60) / span, ((height - above - below) * 2) / span, 30);
  const ox = 30 + extent.v * s + (width - 60 - span * s) / 2;
  const oy = above + (height - above - below - (span * s) / 2) / 2;
  return (u, v, z = 0) => [ox + (u - v) * s, oy + ((u + v) * s) / 2 - (z * s) / 25];
}

const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

export class Pen {
  readonly out: ReactNode[] = [];
  constructor(readonly at: Projection) {}

  poly(points: Pt[], fill: string, props: SVGProps<SVGPolygonElement> = {}) {
    this.out.push(<polygon key={this.out.length} points={pts(points)} fill={fill} {...props} />);
  }
  line(a: Pt, b: Pt, stroke: string, props: SVGProps<SVGLineElement> = {}) {
    this.out.push(<line key={this.out.length} x1={a[0].toFixed(1)} y1={a[1].toFixed(1)} x2={b[0].toFixed(1)} y2={b[1].toFixed(1)} stroke={stroke} {...props} />);
  }
  /** A box of three lit faces: the flat colour, then a shading pass over each face. */
  box(u: number, v: number, w: number, d: number, h: number, m: Material = "steel", z = 0) {
    const p = this.at, edge = { stroke: tone(m, "line"), strokeWidth: 0.8, strokeLinejoin: "round" as const };
    const left = [p(u, v + d, z + h), p(u + w, v + d, z + h), p(u + w, v + d, z), p(u, v + d, z)];
    const right = [p(u + w, v, z + h), p(u + w, v + d, z + h), p(u + w, v + d, z), p(u + w, v, z)];
    const top = [p(u, v, z + h), p(u + w, v, z + h), p(u + w, v + d, z + h), p(u, v + d, z + h)];
    this.poly(left, tone(m, "left"), edge); this.poly(left, "url(#atlas-shade-left)");
    this.poly(right, tone(m, "right"), edge); this.poly(right, "url(#atlas-shade-right)");
    this.poly(top, tone(m, "top"), edge); this.poly(top, "url(#atlas-shade-top)");
  }
  /** A panel on a front-left face, and one on a front-right face. */
  faceL(u: number, v: number, w: number, z0: number, z1: number, fill: string, props: SVGProps<SVGPolygonElement> = {}) {
    const p = this.at; this.poly([p(u, v, z1), p(u + w, v, z1), p(u + w, v, z0), p(u, v, z0)], fill, props);
  }
  faceR(u: number, v: number, d: number, z0: number, z1: number, fill: string, props: SVGProps<SVGPolygonElement> = {}) {
    const p = this.at; this.poly([p(u, v, z1), p(u, v + d, z1), p(u, v + d, z0), p(u, v, z0)], fill, props);
  }
  shadow(u: number, v: number, w: number, d: number) {
    const p = this.at;
    this.poly([p(u + 0.3, v + d), p(u + w + 1.1, v + d + 0.7), p(u + w + 1.1, v + 1.1), p(u + w, v + 0.2)], "var(--atlas-shadow)", { filter: "url(#atlas-soft)" });
  }
  crate(u: number, v: number, z = 0, k = 1) { this.box(u, v, 0.5 * k, 0.5 * k, 9 * k, "warm", z); }
  /** The platform a structure stands on. `expected` is dashed: a package expects it, nothing counted it. */
  pad(u: number, v: number, w: number, d: number, kind: "entity" | "stage" | "past" | "expected") {
    const p = this.at, foot = (g: number) => [p(u - g, v - g), p(u + w + g, v - g), p(u + w + g, v + d + g), p(u - g, v + d + g)];
    if (kind === "expected") { this.poly(foot(0), "var(--atlas-pad)", { className: "aug-atlas-pad", fillOpacity: 0.5, stroke: "var(--atlas-pad-expected)", strokeWidth: 1.2, strokeDasharray: "6 5" }); return; }
    const ring = kind === "past" ? "var(--red3)" : kind === "stage" ? "var(--blue3)" : "var(--atlas-ring)";
    this.poly(foot(0.22), "none", { stroke: ring, strokeOpacity: kind === "past" ? 0.6 : 0.28, strokeWidth: 1 });
    this.poly([p(u, v + d), p(u + w, v + d), p(u + w, v + d, -6), p(u, v + d, -6)], "var(--atlas-pad-side)");
    this.poly([p(u + w, v), p(u + w, v + d), p(u + w, v + d, -6), p(u + w, v, -6)], "var(--atlas-pad-under)");
    this.poly(foot(0), "var(--atlas-pad)", { className: `aug-atlas-pad${kind === "past" ? " is-past" : ""}`, stroke: "var(--atlas-pad-line)", strokeWidth: 1.2 });
  }
}

const WINDOW = "var(--atlas-window)", GLAZE = "var(--atlas-glaze)", DOOR = "var(--atlas-door)";

/** A site: a building with a bay on its roof per object when there are few. `docks` makes it the depot. */
function site(pen: Pen, u: number, v: number, w: number, d: number, count: number | null, docks: boolean) {
  const p = pen.at, bd = d - 1.25, H = 36, bays = count !== null && count > 0 && count <= 12 ? count : 6;
  pen.poly([p(u, v + bd), p(u + w, v + bd), p(u + w, v + d - 0.1), p(u, v + d - 0.1)], "var(--atlas-apron)", { stroke: "var(--atlas-pad-line)", strokeWidth: 0.8 });
  if (docks) for (let i = 0; i < Math.floor(w); i++) pen.line(p(u + 0.2 + i, v + bd + 0.12), p(u + 0.2 + i, v + d - 0.25), "var(--amb3)", { strokeOpacity: 0.45, strokeWidth: 1 });
  pen.shadow(u, v, w, bd);
  pen.box(u, v, w, bd, H, "wall");
  pen.faceL(u, v + bd, w, H - 4, H, "var(--blue3)", { opacity: 0.92 });
  const doors = Math.floor(w - 0.4), middle = Math.floor(doors / 2);
  for (let i = 0; i < doors; i++) {
    const a = u + 0.4 + i;
    if (!docks) { pen.faceL(a + 0.05, v + bd, 0.6, 9, 21, i === middle ? "url(#atlas-bay)" : GLAZE, { opacity: i === middle ? 0.95 : 0.5 }); continue; }
    const open = i % 2 === 1;
    pen.faceL(a, v + bd, 0.7, 2, 22, open ? "url(#atlas-bay)" : DOOR, { stroke: tone("wall", "line"), strokeWidth: 0.8 });
    if (!open) for (const z of [7, 12, 17]) pen.line(p(a, v + bd, z), p(a + 0.7, v + bd, z), tone("wall", "line"), { strokeWidth: 0.8, strokeOpacity: 0.6 });
  }
  for (let i = 0; i < Math.floor((bd - 0.5) / 0.85); i++) pen.faceR(u + w, v + 0.45 + i * 0.85, 0.55, 22, 28, GLAZE, { opacity: 0.55 });
  pen.box(u + 0.12, v + 0.12, w - 0.24, bd - 0.24, 3, "roof", H);
  const per = Math.ceil(bays / 2), bw = (w - 1.1) / per, rd = (bd - 1.5) / 2;
  for (let i = 0; i < bays; i++) pen.box(u + 0.55 + (i % per) * bw, v + 0.55 + Math.floor(i / per) * (rd + 0.35), bw - 0.3, rd, 15, i % 3 ? "steel" : "warm", H + 3);
  if (docks) [0.5, 1.3, w - 2.1, w - 1.3].forEach((a, i) => { pen.crate(u + a, v + bd + 0.35); if (i % 2 === 0) pen.crate(u + a + 0.1, v + bd + 0.45, 9, 0.7); });
}

type Draw = (pen: Pen, u: number, v: number, w: number, d: number, count: number | null) => void;

/** One drawing per shape the composer may ask for. */
export const DRAW: Record<Shape, Draw> = {
  site: (pen, u, v, w, d, n) => site(pen, u, v, w, d, n, false),
  depot: (pen, u, v, w, d, n) => site(pen, u, v, w, d, n, true),
  airfield(pen, u, v, w, d) {
    const p = pen.at;
    pen.poly([p(u + 0.3, v + d - 1.5), p(u + w - 0.3, v + d - 1.5), p(u + w - 0.3, v + d - 0.3), p(u + 0.3, v + d - 0.3)], "var(--atlas-lane)", { stroke: "var(--atlas-lane-line)", strokeWidth: 0.8 });
    pen.line(p(u + 0.7, v + d - 0.9), p(u + w - 0.7, v + d - 0.9), "var(--atlas-marking)", { strokeWidth: 1.4, strokeDasharray: "7 6" });
    pen.shadow(u + 0.4, v + 0.5, w * 0.6, 2.1);
    pen.box(u + 0.4, v + 0.5, w * 0.6, 2.1, 15, "wall");
    pen.faceL(u + 0.4, v + 2.6, w * 0.6, 4, 11, GLAZE, { opacity: 0.6 });
    pen.box(u + w - 1.7, v + 0.7, 0.7, 0.7, 44, "steel");
    pen.box(u + w - 1.95, v + 0.45, 1.2, 1.2, 7, "lit", 44);
  },
  storefront(pen, u, v, w, d) {
    const p = pen.at, n = 4, fw = (w - 0.8 - (n - 1) * 0.15) / n;
    pen.poly([p(u + 0.2, v + d - 1.5), p(u + w - 0.2, v + d - 1.5), p(u + w - 0.2, v + d - 0.2), p(u + 0.2, v + d - 0.2)], "var(--atlas-apron)", { stroke: "var(--atlas-pad-line)", strokeWidth: 0.8 });
    for (let i = 0; i < n; i++) {
      const a = u + 0.4 + i * (fw + 0.15), h = 20 + (i % 2) * 7;
      pen.shadow(a, v + 1.2, fw, 2.4);
      pen.box(a, v + 1.2, fw, 2.4, h, i % 2 ? "steel" : "wall");
      pen.faceL(a + 0.15, v + 3.6, fw - 0.3, 3, 10, GLAZE, { opacity: 0.7 });
      pen.faceL(a, v + 3.6, fw, 11, 14, i % 2 ? "var(--blue3)" : "var(--amb3)", { opacity: 0.9 });
    }
  },
  factory(pen, u, v, w, d) {
    const p = pen.at, hw = w - 1.0;
    pen.shadow(u + 0.4, v + 0.5, hw, 2.6);
    pen.box(u + 0.4, v + 0.5, hw, 2.6, 24, "wall");
    for (let i = 0; i < 4; i++) { pen.box(u + 0.5 + i * (hw / 4), v + 0.6, hw / 4 - 0.25, 2.4, 6, "roof", 24); pen.faceL(u + 0.7 + i * (hw / 4), v + 3.1, hw / 4 - 0.6, 8, 15, GLAZE, { opacity: 0.55 }); }
    pen.box(u + w - 1.5, v + 0.8, 0.55, 0.55, 30, "steel", 30);
    pen.box(u + 0.6, v + d - 1.3, w - 1.4, 0.55, 4, "steel");
    for (let i = 0; i < 5; i++) pen.crate(u + 0.9 + i * 0.95, v + d - 1.28, 4, 0.8);
    pen.line(p(u + 0.6, v + d - 0.6), p(u + w - 0.8, v + d - 0.6), "var(--amb3)", { strokeOpacity: 0.5, strokeWidth: 1, strokeDasharray: "5 4" });
  },
  campus(pen, u, v, w, d) {
    const p = pen.at;
    pen.poly([p(u + 2.2, v + 2.3), p(u + 3.9, v + 2.3), p(u + 3.9, v + d - 0.3), p(u + 2.2, v + d - 0.3)], "var(--atlas-apron)", { stroke: "var(--atlas-pad-line)", strokeWidth: 0.8 });
    ([[0.4, 0.5, 2.3, 1.9, 20], [3.3, 0.4, 2.7, 2.3, 34], [0.5, 3.0, 1.6, 1.7, 14], [4.1, 3.2, 1.9, 1.5, 18]] as const).forEach(([a, b, bw, bd, h], i) => {
      pen.shadow(u + a, v + b, bw, bd);
      pen.box(u + a, v + b, bw, bd, h, i % 2 ? "wall" : "steel");
      for (let z = 5; z < h - 4; z += 7) pen.faceL(u + a + 0.2, v + b + bd, bw - 0.4, z, z + 3, WINDOW, { opacity: 0.8 });
    });
    pen.box(u + 2.6, v + 1.1, 0.8, 0.5, 4, "glass", 12);
    pen.line(p(u + 3.05, v + 2.5), p(u + 3.05, v + d - 0.5), "var(--atlas-marking)", { strokeWidth: 1.2, strokeDasharray: "4 5", strokeOpacity: 0.7 });
  },
  terminal(pen, u, v, w, d) {
    const p = pen.at;
    for (let i = 0; i < 3; i++) pen.poly([p(u + 0.4, v + 2.9 + i * 0.75), p(u + w - 0.4, v + 2.9 + i * 0.75), p(u + w - 0.4, v + 3.45 + i * 0.75), p(u + 0.4, v + 3.45 + i * 0.75)], "var(--atlas-lane)", { stroke: "var(--atlas-lane-line)", strokeWidth: 0.8 });
    pen.shadow(u + 0.4, v + 0.5, 3.0, 2.0);
    pen.box(u + 0.4, v + 0.5, 3.0, 2.0, 18, "wall");
    pen.faceL(u + 0.6, v + 2.5, 2.6, 3, 12, "url(#atlas-bay)", { opacity: 0.9 });
    (["warm", "tile-b", "warm", "tile-a"] as Material[]).forEach((m, i) => pen.box(u + 3.9, v + 0.6 + (i % 2) * 0.75, 1.9, 0.6, 7, m, Math.floor(i / 2) * 7));
    pen.box(u + 0.9, v + 3.0, 0.22, 0.22, 34, "steel"); pen.box(u + w - 1.3, v + 3.0, 0.22, 0.22, 34, "steel");
    pen.box(u + 0.9, v + 3.0, w - 2.0, 0.22, 4, "amber", 34);
  },
  territory(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 3);
    ([[0.55, 0.55, 2.7, 2.0, 4, "tile-a"], [3.45, 0.55, 2.4, 2.7, 9, "tile-b"], [0.55, 2.75, 2.7, 1.9, 7, "tile-c"], [3.45, 3.45, 2.4, 1.2, 3, "tile-a"]] as const).forEach(([a, b, bw, bd, h, m]) => pen.box(u + a, v + b, bw, bd, h, m, 3));
  },
  services(pen, u, v, w, d) {
    const p = pen.at;
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 4);
    const towers = [[0.55, 0.55, 30], [1.75, 0.5, 44], [1.15, 1.6, 22]] as const;
    towers.forEach(([a, b, h]) => { pen.box(u + a, v + b, 0.85, 0.85, h, "glass", 4); for (let z = 12; z < h; z += 9) pen.line(p(u + a, v + b + 0.85, z), p(u + a + 0.85, v + b + 0.85, z), tone("glass", "line"), { strokeWidth: 0.8, strokeOpacity: 0.7 }); });
    pen.line(p(u + 1.4, v + 1.0, 26), p(u + 1.75, v + 0.95, 26), tone("glass", "line"), { strokeWidth: 2.2 });
    pen.line(p(u + 1.6, v + 1.6, 20), p(u + 1.9, v + 1.35, 20), tone("glass", "line"), { strokeWidth: 2.2 });
  },
  vault(pen, u, v, w, d) {
    const p = pen.at;
    pen.shadow(u + 0.5, v + 0.4, 2.3, 1.8);
    pen.box(u + 0.5, v + 0.4, 2.3, 1.8, 22);
    pen.faceL(u + 1.15, v + 2.2, 1.0, 4, 17, tone("amber", "left"), { stroke: tone("steel", "line"), strokeWidth: 1 });
    pen.line(p(u + 1.65, v + 2.2, 7), p(u + 1.65, v + 2.2, 14), tone("steel", "line"), { strokeWidth: 1.6 });
    for (const b of [2.45, 2.7]) pen.line(p(u + 0.4, v + b), p(u + w - 0.3, v + b), "var(--atlas-marking)", { strokeWidth: 1.2, strokeOpacity: 0.75 });
  },
  folios(pen, u, v, w, d) {
    pen.shadow(u + 0.4, v + 0.4, w - 0.9, d - 0.9);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 3);
    (["tile-a", "tile-b", "tile-c", "glass"] as Material[]).forEach((m, i) => pen.box(u + 0.45 + i * 0.42, v + 0.45 + i * 0.3, 1.45, 1.05, 2.5, m, 4 + i * 7));
  },
  mast(pen, u, v) {
    const p = pen.at;
    pen.shadow(u + 0.6, v + 0.9, 1.2, 1.1);
    pen.box(u + 0.6, v + 0.9, 1.2, 1.1, 10, "wall");
    pen.box(u + 2.0, v + 1.3, 0.2, 0.2, 62, "steel");
    for (const z of [40, 52]) pen.box(u + 1.7, v + 1.3, 0.8, 0.2, 3, "lit", z);
    pen.line(p(u + 2.1, v + 1.4, 62), p(u + 1.3, v + 2.4), tone("steel", "line"), { strokeWidth: 0.8, strokeOpacity: 0.6 });
    pen.line(p(u + 2.1, v + 1.4, 62), p(u + 2.9, v + 2.2), tone("steel", "line"), { strokeWidth: 0.8, strokeOpacity: 0.6 });
  },
  contract(pen, u, v, w, d) {
    const p = pen.at;
    pen.shadow(u + 0.4, v + 0.4, w - 0.8, d - 0.8);
    pen.box(u + 0.4, v + 0.4, w - 0.8, d - 0.8, 4);
    pen.box(u + 0.75, v + 0.7, 1.9, 1.5, 2.5, "glass", 4);
    for (const b of [1.0, 1.3, 1.6]) pen.line(p(u + 0.95, v + b, 6.5), p(u + 2.1 + (b > 1.5 ? -0.5 : 0), v + b, 6.5), tone("glass", "line"), { strokeWidth: 1.2, strokeOpacity: 0.85 });
    pen.box(u + 2.15, v + 1.7, 0.34, 0.34, 4, "amber", 6.5);
  },
  pods(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 4, "steel");
    ([[0.6, 0.6], [1.6, 0.55], [2.6, 0.65], [1.05, 1.6], [2.1, 1.65], [0.65, 2.55], [1.7, 2.6], [2.65, 2.5]] as const).forEach(([a, b], i) => pen.box(u + a, v + b, 0.62, 0.62, 8 + (i % 3) * 3, i % 3 === 0 ? "lit" : "glass", 4));
  },
  grid(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 3);
    const tints: Material[] = ["tile-a", "tile-b", "tile-c"];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) pen.box(u + 0.5 + i * 0.58, v + 0.45 + j * 0.66, 0.46, 0.5, 20 - j * 7, (i + j) % 4 === 0 ? "lit" : tints[j], 3);
  },
  cluster(pen, u, v) {
    ([[0.3, 0.3, 26], [1.45, 0.2, 38], [2.6, 0.4, 22], [0.4, 1.5, 18], [1.55, 1.4, 30], [2.7, 1.55, 16], [1.0, 2.55, 12], [2.15, 2.6, 20]] as const).forEach(([a, b, h], i) => {
      pen.shadow(u + a, v + b, 0.75, 0.75);
      pen.box(u + a, v + b, 0.75, 0.75, h, i % 3 ? "steel" : "wall");
      for (let z = 5; z < h - 3; z += 7) pen.faceL(u + a + 0.15, v + b + 0.75, 0.45, z, z + 3, WINDOW, { opacity: 0.85 });
    });
  },
  units(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 5);
    ([[0.55, 0.55], [1.45, 0.7], [2.25, 0.55], [1.0, 1.6], [1.95, 1.7]] as const).forEach(([a, b], i) => pen.box(u + a, v + b, 0.62, 0.62, 12 + (i % 2) * 6, "lit", 5));
  },
  tiles(pen, u, v, w, d) {
    const p = pen.at;
    pen.shadow(u + 0.4, v + 0.4, w - 0.8, d - 0.8);
    pen.box(u + 0.4, v + 0.4, w - 0.8, d - 0.8, 14);
    for (const z of [5, 10]) pen.line(p(u + 0.4, v + d - 0.4, z), p(u + w - 0.4, v + d - 0.4, z), tone("steel", "line"), { strokeWidth: 0.7, strokeOpacity: 0.6 });
    const tints: Material[] = ["tile-a", "tile-b", "tile-c", "tile-a", "tile-a", "tile-b"];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) pen.box(u + 0.58 + i * 0.66, v + 0.56 + j * 0.68, 0.46, 0.46, 4 + ((i * 3 + j * 5) % 4) * 3, tints[(i + j * 2) % 6], 14);
  },
  stack(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 4);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { pen.crate(u + 0.5 + i * 0.58, v + 0.5 + j * 0.6, 4, 0.9); if ((i + j) % 2 === 0) pen.crate(u + 0.5 + i * 0.58, v + 0.5 + j * 0.6, 12, 0.9); }
  },
  hub(pen, u, v) {
    pen.shadow(u + 0.7, v + 0.7, 1.4, 1.4);
    pen.box(u + 0.7, v + 0.7, 1.4, 1.4, 24);
    pen.faceL(u + 0.7, v + 2.1, 1.4, 16, 20, "var(--blue3)");
    pen.faceR(u + 2.1, v + 0.7, 1.4, 16, 20, "var(--blue2)");
    pen.box(u + 1.05, v + 1.05, 0.7, 0.7, 7, "lit", 24);
  },
  layers(pen, u, v) {
    const p = pen.at;
    pen.shadow(u + 0.5, v + 0.5, 2.4, 2.4);
    pen.box(u + 0.5, v + 0.5, 2.4, 2.4, 12);
    [20, 33, 46].forEach((z, i) => pen.box(u + 0.75 + i * 0.12, v + 0.75 + i * 0.12, 1.9 - i * 0.24, 1.9 - i * 0.24, 5, "glass", z));
    pen.line(p(u + 1.7, v + 1.7, 12), p(u + 1.7, v + 1.7, 62), tone("glass", "line"), { strokeWidth: 1, strokeOpacity: 0.75 });
    pen.faceL(u + 2.15, v + 3.25, 1.1, 6, 26, tone("glass", "left"), { stroke: tone("glass", "line"), strokeWidth: 0.9 });
    [21, 16, 11].forEach((z, i) => pen.line(p(u + 2.27, v + 3.25, z), p(u + 2.27 + [0.8, 0.55, 0.7][i], v + 3.25, z), tone("glass", "line"), { strokeWidth: 1.4, strokeOpacity: 0.85 }));
  },
  bars(pen, u, v, w, d) {
    pen.shadow(u + 0.3, v + 0.3, w - 0.6, d - 0.6);
    pen.box(u + 0.3, v + 0.3, w - 0.6, d - 0.6, 4);
    [10, 16, 12, 22].forEach((h, i) => pen.box(u + 0.55 + i * 0.5, v + 0.9, 0.32, 0.8, h, i === 3 ? "lit" : "steel", 4));
  },
  plinth(pen, u, v, w, d) {
    pen.shadow(u + 0.5, v + 0.5, w - 1, d - 1);
    pen.box(u + 0.5, v + 0.5, w - 1, d - 1, 5);
    pen.box(u + 0.95, v + 0.95, 0.7, 0.7, 9, "steel", 5);
  },
};

/** A stage has three drawings, by where it stands on its route. `u`, `v` is the corner of its platform. */
export const DRAW_STAGE: Record<SceneStage["shape"], (pen: Pen, u: number, v: number) => void> = {
  first(pen, u, v) {
    pen.shadow(u + 0.4, v + 0.4, 1.4, 1.4);
    pen.box(u + 0.4, v + 0.4, 1.4, 1.4, 22);
    pen.faceL(u + 0.4, v + 1.8, 1.4, 14, 18, "var(--blue3)");
    pen.box(u + 0.75, v + 0.75, 0.7, 0.7, 6, "lit", 22);
  },
  mid(pen, u, v) {
    pen.box(u + 0.5, v + 0.1, 0.36, 0.36, 28);
    pen.box(u + 0.5, v + 0.1, 0.36, 2.0, 5, "amber", 28);
    pen.box(u + 0.5, v + 1.74, 0.36, 0.36, 28);
  },
  last(pen, u, v) {
    pen.shadow(u + 0.45, v + 0.45, 1.3, 1.3);
    pen.box(u + 0.45, v + 0.45, 1.3, 1.3, 8, "teal");
    pen.box(u + 0.95, v + 0.95, 0.3, 0.3, 16, "steel", 8);
    pen.box(u + 0.82, v + 0.82, 0.56, 0.56, 5, "lit", 24);
  },
};

/** The gradients and the soft shadow every drawing here shades with. One per svg that draws a shape. */
export function AtlasDefs() {
  return (
    <defs>
      <linearGradient id="atlas-ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--atlas-ground-a)" /><stop offset="1" stopColor="var(--atlas-ground-b)" /></linearGradient>
      <radialGradient id="atlas-glow" cx=".5" cy=".42" r=".55"><stop offset="0" stopColor="var(--atlas-glow)" /><stop offset="1" stopColor="var(--atlas-glow)" stopOpacity="0" /></radialGradient>
      <linearGradient id="atlas-shade-left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--atlas-shine)" stopOpacity=".09" /><stop offset="1" stopColor="var(--atlas-shade)" stopOpacity=".2" /></linearGradient>
      <linearGradient id="atlas-shade-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--atlas-shade)" stopOpacity=".04" /><stop offset="1" stopColor="var(--atlas-shade)" stopOpacity=".28" /></linearGradient>
      <linearGradient id="atlas-shade-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--atlas-shine)" stopOpacity=".16" /><stop offset=".6" stopColor="var(--atlas-shine)" stopOpacity="0" /></linearGradient>
      <linearGradient id="atlas-bay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--atlas-bay-a)" /><stop offset="1" stopColor="var(--atlas-bay-b)" /></linearGradient>
      <filter id="atlas-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
    </defs>
  );
}
