import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compose, roleOf, shapeOf, SHAPES, type AtlasModel } from "./compose";

/** Four businesses with nothing in common but the vocabulary: what each entity does, how they link, what a process's
 *  stages are. The composer must draw all four with one code path, and must not know any of their words. */
const commerce: AtlasModel = {
  title: "A shop", measured: true,
  entities: [
    { id: "Order", name: "Customer Order", roles: ["transaction"], count: 125136 },
    { id: "OrderItem", name: "Order Line", roles: ["event"], count: 181610 },
    { id: "User", name: "Customer", roles: ["party"], count: 100000 },
    { id: "Product", name: "Product", roles: ["catalog"], count: 29120 },
    { id: "InventoryItem", name: "Inventory Item", roles: ["stock"], count: 490318 },
    { id: "DistributionCenter", name: "Distribution Center", roles: ["place"], drawn_as: "depot", count: 10 },
    { id: "Event", name: "Business Event", roles: ["event"], count: null },
    { id: "Case", name: "Case", roles: [], count: null },
  ],
  links: [
    { a: "OrderItem", b: "Order", verb: "belongs to" }, { a: "Order", b: "User", verb: "placed by" },
    { a: "OrderItem", b: "Product", verb: "of product" }, { a: "OrderItem", b: "InventoryItem", verb: "fulfilled by" },
    { a: "InventoryItem", b: "DistributionCenter", verb: "stored at" }, { a: "Event", b: "User", verb: "performed by" },
  ],
  processes: [{
    id: "order_fulfilment", name: "Order Fulfilment", entity: "Order", measured: true,
    stages: [
      { key: "placed", label: "placed", reached: 125136 },
      { key: "shipped", label: "shipped", reached: 81463, moved: 81463, past: { key: "dispatch", count: 24994 } },
      { key: "delivered", label: "delivered", reached: 43884, moved: 43884, past: { key: "delivery", count: 37579 } },
      { key: "returned", label: "returned", reached: 12604, moved: 12604 },
    ],
    exit: { key: "exit", count: 18679, label: "Cancelled" },
  }],
};
const subscriptions: AtlasModel = {
  title: "A software business", measured: false,
  entities: [
    { id: "Account", name: "Account", roles: ["party"] }, { id: "Contact", name: "Contact", roles: ["party"] },
    { id: "Opportunity", name: "Opportunity", roles: ["transaction"] }, { id: "Subscription", name: "Subscription", roles: ["asset"] },
    { id: "Plan", name: "Plan", roles: ["catalog"] }, { id: "Invoice", name: "Invoice", roles: ["transaction"] },
    { id: "Seat", name: "Seat", roles: ["asset"] }, { id: "Ticket", name: "Ticket", roles: ["event"] },
    { id: "Signup", name: "Signup", roles: ["event"] },
  ],
  links: [
    { a: "Contact", b: "Account", verb: "N:1" }, { a: "Subscription", b: "Account", verb: "N:1" }, { a: "Subscription", b: "Plan", verb: "N:1" },
    { a: "Invoice", b: "Subscription", verb: "N:1" }, { a: "Seat", b: "Subscription", verb: "N:1" }, { a: "Ticket", b: "Account", verb: "N:1" },
    { a: "Signup", b: "Account", verb: "N:1" }, { a: "Opportunity", b: "Account", verb: "N:1" },
  ],
  processes: [
    { id: "trial_to_paid", name: "trial to paid", entity: "Signup", measured: false, stages: ["signed_up", "activated", "converted"].map((s) => ({ key: s, label: s })) },
    { id: "ticket_resolution", name: "ticket resolution", entity: "Ticket", measured: false, stages: ["opened", "first_response", "solved"].map((s) => ({ key: s, label: s })) },
  ],
};
const lending: AtlasModel = {
  title: "A bank", measured: false,
  entities: [
    { id: "Institution", name: "Institution", roles: ["party"] }, { id: "CallReport", name: "Call Report", roles: ["event"] },
    { id: "Customer", name: "Customer", roles: ["party"] }, { id: "DepositAccount", name: "Deposit Account", roles: ["asset"] },
    { id: "Loan", name: "Loan", roles: ["asset"] }, { id: "Transaction", name: "Transaction", roles: ["event", "transaction"] },
    { id: "Branch", name: "Branch", roles: ["place"] },
  ],
  links: [
    { a: "CallReport", b: "Institution", verb: "N:1" }, { a: "DepositAccount", b: "Customer", verb: "N:1" }, { a: "Loan", b: "Customer", verb: "N:1" },
    { a: "Transaction", b: "DepositAccount", verb: "N:1" }, { a: "DepositAccount", b: "Branch", verb: "N:1" },
  ],
  processes: [],
};
const flying: AtlasModel = {
  title: "An airline", measured: false,
  entities: [
    { id: "Flight", name: "Flight", roles: ["event", "transaction"] }, { id: "Carrier", name: "Carrier", roles: ["party"] },
    { id: "Airport", name: "Airport", roles: ["place"], drawn_as: "airfield" }, { id: "Aircraft", name: "Aircraft", roles: ["asset"] },
  ],
  links: [{ a: "Flight", b: "Carrier", verb: "N:1" }, { a: "Flight", b: "Aircraft", verb: "N:1" }, { a: "Flight", b: "Airport", verb: "N:1" }],
  processes: [],
};
/** Two processes joined by a link, an entity nearly everything links to, and an entity linked only to that one. */
const joined: AtlasModel = {
  title: "A shop with returns", measured: true,
  entities: [
    { id: "Sale", name: "Sale", roles: ["transaction"], domain: "Selling", count: 900 },
    { id: "Refund", name: "Refund", roles: ["transaction"], domain: "Service", count: 80 },
    { id: "Buyer", name: "Buyer", roles: ["party"], domain: "People", count: 300 },
    { id: "Tunic", name: "Tunic", roles: ["catalog"], domain: "Range", count: 50 },
    { id: "Shelf", name: "Shelf", roles: ["place"], domain: "Range", count: 4 },
    { id: "Advert", name: "Advert", roles: ["catalog"], domain: "Reach", count: 12 },
    { id: "Ledger", name: "Ledger", roles: ["asset"], domain: "Books", count: 3 },
    { id: "Channel", name: "Channel", roles: ["catalog"], domain: "Selling", count: 5 },
  ],
  links: [
    { a: "Sale", b: "Buyer", verb: "made by" }, { a: "Sale", b: "Tunic", verb: "of" }, { a: "Tunic", b: "Shelf", verb: "kept on" },
    { a: "Refund", b: "Sale", verb: "undoes" }, { a: "Refund", b: "Sale", verb: "sent back in", part: "Parcel" },
    ...["Sale", "Refund", "Buyer", "Tunic", "Advert"].map((a) => ({ a, b: "Channel", verb: "on" })),
  ],
  processes: [
    { id: "b_refund", name: "Refunding", entity: "Refund", measured: true, stages: [{ key: "claimed", label: "claimed", reached: 80 }, { key: "paid", label: "paid", reached: 78, moved: 78, days: 3 }] },
    { id: "a_sale", name: "Selling", entity: "Sale", measured: true, stages: [{ key: "made", label: "made", reached: 900 }, { key: "sent", label: "sent", reached: 850, moved: 850, days: 1 }], exit: { key: "x", count: 50, label: "void" } },
  ],
};
const ALL = { commerce, subscriptions, lending, flying };

