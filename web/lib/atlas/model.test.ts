import { describe, expect, it } from "vitest";

import type { ProcessesAndRules, TypeMap } from "@/lib/objectTypes";
import { modelOf } from "./model";

/** ON-7 — a part is read under its parent. The Atlas folds the PICTURE the way the entity map does; the part stays an
 *  entity everywhere else. */
const row = (id: string, name: string, extra: object = {}) => ({
  object_type: id.toLowerCase(), id, display_name: name, role: "business_object", domain: "", key: "id", key_verified: true, rows: 10, table: id.toLowerCase(), links: 0, ...extra,
});
const link = (from: string, to: string, verb: string, shown: object = {}) => ({ relationship: `${from}_${to}`, from, to, name: "", reverse_name: "", business_name: verb, verb, cardinality: "N:1", measured: true, traversable: true, ...shown });
const MAP = {
  connection_id: "c", schema_name: "s", generated_at: "",
  object_types: [
    row("Order", "Order", { parts: [{ object_type: "payment", display_name: "Payment", binding: "payments", kind: "static" }, { object_type: "shipment", display_name: "Shipment", binding: "shipments", kind: "static" }] }),
    row("Payment", "Payment", { absorbed_into: "order" }), row("Shipment", "Shipment", { absorbed_into: "order" }),
    row("Warehouse", "Warehouse"), row("Customer", "Customer"),
  ],
  links: [
    link("payment", "order", "settles", { shown_from: "order", shown_to: "order" }),
    link("shipment", "warehouse", "dispatched from", { shown_from: "order", shown_to: "warehouse" }),
    link("order", "customer", "placed by"),
  ],
} as unknown as TypeMap;

describe("the Atlas model of a connection's ontology", () => {
  const model = modelOf("shop", MAP, { processes: [], rules: [] } as unknown as ProcessesAndRules);

  it("draws no structure for a part, and names it on its parent", () => {
    expect(model.entities.map((e) => e.id)).toEqual(["Order", "Warehouse", "Customer"]);
    expect(model.entities.find((e) => e.id === "Order")!.parts).toEqual(["Payment", "Shipment"]);
    expect(model.entities.find((e) => e.id === "Warehouse")!.parts).toEqual([]);
  });

  it("draws a part's link from its parent, and drops the one that now joins the parent to itself", () => {
    // the link a part carries says which part: the Atlas reads the entity's own links before its parts'
    expect(model.links).toEqual([{ a: "Order", b: "Warehouse", verb: "dispatched from", part: expect.any(String) }, { a: "Order", b: "Customer", verb: "placed by" }]);
  });

  it("uses a person's choice of shape before a package's word, and reads what the entity is from the shape", () => {
    const chosen = modelOf("shop", { ...MAP, object_types: MAP.object_types.map((t) => (t.id === "Warehouse"
      ? { ...t, drawn_as: "depot", pack_roles: ["asset"], pack: "p", pack_object: "Store", pack_drawn_as: "" } : t)) } as unknown as TypeMap, null);
    expect(chosen.entities.find((e) => e.id === "Warehouse")).toMatchObject({ roles: ["place"], drawn_as: "depot", chosen: true, said_by: undefined });
    const unknown = modelOf("shop", { ...MAP, object_types: MAP.object_types.map((t) => (t.id === "Warehouse" ? { ...t, drawn_as: "no-such-shape" } : t)) } as unknown as TypeMap, null);
    expect(unknown.entities.find((e) => e.id === "Warehouse")!.chosen).toBeUndefined();       // a shape nobody draws is no choice
  });

  it("reads an older door that names no drawn ends as it always did", () => {
    const plain = modelOf("shop", { ...MAP, object_types: MAP.object_types.filter((t) => !t.absorbed_into), links: [link("order", "customer", "placed by")] } as unknown as TypeMap, null);
    expect(plain.links).toEqual([{ a: "Order", b: "Customer", verb: "placed by" }]);
    expect(plain.processes).toEqual([]);
  });
});
