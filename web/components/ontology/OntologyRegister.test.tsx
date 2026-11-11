// @vitest-environment jsdom
/**
 * The Ontology's register and its review queue (2026-11-10; the user's "Yes, build it" to the redesign mockup): object
 * types as one readable table grouped by kind, parts apart, processes and rules under it, what waits for a person above
 * it — and one review queue for the explorer's proposals, keys not counted and links said twice. Held on theLook's
 * shapes, including the two links it declares twice.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { describe, expect, it, vi } from "vitest";

import { OntologyRegister, OntologyReview, duplicateLinks } from "./OntologyRegister";
import type { OntologyDraft, TypeMap, TypeMapLink, TypeMapRow } from "@/lib/objectTypes";

const type = (object_type: string, display_name: string, over: Partial<TypeMapRow> = {}): TypeMapRow => ({
  object_type, id: object_type, display_name, role: "business_object", domain: "Commerce", key: "id", key_verified: true,
  rows: 100, table: object_type, display_property: "", display_is_key: true, properties: 3, bindings: 1, proposed_bindings: 0,
  links: 1, traversable_links: 1, actions: 0, metrics: 0, origin: "table", ...over,
});
const link = (from: string, to: string, verb: string, origin: TypeMapLink["origin"]): TypeMapLink => ({
  relationship: `${from}_${verb}_${to}_${origin}`, from, to, name: verb, reverse_name: "", business_name: verb, verb,
  cardinality: "N:1", measured: true, traversable: true, origin,
});
const MAP: TypeMap = {
  connection_id: "c1", schema_name: "thelook", generated_at: "",
  object_types: [
    type("order", "Customer Order", { table: "orders", rows: 125136, key: "order_id", key_verified: null, links: 3, actions: 2, metrics: 1 }),
    type("user", "Customer", { table: "users", rows: 100000, unconfirmed: 1 }),
    type("order_item", "Order Line", { table: "order_items", rows: 181610, absorbed_into: "order", role: "event" }),
    type("product", "Product", { table: "products", rows: 29120, role: "reference_data" }),
  ],
  links: [link("order", "user", "placed by", "join_map"), link("order", "user", "placed by", "human"), link("order_item", "product", "is for", "join_map")],
  processes: [{ id: "order_fulfilment", display_name: "Order Fulfilment", entity: "order", origin: "human", verified: true, objects: 125136,
    stages: ["placed", "shipped", "delivered", "returned"],
    promises: [{ stage: "shipped", name: "dispatch", breach_rate: 0.168, verified: true, flags: 0 }] }],
  rules: [{ id: "completed_orders", display_name: "Completed orders", entity: "order", kind: "value_set", origin: "human",
    verified: true, admitted: 31280, objects: 125136, flags: 0 }],
};
const DRAFT: OntologyDraft = {
  connection_id: "c1", schema_name: "thelook", runs: [{ at: "", provenance: "model:x", fallback: false } as never],
  proposals: [
    { key: "part:User:events", kind: "part", tier: "proposed", sentence: "events is a part of User", note: "79,800 distinct over 1,297,772 rows",
      reason: "", provenance: "", target: { entity: "user", binding: "events" }, object_type: "user" },
    { key: "link_name:x", kind: "link_name", tier: "proposed", sentence: "OrderItem belongs_to Order", note: "",
      reason: "order_items.order_id points back at the order", provenance: "", target: { relationship: "x" }, object_type: "order_item" },
    { key: "rule:y", kind: "rule", tier: "refused", sentence: "returned_orders on Order", note: "Order already has a segment returned_orders",
      reason: "", provenance: "", target: { rule: "y" }, object_type: "" },
  ],
  counts: { proposed: 2, confirmed: 7, refused: 1, released: 0, withdrawn: 0 }, grouping: {},
};

describe("the register", () => {
  it("lists the entities by kind, parts apart, each row's key, source and what uses it", () => {
    const onOpen = vi.fn();
    render(<Theme><OntologyRegister map={MAP} draft={DRAFT} onOpen={onOpen} onOpenProcess={vi.fn()} onReview={vi.fn()} declareDoor={null} /></Theme>);
    expect(screen.getByTestId("ontology-tally")).toHaveTextContent("3entities");
    expect(within(screen.getByTestId("ontology-group-business_object")).getAllByTestId("ontology-type-row").map(r => r.textContent))
      .toEqual([expect.stringContaining("Customer Order"), expect.stringContaining("Customer")]);
    expect(within(screen.getByTestId("ontology-group-reference_data")).getByTestId("ontology-type-row")).toHaveTextContent("Product");
    expect(within(screen.getByTestId("ontology-group-parts")).getByTestId("ontology-type-row")).toHaveTextContent("part of Customer Order");
    const order = screen.getAllByTestId("ontology-type-row")[0];
    for (const said of ["125,136", "order_id · not counted", "orders", "Order Fulfilment · 4 stages", "1 metric · 2 actions"]) {
      expect(order).toHaveTextContent(said);
    }
    expect(screen.getAllByTestId("ontology-type-row")[1]).toHaveTextContent("1 proposed");
    fireEvent.click(order);
    expect(onOpen).toHaveBeenCalledWith("order");
  });

  it("does not repeat what waits for a person: that is the Review view's", () => {
    render(<Theme><OntologyRegister map={MAP} draft={DRAFT} onOpen={vi.fn()} onOpenProcess={vi.fn()} declareDoor={null} /></Theme>);
    for (const id of ["ontology-needs", "needs-draft", "needs-key", "needs-twice"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getAllByTestId("ontology-type-row")[1]).toHaveTextContent("1 proposed");      // a row still says what is proposed on it
  });

  it("opens on what leads it, with its two tables folded until one is asked for", () => {
    render(<Theme><OntologyRegister map={MAP} lead={<div data-testid="the-lead">the picture</div>} onOpen={vi.fn()} onOpenProcess={vi.fn()} declareDoor={null} /></Theme>);
    const page = screen.getByTestId("ontology-register");
    expect(page.firstElementChild).toBe(screen.getByTestId("the-lead"));                        // the picture is the first thing on the page
    expect(screen.getByTestId("ontology-types")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("ontology-declarations")).toHaveAttribute("data-open", "false");
    expect(screen.queryAllByTestId("ontology-type-row")).toHaveLength(0);
    expect(screen.getByTestId("ontology-types")).toHaveTextContent("3 entities · 1 part");      // folded, it still says how many
    fireEvent.click(within(screen.getByTestId("ontology-types")).getByRole("button", { name: /Show/ }));
    expect(screen.getByTestId("ontology-types")).toHaveAttribute("data-open", "true");
    expect(screen.getAllByTestId("ontology-type-row").length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByTestId("ontology-declarations")).getByRole("button", { name: /Show/ }));
    expect(screen.getByTestId("ontology-process-row")).toBeTruthy();
  });

  it("lists the processes with their promises and the rules with what they admit", () => {
    const onOpenProcess = vi.fn();
    render(<Theme><OntologyRegister map={MAP} draft={null} onOpen={vi.fn()} onOpenProcess={onOpenProcess} onReview={vi.fn()} declareDoor={null} /></Theme>);
    const process = screen.getByTestId("ontology-process-row");
    expect(process).toHaveTextContent("placed → shipped → delivered → returned");
    expect(process).toHaveTextContent("dispatch broken 16.8%");
    expect(screen.getByTestId("ontology-rule-row")).toHaveTextContent("31,280 of 125,136");
    fireEvent.click(process);
    expect(onOpenProcess).toHaveBeenCalledWith("order_fulfilment");
  });
});

describe("the review queue", () => {
  it("lists what waits, with what the data says and why, and confirms one or all", async () => {
    const confirm = vi.fn(async () => {});
    const onOpen = vi.fn();
    render(<Theme><OntologyReview map={MAP} draft={DRAFT} explore={vi.fn(async () => {})} confirm={confirm} onOpen={onOpen} /></Theme>);
    expect(screen.getByTestId("ontology-review-counts")).toHaveTextContent("2 proposed · 7 confirmed · 1 refused");
    const rows = screen.getAllByTestId("ontology-proposal");
    expect(rows).toHaveLength(2);                                           // waiting, by default
    expect(rows[0]).toHaveTextContent("79,800 distinct over 1,297,772 rows");
    expect(rows[1]).toHaveTextContent("order_items.order_id points back at the order");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Confirm" }));
    expect(confirm).toHaveBeenCalledWith({ targets: [{ kind: "binding", entity: "user", binding: "events" }] });
    // while one confirm is in flight every door waits (no double write); then Confirm all
    await waitFor(() => expect(screen.getByTestId("ontology-confirm-all")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("ontology-confirm-all"));
    expect(confirm).toHaveBeenCalledWith({ all: true });
    expect(screen.getByTestId("ontology-draft-again")).toHaveTextContent("1 model call");
    // also waiting: the key nobody counted, and the link said twice
    expect(screen.getByTestId("ontology-review-key")).toHaveTextContent("What identifies one Customer Order?");
    expect(screen.getByTestId("ontology-review-twice")).toHaveTextContent("Customer Order — placed by → Customer");
    expect(screen.getByTestId("ontology-review-twice")).toHaveTextContent("found in the joins · by a person");
  });

  it("says a refused proposal with why, under Refused", () => {
    render(<Theme><OntologyReview map={MAP} draft={DRAFT} onOpen={vi.fn()} /></Theme>);
    fireEvent.click(screen.getByRole("radio", { name: /^Refused/ }));
    const rows = screen.getAllByTestId("ontology-proposal");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Order already has a segment returned_orders");
  });
});

describe("duplicateLinks", () => {
  it("finds a verb said twice between the same two types, and nothing else", () => {
    expect(duplicateLinks(MAP.links).map(d => `${d.from}-${d.verb}-${d.to}:${d.links.length}`)).toEqual(["order-placed by-user:2"]);
  });
});
