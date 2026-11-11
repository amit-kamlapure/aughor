// @vitest-environment jsdom

/**
 * The Business Atlas — one connection's ontology drawn as a business.
 *
 * What these pin: an entity is shaped by what a DEPLOYED package says it does and by nothing else, so one it did not
 * match is drawn plain and the Atlas says how many are; a connection with no declared process shows an empty route
 * that says so, rather than an invented one; a process's stages carry the counts the door returned, exactly; a select
 * opens the shell's inspector on that thing; and the entities are still drawn when the processes could not be read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/lib/testing";
import userEvent from "@testing-library/user-event";

import type { ProcessesAndRules, TypeMap } from "@/lib/objectTypes";

const inspect = vi.fn();
vi.mock("@/components/shell/Inspector", async (orig) => ({
  ...(await orig<typeof import("@/components/shell/Inspector")>()),
  useInspector: () => ({ subject: null, inspect, close: vi.fn() }),
}));

const entity = (id: string, name: string, rows: number | null, said: string[] = [], pack = "") => ({
  object_type: id.toLowerCase(), id, display_name: name, role: "business_object", domain: "", key: "id", key_verified: true,
  rows, table: id.toLowerCase() + "s", links: 0, pack_roles: said, pack_object: pack ? id : "", pack,
});
const link = (from: string, to: string, verb: string) => ({ relationship: `${from}_${to}`, from, to, name: "", reverse_name: "", business_name: verb, verb, cardinality: "N:1", measured: true, traversable: true });
const served: { map: TypeMap; declared: ProcessesAndRules | "fails" } = { map: {} as TypeMap, declared: { processes: [], rules: [] } };
vi.mock("@/lib/objectTypes", async (orig) => ({
  ...(await orig<typeof import("@/lib/objectTypes")>()),
  getTypeMap: async () => served.map,
  getProcesses: async () => { if (served.declared === "fails") throw new Error("no door"); return served.declared; },
}));

import { BusinessAtlas } from "@/components/ontology/BusinessAtlas";

const MAP = {
  connection_id: "c1", schema_name: "s", generated_at: "",
  object_types: [entity("Order", "Order", 500, ["transaction"], "shop"), entity("Depot", "Depot", 3, ["place"], "shop"),
    entity("Buyer", "Buyer", 120, ["party"], "shop"), entity("Note", "Note", null)],
  links: [link("order", "buyer", "placed by"), link("order", "depot", "sent from")],
} as unknown as TypeMap;
const stage = (name: string, reached: number, overdue = 0) => ({
  name, display_name: name, anchor: { timestamp: `${name}_at` }, reached, share: reached / 500, verified: true, note: "", transition: null,
  promise: overdue ? { name: "on time", open_overdue: overdue, breached: 4, kept: 6, reached: 10, open: overdue, breach_rate: 0.4, as_of: "2026-01-01", note: "said" } : null,
});
const PROCESS = {
  processes: [{ id: "fulfil", display_name: "Fulfilment", entity: "order", entity_id: "Order", objects: 500, stages: [stage("placed", 500), stage("sent", 321, 17)],
    observed: [{ from_stage: "placed", to_stage: "sent", declared: true, objects: 321 }], leaves: { property: "status", values: ["Void"], left: 40, missing: [], unknown: 0, note: "" } }],
  rules: [],
} as unknown as ProcessesAndRules;

const drawn = () => waitFor(() => expect(screen.getByTestId("business-atlas").querySelector("svg")).toBeTruthy());
const shapes = () => Object.fromEntries([...screen.getByTestId("business-atlas").querySelectorAll("[data-shape]")].map((g) => [g.getAttribute("data-name"), g.getAttribute("data-shape")]));

beforeEach(() => { inspect.mockClear(); served.map = MAP; served.declared = { processes: [], rules: [] }; });

describe("the Business Atlas", () => {
  it("shapes each entity by what a deployed package says it does, and says how many it drew plain", async () => {
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(shapes()).toEqual({ Order: "hub", Depot: "site", Buyer: "cluster", Note: "plinth" });
    expect(screen.getByTestId("atlas-plain-said").textContent).toBe("1 of 4 entities are drawn as the plain block: nobody has chosen a shape for them and no deployed package names them.");
    expect(screen.getByText("500")).toBeTruthy();                    // a count exactly as the door gave it
  });

  it("says no package is deployed when none says what any entity is", async () => {
    served.map = { ...MAP, object_types: MAP.object_types.map((t) => ({ ...t, pack_roles: [], pack: "", pack_object: "" })) };
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(new Set(Object.values(shapes()))).toEqual(new Set(["plinth"]));
    expect(screen.getByTestId("atlas-plain-said").textContent).toContain("Nothing says what these entities are yet");
    expect(screen.getByTestId("atlas-plain-said").textContent).toContain("Open an entity and choose its shape, or deploy a package that names them.");
  });

  it("shows an empty route that says so where no process is declared, never an invented one", async () => {
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(screen.getByTestId("atlas-no-process").textContent).toBe("No process is declared on this ontology");
    expect(screen.queryByText("placed")).toBeNull();
  });

  it("draws a declared process as a route: its stages with their counts, the move, the exit and what is past a promise", async () => {
    served.declared = PROCESS;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(screen.queryByTestId("atlas-no-process")).toBeNull();
    expect(shapes().Order).toBeUndefined();                          // what goes through the process is its route
    for (const said of ["placed", "sent"]) expect(screen.getByText(said)).toBeTruthy();
    expect(screen.getByRole("button", { name: "17 overdue" })).toBeTruthy();
    // and written on the ground, where it is read without pointing at anything
    const written = [...screen.getByTestId("business-atlas").querySelectorAll("text.aug-atlas-written")].map((x) => x.textContent);
    expect(written).toEqual(expect.arrayContaining(["01  placed  500", "02  sent  321", "17 overdue", "40 Void", "Order"]));
    expect(screen.getAllByText("321")).toHaveLength(2);              // reached the stage, and moved to it
    expect(screen.getByText(/left · Void/).textContent).toBe("40 left · Void");
    expect(screen.getByText(/moved/).textContent).toBe("321 moved");
  });

  it("writes each entity's name on the ground, and shows its flag only while it is pointed at", async () => {
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const atlas = screen.getByTestId("business-atlas");
    expect([...atlas.querySelectorAll("text.aug-atlas-written.is-entity")].map((t) => t.textContent).sort()).toEqual(["Buyer", "Depot", "Note", "Order"]);                 // the name alone: how many is on the label
    expect(atlas.querySelector("text.aug-atlas-written.is-zone")?.textContent).toBe("OTHER");   // the zone is written on its ground too
    // every flag is tucked to its mark, which stays the control a keyboard and a screen reader reach
    const mark = screen.getByRole("button", { name: "Depot" }).closest(".aug-atlas-mark")!;
    expect(atlas.querySelectorAll(".aug-atlas-mark.is-tucked").length).toBe(4);
    expect(mark.classList.contains("is-over")).toBe(false);
    await userEvent.hover(atlas.querySelector('g[data-name="Depot"]')!);                       // pointing at the structure shows its flag
    expect(mark.classList.contains("is-over")).toBe(true);
    await userEvent.unhover(atlas.querySelector('g[data-name="Depot"]')!);
    expect(mark.classList.contains("is-over")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Depot" }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:entity:Depot" }));
  });

  it("keeps one row of controls above the scene and nothing else between the reader and it", async () => {
    served.declared = PROCESS;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const atlas = screen.getByTestId("business-atlas"), head = atlas.querySelector(".aug-atlas-head")!, stage = atlas.querySelector(".aug-atlas-stage")!;
    expect(head.nextElementSibling).toBe(stage);                                                // the scene comes straight after the row
    for (const id of ["atlas-zoom-in", "atlas-zoom-out", "atlas-zoom-fit"]) expect(head.contains(screen.getByTestId(id))).toBe(true);
    expect(head.contains(screen.getAllByTestId("atlas-flat")[0])).toBe(true);
    expect(screen.queryByTestId("atlas-story")).toBeNull();
  });

  it("draws each link flat, around the outside of the plane, raised and flat", async () => {
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const atlas = screen.getByTestId("business-atlas");
    const lines = () => [...atlas.querySelectorAll("polyline.aug-atlas-link")].map((x) => (x.getAttribute("points") ?? "").split(" ").length);
    expect(lines()).toHaveLength(2);                                                            // Order to Buyer, Order to Depot
    expect(lines().every((corners) => corners >= 4)).toBe(true);                                // out, along, back in: never one straight stroke across
    expect(atlas.querySelector(".aug-atlas-arc")).toBeNull();
    await userEvent.click(screen.getAllByTestId("atlas-flat")[0]);
    expect(lines()).toHaveLength(2);
  });

  it("opens the inspector on what is selected, with why it is drawn as it is", async () => {
    served.declared = PROCESS;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    await userEvent.click(screen.getByRole("button", { name: /Depot/ }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:entity:Depot", kind: "Entity", title: "Depot" }));
    await userEvent.click(screen.getByRole("button", { name: "17 overdue" }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:promise:fulfil:on time", kind: "Promise" }));
    await userEvent.click(screen.getByRole("button", { name: /sent/ }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:stage:fulfil:sent", kind: "Stage" }));
  });

  it("selects on a press — the thing, its links and its label lit — and opens its page only from the label's way in", async () => {
    served.declared = PROCESS;
    const onOpenEntity = vi.fn(), onOpenProcess = vi.fn();
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" onOpenEntity={onOpenEntity} onOpenProcess={onOpenProcess} />);
    await drawn();
    const atlas = screen.getByTestId("business-atlas");
    await userEvent.click(atlas.querySelector('g[data-name="Depot"]')!);                        // a press on the structure selects it
    expect(onOpenEntity).not.toHaveBeenCalled();
    expect(atlas.querySelector('g[data-name="Depot"]')!.classList.contains("is-picked")).toBe(true);
    expect(atlas.querySelectorAll("polyline.aug-atlas-link.is-picked")).toHaveLength(1);        // its link to the order is lit
    const flag = screen.getByRole("button", { name: /Depot/ });
    expect(within(flag).getByTestId("atlas-go").textContent).toBe("›");                         // the label carries the way in
    await userEvent.click(flag);
    expect(onOpenEntity).toHaveBeenLastCalledWith("depot");                                     // the entity's own name, as its page is opened by
    await userEvent.click(atlas.querySelector('g[data-stage="sent"]')!);                        // a stage selects the same way
    expect(onOpenProcess).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /sent/ }));
    expect(onOpenProcess).toHaveBeenLastCalledWith("fulfil");
    await userEvent.click(atlas.querySelector(".aug-atlas-world svg")!);                        // the open ground lets go
    expect(screen.queryByTestId("atlas-go")).toBeNull();
    expect(inspect).not.toHaveBeenCalled();                                                     // and no side panel, ever
  });

  it("draws the same scene flat: the same labels, the same counts, the same selection", async () => {
    served.declared = PROCESS;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const said = (root: Element) => [...root.querySelectorAll(".aug-atlas-board")].map((b) => b.textContent).sort();
    const raised = said(screen.getByTestId("business-atlas"));
    await userEvent.click(screen.getAllByTestId("atlas-flat")[0]);   // the control draws each label twice, for its two states
    const flat = screen.getByTestId("atlas-flat-scene");
    expect(said(flat)).toEqual(raised);
    expect(Object.fromEntries([...flat.querySelectorAll("[data-shape]")].map((g) => [g.getAttribute("data-name"), g.getAttribute("data-shape")]))).toEqual({ Depot: "site", Buyer: "cluster", Note: "plinth" });
    await userEvent.click(screen.getByRole("button", { name: "17 overdue" }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:promise:fulfil:on time" }));
  });

  it("draws a part under its parent: no structure of its own, and its parent says how many it has", async () => {
    served.map = { ...MAP, object_types: [
      ...MAP.object_types.map((t) => (t.id === "Depot" ? { ...t, parts: [{ object_type: "bay", display_name: "Bay", binding: "bays", kind: "detail" }] } : t)),
      { ...entity("Bay", "Bay", 40), absorbed_into: "depot" },
    ] } as unknown as TypeMap;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(Object.keys(shapes()).sort()).toEqual(["Buyer", "Depot", "Note", "Order"]);
    expect(screen.getByTestId("atlas-parts").textContent).toBe("+1 part");
    await userEvent.click(screen.getByRole("button", { name: /Depot/ }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:entity:Depot" }));
  });

  it("says the entity a route is of, with its parts, since it has no structure to say them on", async () => {
    served.declared = PROCESS;
    served.map = { ...MAP, object_types: [
      ...MAP.object_types.map((t) => (t.id === "Order" ? { ...t, parts: [{ object_type: "line", display_name: "Line", binding: "lines", kind: "detail" }] } : t)),
      { ...entity("Line", "Line", 900), absorbed_into: "order" },
    ] } as unknown as TypeMap;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(shapes().Line).toBeUndefined();
    expect(screen.getByTestId("atlas-route-entity").textContent).toBe("Order +1 part");
    await userEvent.click(screen.getByTestId("atlas-route-entity"));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:entity:Order", kind: "Entity" }));
  });

  it("writes each process's name along its leg, and says where the journey starts and ends, raised and flat", async () => {
    served.declared = PROCESS;
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const atlas = screen.getByTestId("business-atlas");
    expect(atlas.querySelector("text.aug-atlas-written.is-route")?.textContent).toBe("Fulfilment");
    expect(screen.getByTestId("atlas-route-start").textContent).toBe("starts");
    expect(screen.getByTestId("atlas-route-entity").textContent).toBe("Order");
    expect(screen.getByRole("button", { name: /sent/ }).textContent).toContain("ends");      // the last stage says so
    expect(atlas.querySelectorAll(".aug-atlas-cap").length).toBe(2);
    await userEvent.click(screen.getAllByTestId("atlas-flat")[0]);
    expect(atlas.querySelector(".aug-atlas-flat-lane .name")?.textContent).toBe("Fulfilment");
    expect(screen.getByTestId("atlas-route-start").textContent).toBe("starts");
    expect(atlas.querySelectorAll(".aug-atlas-cap").length).toBe(2);
  });

  it("zooms in, out and back to the whole scene without changing what is selected", async () => {
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    const pane = () => screen.getByTestId("atlas-pane");
    expect(pane().getAttribute("data-zoom")).toBe("1.20");   // it opens a little closer than the whole scene
    expect(screen.getByTestId("atlas-zoom-out")).toBeEnabled();
    await userEvent.click(screen.getByTestId("atlas-zoom-in"));
    await userEvent.click(screen.getByTestId("atlas-zoom-in"));
    expect(pane().getAttribute("data-zoom")).toBe("2.35");
    await userEvent.click(screen.getByTestId("atlas-zoom-out"));
    expect(pane().getAttribute("data-zoom")).toBe("1.68");
    expect(inspect).not.toHaveBeenCalled();                 // a zoom control selects nothing under it
    await userEvent.click(screen.getByTestId("atlas-zoom-fit"));
    expect(pane().getAttribute("data-zoom")).toBe("1.00");   // Fit is still the whole scene
    expect(screen.getByTestId("atlas-zoom-out")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Depot/ }));
    expect(inspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: "atlas:entity:Depot" }));
  });

  it("still draws the entities when the processes could not be read", async () => {
    served.declared = "fails";
    render(<BusinessAtlas connectionId="c1" schema="s" title="shop" />);
    await drawn();
    expect(Object.keys(shapes())).toHaveLength(4);
    expect(screen.getByTestId("atlas-no-process")).toBeTruthy();
  });
});