const overlap = (a: { u: number; v: number; w: number; d: number }, b: typeof a) =>
  a.u < b.u + b.w && b.u < a.u + a.w && a.v < b.v + b.d && b.v < a.v + a.d;

describe("the Business Atlas composer", () => {
  it.each(Object.entries({ ...ALL, joined }))("places every entity of %s once, on the ground, on no other", (_, model) => {
    const scene = compose(model);
    const through = new Set(model.processes.map((p) => p.entity)), sliced = new Set(scene.filters.map((f) => f.entity));
    // every entity is drawn once: as a structure, as a record of activity, as the leg it goes through, or it is a filter
    expect([...scene.structures, ...scene.records].map((s) => s.entity).sort()).toEqual(model.entities.map((e) => e.id).filter((id) => !through.has(id) && !sliced.has(id)).sort());
    for (const r of scene.records) { expect(r.u).toBeGreaterThanOrEqual(0); expect(r.v).toBeGreaterThanOrEqual(0); expect(r.u).toBeLessThanOrEqual(scene.extent.u); expect(r.v).toBeLessThanOrEqual(scene.extent.v); }
    expect(new Set(scene.records.map((r) => `${r.u.toFixed(1)}:${r.v.toFixed(1)}`)).size).toBe(scene.records.length);    // none on another
    for (const s of [...scene.structures, ...scene.zones]) {
      expect(s.u).toBeGreaterThanOrEqual(0); expect(s.v).toBeGreaterThanOrEqual(0);
      expect(s.u + s.w).toBeLessThanOrEqual(scene.extent.u); expect(s.v + s.d).toBeLessThanOrEqual(scene.extent.v);
    }
    scene.structures.forEach((a, i) => scene.structures.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.name} on ${b.name}`).toBe(false)));
    scene.zones.forEach((a, i) => scene.zones.slice(i + 1).forEach((b) => expect(overlap(a, b), `zone ${a.name} on ${b.name}`).toBe(false)));
    // every structure and record stands inside its own zone, and no zone lies on the journey
    for (const s of scene.structures) { const z = scene.zones.find((x) => x.key === s.zone)!; expect(s.u >= z.u && s.v >= z.v && s.u + s.w <= z.u + z.w + 1e-9 && s.v + s.d <= z.v + z.d, s.name).toBe(true); }
    const pads = scene.lanes.flatMap((l) => l.stages.map((st) => ({ u: st.u - 1.1, v: st.v - 1.1, w: 2.2, d: 2.2, name: st.label })));
    pads.forEach((p) => scene.zones.forEach((z) => expect(overlap(p, z), `stage ${p.name} on ${z.name}`).toBe(false)));
  });

  it("gives the same scene for the same model, whatever order it arrives in", () => {
    for (const model of [commerce, joined]) {
      const shuffled: AtlasModel = { ...model, entities: [...model.entities].reverse(), links: [...model.links].reverse(), processes: [...model.processes].reverse() };
      const drawn = (m: AtlasModel) => { const sc = compose(m); return { ...sc, links: sc.links.map((l) => `${l.a}>${l.b}`).sort() }; };
      expect(drawn(shuffled)).toEqual(drawn(model));
    }
  });

  it("draws by role: a place is a site, and a shape asked for only refines the role it belongs to", () => {
    expect(shapeOf({ roles: ["place"] })).toBe("site");
    expect(shapeOf({ roles: ["place"], drawn_as: "depot" })).toBe("depot");
    expect(shapeOf({ roles: ["party"], drawn_as: "depot" })).toBe("cluster");      // a shape of another role is ignored
    expect(shapeOf({ roles: ["place"], drawn_as: "no-such-shape" })).toBe("site");
    expect(shapeOf({ roles: [] })).toBe("plinth");                             // a role nobody said is drawn plain
    expect(shapeOf({ roles: ["a-word-no-one-defined"] })).toBe("plinth");
    expect(roleOf(["event", "transaction"])).toBe("transaction");              // the most telling of several
    const by = Object.fromEntries(compose(lending).structures.map((s) => [s.entity, s.shape]));
    expect(by).toEqual({ Institution: "cluster", Customer: "cluster", DepositAccount: "units", Loan: "units", Transaction: "hub", Branch: "site" });
    expect(compose(lending).records.map((r) => r.entity)).toEqual(["CallReport"]);   // an event is marked, not built
  });

  it("makes a leg of each process with its stages in sequence, and one empty leg where none is declared", () => {
    const shop = compose(commerce);
    expect(shop.lanes).toHaveLength(1);
    expect(shop.lanes[0]).toMatchObject({ along: "u", process: "order_fulfilment" });
    expect(shop.lanes[0].stages.map((s) => [s.label, s.shape])).toEqual([["placed", "first"], ["shipped", "mid"], ["delivered", "mid"], ["returned", "last"]]);
    expect(shop.lanes[0].stages.map((s) => s.u)).toEqual([...shop.lanes[0].stages.map((s) => s.u)].sort((a, b) => a - b));
    expect(shop.lanes[0].moves.map((m) => m.count)).toEqual([81463, 43884, 12604]);
    expect(shop.lanes[0].exit).toMatchObject({ count: 18679, label: "Cancelled" });
    expect(shop.lanes[0].stages[1].past).toEqual({ key: "dispatch", count: 24994 });
    expect(shop.structures.some((s) => s.entity === "Order")).toBe(false);     // what goes through a process IS its leg
    for (const none of [compose(lending), compose(flying)]) expect(none.lanes).toEqual([expect.objectContaining({ process: null, stages: [] })]);
  });

  it("joins the processes into one journey where a link joins what goes through them, and turns instead of doubling back", () => {
    const scene = compose(joined);
    // Refunding follows Selling because a Refund links to a Sale — whatever order the processes arrive in
    expect(scene.lanes.map((l) => [l.process, l.along])).toEqual([["a_sale", "u"], ["b_refund", "v"]]);
    const [sell, refund] = scene.lanes;
    expect(refund.start).toEqual(sell.end);                                        // the second leg begins where the first ends
    expect(refund.stages.every((st) => st.u === sell.end[0] && st.v > sell.end[1])).toBe(true);
    // the entity's own link names the joint, not the one a part of it carries
    expect(scene.joints).toEqual([expect.objectContaining({ linked: true, verb: "undoes", before: "Sale", after: "Refund", count: 80 })]);
    expect(scene.joints[0].why).toContain("That measured link is what joins the two processes into one journey.");
    expect(sell.moves[0]).toMatchObject({ count: 850, days: 1 });
    expect(sell.exit!.to[1]).toBeGreaterThan(sell.start[1]);                        // what leaves does so into the corner
  });

  it("draws two processes nothing joins one after the other, and says no link joins them", () => {
    const scene = compose(subscriptions);
    expect(scene.lanes.map((l) => l.process)).toEqual(["ticket_resolution", "trial_to_paid"]);
    expect(scene.joints).toEqual([expect.objectContaining({ linked: false, verb: "" })]);
    expect(scene.joints[0].why).toContain("without a claim that one leads to the other");
  });

  it("stands each domain's entities in one zone, beside the leg they link to, and aside when they link to none", () => {
    const scene = compose(joined);
    const zone = Object.fromEntries(scene.zones.map((z) => [z.name, z]));
    expect(Object.keys(zone).sort()).toEqual(["Books", "People", "Range", "Reach"]);   // Selling and Service hold only what is on the journey or a filter
    expect(zone.People.leg).toBe("a_sale");
    expect(zone.Range.leg).toBe("a_sale");
    expect(zone.Books.leg).toBeNull();                                                // linked to nothing on the journey
    expect(zone.Books.why).toContain("so it stands aside");
    expect(zone.People.v + zone.People.d).toBeLessThan(scene.lanes[0].start[1]);      // behind the leg it stands beside
    expect(scene.structures.filter((s) => s.zone === "zone:Range").map((s) => s.entity).sort()).toEqual(["Shelf", "Tunic"]);
    const none = compose(lending);                                                    // no domain said: one zone for all
    expect(none.zones.map((z) => z.name)).toEqual(["Other"]);
  });

  it("offers an entity nearly everything links to as a filter, and says which entities are linked to nothing else", () => {
    const scene = compose(joined);
    expect(scene.filters).toEqual([expect.objectContaining({ entity: "Channel", name: "Channel", count: 5, linked: 5 })]);
    expect(scene.structures.some((s) => s.entity === "Channel")).toBe(false);
    expect(scene.links.some((l) => l.a === "Channel" || l.b === "Channel")).toBe(false);
    const loose = scene.structures.filter((s) => s.loose).map((s) => s.entity).sort();
    expect(loose).toEqual(["Advert", "Ledger"]);                                    // only the filter, and nothing at all
    expect(scene.structures.find((s) => s.entity === "Advert")!.why).toContain("It links to nothing but what everything is sliced by");
    expect(scene.structures.find((s) => s.entity === "Ledger")!.why).toContain("It links to no other entity");
    expect(compose(commerce).filters).toEqual([]);                                  // four links to one entity of eight is not "nearly everything"
  });

  it("says why each structure is drawn as it is and stands where it does", () => {
    const by = Object.fromEntries(compose(commerce).structures.map((s) => [s.entity, s.why]));
    expect(by.DistributionCenter).toBe("Drawn as a depot with docks because it is a place; one bay each. It stands in Other, 3 links from Customer Order; position is sequence, not geography.");
    expect(by.Case).toBe("Drawn as a plain plinth because nobody has chosen its shape and no deployed package says what it is. It links to no other entity, so the ontology does not yet say how it takes part.");
    // a person's choice is said as the reason, before any package's word
    const chose = compose({ ...lending, entities: lending.entities.map((e) => (e.id === "Loan" ? { ...e, roles: ["asset"], drawn_as: "vault", chosen: true, said_by: undefined } : e)) });
    expect(chose.structures.find((s) => s.entity === "Loan")).toMatchObject({ shape: "vault", why: expect.stringContaining("Drawn as a vault with rails because a person chose that shape for it.") });
    const told = compose({ ...lending, entities: lending.entities.map((e) => (e.id === "Loan" ? { ...e, said_by: "the lending package's Loan" } : e)) });
    expect(told.structures.find((s) => s.entity === "Loan")!.why).toContain("because it matches the lending package's Loan, an asset.");
  });

  it("links only what it placed, and a link to what goes through a process ends at its first stage", () => {
    const scene = compose(commerce), lane = scene.lanes[0];
    expect(scene.links).toHaveLength(commerce.links.length);
    const toOrder = scene.links.find((l) => l.a === "OrderItem" && l.b === "Order")!;
    expect(toOrder.to).toEqual([lane.stages[0].u, lane.stages[0].v]);
    const twice = compose({ ...commerce, links: [...commerce.links, commerce.links[0]] });
    expect(twice.links).toHaveLength(commerce.links.length);                    // a link said twice is one line
  });

  it("carries an entity's parts on its structure, in name order, and draws none of them", () => {
    const scene = compose({ ...lending, entities: lending.entities.map((e) => (e.id === "Loan" ? { ...e, parts: ["Repayment", "Collateral"] } : e)) });
    expect(scene.structures.find((s) => s.entity === "Loan")!.parts).toEqual(["Collateral", "Repayment"]);
    expect(scene.structures.find((s) => s.entity === "Branch")!.parts).toEqual([]);
    expect(scene.structures.length + scene.records.length).toBe(lending.entities.length);
  });

  it("marks a record of activity in its zone, never builds it, and draws its links to the mark", () => {
    const scene = compose(commerce);
    const line = scene.records.find((r) => r.entity === "OrderItem")!;
    expect(line.why).toBe("Marked, not built: its rows are records of activity, not things. It stands in Other, the domain the ontology gives it.");
    expect(scene.structures.some((s) => s.entity === "OrderItem" || s.entity === "Event")).toBe(false);
    expect(scene.links.filter((l) => l.a === "OrderItem" || l.b === "OrderItem").every((l) => [l.from, l.to].some((p) => p[0] === line.u && p[1] === line.v))).toBe(true);
    const z = scene.zones.find((x) => x.key === line.zone)!;
    expect(line.u > z.u && line.u < z.u + z.w && line.v > z.v && line.v < z.v + z.d).toBe(true);
  });

  it("copes with one entity and with none", () => {
    expect(compose({ title: "", measured: true, entities: [{ id: "A", name: "A", roles: [] }], links: [], processes: [] }).structures).toHaveLength(1);
    expect(compose({ title: "", measured: true, entities: [], links: [], processes: [] }).structures).toEqual([]);
  });

  it("names no business, package or entity in its own source — the reason one composer serves them all", () => {
    const source = readFileSync(fileURLToPath(new URL("./compose.ts", import.meta.url)), "utf8");
    const shapes = new Set(Object.keys(SHAPES));
    const exact = Object.values({ ...ALL, joined }).flatMap((m) => [...m.entities.flatMap((e) => [e.id, e.name]), ...m.processes.flatMap((p) => [p.id, p.name, ...p.stages.map((s) => s.key)])])
      .filter((w) => w.length >= 4 && !shapes.has(w));
    const anyCase = ["retail", "commerce", "saas", "software", "airline", "banking", "lending", "insurance", "manufactur", "logistics", "warehouse", "airport", "aircraft", "customer", "subscription", "invoice", "inventory", "thelook", "olist"];
    const found = [
      ...exact.filter((w) => new RegExp(`(?<![A-Za-z_])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z_])`).test(source)),
      ...anyCase.filter((w) => source.toLowerCase().includes(w)),
    ];
    expect(found).toEqual([]);
  });
});
