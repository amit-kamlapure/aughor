import { describe, expect, it } from "vitest";

import { glyphOf } from "@/components/ui/icon";

import { NAV_DESTINATIONS, NAV_SECTION_IDS, destinationOf, entryFor } from "./navDestinations";

describe("the rail's seven destinations", () => {
  it("draw each row with a glyph of its own, and one that exists — no two rows alike, Settings included", () => {
    // The user, 2026-11-11: Health and Monitors drew the same pulse line, Briefing and Data Canvas the same sheet, and
    // Agent Ops a vendor's logo. A row is told from its neighbour by its glyph before its word is read.
    const rows = [...NAV_DESTINATIONS.flatMap(d => d.sections.map(s => ({ label: s.label, icon: s.icon }))), { label: "Settings", icon: "settings" }];
    expect(rows.filter(r => !glyphOf(r.icon)).map(r => r.label)).toEqual([]);
    const by = new Map<unknown, string[]>();
    for (const r of rows) by.set(glyphOf(r.icon), [...(by.get(glyphOf(r.icon)) ?? []), r.label]);
    expect([...by.values()].filter(labels => labels.length > 1)).toEqual([]);
  });

  it("are seven, in order, under the glossary's names", () => {
    expect(NAV_DESTINATIONS.map(d => d.label)).toEqual(["Home", "Ask", "Data", "Analyze", "Define", "Decide", "Operations"]);
  });

  it("name each screen once", () => {
    const ids = NAV_DESTINATIONS.flatMap(d => d.sections.map(s => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(NAV_SECTION_IDS.size).toBe(ids.length);
  });

  it("place every row the rail had before them, but Integrations, which moved into Settings", () => {
    // The 21 rows above Settings on 2026-11-09, by the screen id each opened.
    const before = ["home", "inbox", "now", "canvases", "intelligence", "ontology", "recents", "health", "documents", "record",
      "catalog", "builder", "semantic", "spreadsheets", "agentic-ops", "monitors", "actions", "integrations", "spend", "security", "evals"];
    expect(before.filter(id => id !== "integrations" && !NAV_SECTION_IDS.has(id))).toEqual([]);
    expect(NAV_SECTION_IDS.has("integrations")).toBe(false);
  });

  it("give each tab the Briefing used to hold a row of its own", () => {
    for (const id of ["dashboards", "intel-hub", "graph", "evidence", "memory", "declared-actions", "org-intel", "brain"]) {
      expect(NAV_SECTION_IDS.has(id), id).toBe(true);
    }
  });

  it("lose nothing the rail and the Briefing's tabs had: every section has its glyph, every former tab its hover line", () => {
    expect(NAV_DESTINATIONS.flatMap(d => d.sections).filter(s => !s.icon).map(s => s.id)).toEqual([]);
    const blurbs = Object.fromEntries(NAV_DESTINATIONS.flatMap(d => d.sections).filter(s => s.blurb).map(s => [s.id, s.blurb]));
    // Word for word from the Intelligence workspace's LAYERS, which carried them as tab tooltips.
    expect(blurbs).toEqual({
      intelligence: "Cross-domain synthesis",
      dashboards: "Your own dashboards — the cards you keep watching",
      ontology: "Object model & relationships",
      graph: "Connection knowledge graph",
      evidence: "Claim ledger & feedback",
      brain: "Every store behind what Pramanyx knows, with live counts",
    });
  });

  it("hold at most eight sections each", () => {
    expect(Math.max(...NAV_DESTINATIONS.map(d => d.sections.length))).toBeLessThanOrEqual(8);
  });

  it("find the destination of a section, and none for a screen no row names", () => {
    expect(destinationOf("dashboards")?.label).toBe("Analyze");
    expect(destinationOf("brain")?.label).toBe("Operations");
    expect(destinationOf("chat")).toBeNull();
  });

  it("reopen the section last used in a destination, else its first", () => {
    const define = NAV_DESTINATIONS.find(d => d.id === "define")!;
    expect(entryFor(define, undefined)).toBe("semantic");
    expect(entryFor(define, "graph")).toBe("graph");
    expect(entryFor(define, "catalog")).toBe("semantic");   // a section of another destination is not an entry here
  });
});
