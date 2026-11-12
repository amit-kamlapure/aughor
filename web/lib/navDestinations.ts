/**
 * The rail's seven destinations (2026-11-10, the user's call after the two mockups in
 * `design-mockups/evidence-to-action/`): Home · Ask · Data · Analyze · Define · Decide · Operations.
 *
 * Each destination holds the sections a person can open from it. Only the destination that holds the
 * open page shows its sections, so the rail is seven rows plus at most eight, where it had been 22 rows
 * that filled 1440×900 to its last pixel (measured 2026-11-10: the last row ended at 830 of 852).
 *
 * A section's `id` is the screen id the shell already routes (`NavTab` in `app/page.tsx`): a row
 * opens exactly what that id opens from a link or ⌘K, and the rail lights the row whose id the
 * open screen resolves to. Names follow `docs/GLOSSARY.md`: a "Model" destination would read as the
 * AI model the rest of the product means by that word, and "Monitor" is already one watch-a-metric
 * rule — hence Define and Operations.
 *
 * Nothing the rail did before is lost (the user, 2026-11-10: "Do not remove features as a cost of
 * redesign"): a section keeps the glyph its row or tab had, which the collapsed rail draws so the open
 * destination's sections stay one click away, and a section that was a Briefing tab keeps the line its
 * tab said on hover (`blurb`, word for word from the tab).
 *
 * Pure data and lookups, no React: `lib/navDestinations.test.ts` holds the shape.
 */

export type NavDestinationId = "home" | "ask" | "data" | "analyze" | "define" | "decide" | "operations";

export interface NavSection {
  /** The screen id the row opens — a `NavTab` the shell routes. */
  id: string;
  label: string;
  /** The glyph its row or tab had; the collapsed rail draws it. */
  icon: string;
  /** What its tab said on hover, when it was a tab of the Briefing. */
  blurb?: string;
}

export interface NavDestination {
  id: NavDestinationId;
  icon: string;
  label: string;
  sections: readonly NavSection[];
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { id: "home", icon: "home", label: "Home", sections: [
    { id: "home",         label: "Home",     icon: "home" },
    { id: "intelligence", label: "Briefing", icon: "brief", blurb: "Cross-domain synthesis" },
    { id: "now",          label: "Now",      icon: "bell" },
  ] },
  { id: "ask", icon: "chat", label: "Ask", sections: [
    { id: "canvases", label: "Data Canvas", icon: "canvas" },
    { id: "recents",  label: "Agent runs",  icon: "run" },
  ] },
  // Documents left "what Pramanyx knows" for Data on 2026-11-10. The corpus is still global — `index_file`
  // takes no connection — and the Data destination claims no connection scope of its own.
  { id: "data", icon: "db", label: "Data", sections: [
    { id: "catalog",   label: "Catalog",   icon: "catalog" },
    { id: "intel-hub", label: "Profile",   icon: "eye" },
    { id: "documents", label: "Documents", icon: "folder" },
  ] },
  { id: "analyze", icon: "chart", label: "Analyze", sections: [
    { id: "builder",      label: "SQL Editor",   icon: "sql" },
    { id: "dashboards",   label: "Dashboards",   icon: "gauge", blurb: "Your own dashboards — the cards you keep watching" },
    { id: "spreadsheets", label: "Spreadsheets", icon: "table" },
  ] },
  { id: "define", icon: "node", label: "Define", sections: [
    { id: "semantic",         label: "Semantic Layer", icon: "layers" },
    { id: "ontology",         label: "Ontology",       icon: "node", blurb: "Object model & relationships" },
    { id: "declared-actions", label: "Actions",        icon: "bolt" },
    { id: "graph",            label: "Graph",          icon: "kgraph", blurb: "Connection knowledge graph" },
    { id: "memory",           label: "Memory",         icon: "memory" },
    { id: "org-intel",        label: "Org",            icon: "users" },
  ] },
  // The Record stays one row for its five views (the 2027 study §V): a person reads a decision's
  // claims and its inquiry together, so splitting them across destinations would split one story.
  { id: "decide", icon: "check", label: "Decide", sections: [
    { id: "inbox",    label: "Inbox",    icon: "inbox" },
    { id: "record",   label: "Record",   icon: "bookmark" },
    { id: "evidence", label: "Evidence", icon: "check", blurb: "Claim ledger & feedback" },
  ] },
  { id: "operations", icon: "activity", label: "Operations", sections: [
    { id: "health",      label: "Health",           icon: "health" },
    { id: "monitors",    label: "Monitors",         icon: "monitor" },
    { id: "agentic-ops", label: "Agent Ops",        icon: "agents" },
    { id: "actions",     label: "Notifications",    icon: "send" },
    { id: "spend",       label: "Spend",            icon: "spend" },
    { id: "security",    label: "Security & Audit", icon: "shield" },
    { id: "evals",       label: "Evals",            icon: "flask" },
    { id: "brain",       label: "Brain map",        icon: "brain", blurb: "Every store behind what Pramanyx knows, with live counts" },
  ] },
];

/** Every section id, for a lookup that must not be a linear search in a render. */
export const NAV_SECTION_IDS: ReadonlySet<string> = new Set(NAV_DESTINATIONS.flatMap(d => d.sections.map(s => s.id)));

/** The destination that holds a section, by the section's screen id; null for a screen no row names. */
export function destinationOf(sectionId: string): NavDestination | null {
  return NAV_DESTINATIONS.find(d => d.sections.some(s => s.id === sectionId)) ?? null;
}

/** Where a destination's row takes a person: back to the section they last had open there, or its first. */
export function entryFor(destination: NavDestination, lastSection: string | undefined): string {
  return lastSection && destination.sections.some(s => s.id === lastSection) ? lastSection : destination.sections[0].id;
}
