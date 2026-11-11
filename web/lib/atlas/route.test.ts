import { describe, expect, it } from "vitest";

import type { AtlasScene, SceneLane, SceneLink } from "./compose";
import { gutterOf, routesOf } from "./route";

const link = (a: string, b: string, from: [number, number], to: [number, number]): SceneLink => ({ a, b, verb: "v", from, to });
const lane = { process: "p", entity: "Trip", start: [1.2, 12], end: [30, 12] } as unknown as SceneLane;
const scene = (links: SceneLink[]): Pick<AtlasScene, "links" | "lanes"> => ({ links, lanes: [lane] });

describe("how the Atlas routes a link", () => {
  it("goes out to the nearer far edge, along a track outside the plane, and back in — every stretch along one axis", () => {
    const one = link("A", "B", [20, 4], [26, 6]);
    const path = routesOf(scene([one])).get(one)!;
    expect(path).toEqual([[20, 4], [20, -0.7], [26, -0.7], [26, 6]]);                  // both ends nearer the back edge
    const round = link("A", "C", [20, 4], [3, 18]);                                    // the other end is nearer the left edge
    expect(routesOf(scene([round])).get(round)).toEqual([[20, 4], [20, -0.7], [-0.7, -0.7], [-0.7, 18], [3, 18]]);
    for (const p of [path, routesOf(scene([round])).get(round)!]) {
      p.slice(1).forEach((q, i) => expect(q[0] === p[i][0] || q[1] === p[i][1]).toBe(true));
      // nothing between the first and last corner is inside the plane
      expect(p.slice(1, -1).every((q) => q[0] < 0 || q[1] < 0)).toBe(true);
    }
  });

  it("gives each link a track of its own, so no two run along the same line outside the plane", () => {
    const links = [link("A", "B", [20, 4], [26, 6]), link("C", "D", [22, 5], [28, 3]), link("E", "F", [2, 9], [3, 20])];
    const routes = routesOf(scene(links)), tracks = links.map((l) => routes.get(l)![1]);
    expect(tracks.map((q) => +Math.min(q[0], q[1]).toFixed(2))).toEqual([-0.7, -1.02, -1.34]);
    expect(gutterOf(scene(links))).toBeCloseTo(0.7 + 2 * 0.32 + 0.5);
    expect(gutterOf(scene([]))).toBe(0);
  });

  it("joins what goes through the first leg at the leg's start, and lays links that share an end side by side", () => {
    const a = link("A", "Trip", [20, 4], [9, 12]), b = link("B", "Trip", [3, 20], [9, 12]);
    const routes = routesOf(scene([a, b]));
    const [endA, endB] = [routes.get(a)!.at(-1)!, routes.get(b)!.at(-1)!];
    expect(endA[0]).toBe(1.2); expect(endB[0]).toBe(1.2);                              // the leg's start, not its first stage
    expect(endA[1]).not.toBe(endB[1]);                                                 // side by side, not one on the other
    expect((endA[1] + endB[1]) / 2).toBeCloseTo(12);
  });
});
