// @vitest-environment jsdom
/**
 * Arc BC — the Briefing as an edition the model composed (ROADMAP §3.67, §6 item 59).
 *
 * Opening never spends: the page READS the edition and writes one only on a click. A written edition is drawn from
 * its blocks — each from the sources the server ran: a cited number opens its source beside the page, a control fades
 * the rows of every other value in the blocks that listen to it, a drill writes one level deeper under its block, a
 * block of a type the page does not know is said, and "Not now" puts a decision away.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BriefingEdition as Edition, BriefingGuideResponse, EditionSource } from "@/lib/api";

const api = vi.hoisted(() => ({
  readBriefingEdition: vi.fn(), writeBriefingEdition: vi.fn(), readBriefingGuide: vi.fn(), draftBriefingGuide: vi.fn(),
  getGroups: vi.fn(), putMyPreference: vi.fn(), drillBriefingEdition: vi.fn(), giveBriefingDecision: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));
vi.mock("@/components/brief/BriefSchedule", () => ({ BriefSchedule: () => null }));
// The chat transport is a double: what each turn sends is kept, and the thread is what a test puts in it. No network.
const chat = vi.hoisted(() => ({ sent: [] as { text: string; body?: Record<string, unknown> }[], messages: [] as unknown[] }));
vi.mock("@/lib/usePramanyxChat", () => ({ usePramanyxChat: () => ({ messages: chat.messages, status: "ready",
  sendMessage: (m: { text: string }, o?: { body?: Record<string, unknown> }) => { chat.sent.push({ text: m.text, body: o?.body }); return Promise.resolve(); } }) }));
// an answer under the page links its object keys from the same catalog: read from here, never from a server
vi.mock("@/lib/objects", () => ({ getObjectCatalog: vi.fn(async () => ({ types: [] })), cachedObjectCatalog: vi.fn(async () => null) }));
const nav = vi.hoisted(() => ({ requestTab: vi.fn() }));
vi.mock("@/lib/navigate", () => nav);
vi.mock("@/components/charts/vega/VegaChart", () => ({
  VegaChart: ({ spec }: { spec: unknown }) => <div data-testid="vega" data-spec={JSON.stringify(spec)} />,
}));

import { BriefingEdition } from "./BriefingEdition";

const PERIOD = { period: "week", key: "range:last_week:2026-10-19..2026-10-25", preset: "last_week", label: "Weekly",
  start: "2026-10-19", end: "2026-10-26", last_day: "2026-10-25", previous_start: "2026-10-12", previous_end: "2026-10-19",
  last_year_start: null, last_year_end: null, as_of: "2026-10-29", lag_days: 3, lag_source: "learned", still_moving: [],
  covers: "the week 2026-10-19 to 2026-10-25", compared_with: "the week before", last_year_label: null } as unknown as Edition["period"];

const S = (over: Partial<EditionSource>): EditionSource => ({ id: "s", label: "S", kind: "query", columns: [], rows: [], sql: "SELECT 1",
  status: "final", facts: {}, receipts: [], caveats: [], note: "", error: "", unit: "", better: "up", ...over });

const SOURCES: Record<string, EditionSource> = {
  sales: S({ id: "sales", label: "Sales", kind: "check", columns: ["start", "value", "this_range"], unit: "EUR",
             rows: [["2026-10-12", 158815, false], ["2026-10-19", 166988, true]], facts: { current: 166988 },
             sql: "SELECT SUM(gmv_eur) FROM orders" }),
  by_top: S({ id: "by_top", label: "Sales by top client", kind: "breakdown", unit: "EUR",
              columns: ["segment", "this_range", "usual", "change", "change_pct", "rows", "too_few"],
              rows: [[true, 85349, 75932, 9417, 0.124, 70, false], [false, 81640, 85028, -3388, -0.04, 189, false]],
              facts: { check: "sales", by: "is_top", within: {} } }),
  stores: S({ id: "stores", label: "Top clients by storefront", columns: ["platform", "this_week", "usual"],
              rows: [["Mytheresa", 38840, 29849], ["YOOX", 9845, 11051]] }),
  orders: S({ id: "orders", label: "Largest orders", columns: ["order_id", "platform", "gmv_eur"],
              rows: [["MYT-1", "Mytheresa", 3459], ["NET-1", "NET-A-PORTER", 2505]] }),
  countries: S({ id: "countries", label: "By ship country", columns: ["country", "this_week", "usual"],
                 rows: [["Japan", 4935, 2317], ["United States", 20364, 23639]] }),
};

const WRITTEN: Edition = { built: true, composed: true, scope_key: "c", period: { ...PERIOD, measured: [] },
  reader: { group_id: "leadership", name: "Leadership" }, sources: SOURCES, drill_columns: { sales: ["platform", "is_top"] },
  blocks: [
    { id: "lead", type: "lead", text: "Sales were an ordinary {€167.0k|sales}, but top clients spent {€9.4k more|by_top}." },
    { id: "where", type: "bridge", source: "by_top", title: "Where the week's sales came from" },
    { id: "store", type: "control", source: "stores", column: "platform", title: "Look at one storefront" },
    { id: "cmp", type: "compare", source: "stores", label: "platform", value: "this_week", compare: "usual", listens: "store",
      title: "Top clients by storefront" },
    { id: "tbl", type: "table", source: "orders", title: "The largest orders", link: "order_id" },
    { id: "map", type: "map", source: "countries", label: "country", value: "this_week", compare: "usual", title: "Where orders went" },
    { id: "odd", type: "sankey", source: "sales" },
    { id: "dec", type: "decision", text: "Look into app conversion before Singles Day?", actions: ["investigate", "not_now"] },
  ],
  withheld: [{ block: "lead", sentence: "Promotions lifted sales.", why: "it claims a cause (“lifted”)" }],
  guide: { version: 5, state: "draft" }, model_steps: 5, queries: 2, generated_at: "2026-10-29T09:00:00Z", currency_code: "EUR" };

const GUIDE: BriefingGuideResponse = {
  available: true, published_version: null, editions_read: { version: 5, state: "draft" },
  version: { version: 5, state: "draft", by: "explorer", note: "", created_at: "", published_at: "" }, versions: [],
  guide: { business: "A luxury group.", ranges: { week: "", month: "", year: "", custom: "", day: "" }, news: {},
           comparisons: [], calendar: [], care: [], checks: [], dropped: [], readers: [], proposed_readers: [] },
};

beforeEach(() => {
  Object.values(api).forEach(f => f.mockReset());
  chat.sent.length = 0;
  chat.messages.length = 0;
  api.getGroups.mockResolvedValue({ ladder: [], builtin_groups: [], groups: [
    { id: "leadership", name: "Leadership", kind: "function", description: "", channel_trigger_id: "" },
    { id: "finance", name: "Finance", kind: "function", description: "", channel_trigger_id: "" }] });
  api.readBriefingGuide.mockResolvedValue(GUIDE);
  api.putMyPreference.mockResolvedValue(undefined);
});

describe("BriefingEdition", () => {
  it("reads on opening and never writes", async () => {
    api.readBriefingEdition.mockResolvedValue({ built: false, scope_key: "c", period: PERIOD, reader: "leadership" });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    expect(await screen.findByText(/Not written yet for Leadership/)).toBeTruthy();
    expect(api.readBriefingEdition).toHaveBeenCalledTimes(1);
    expect(api.writeBriefingEdition).not.toHaveBeenCalled();
  });

  it("writes only when asked, for the reader on screen", async () => {
    api.readBriefingEdition.mockResolvedValue({ built: false, scope_key: "c", period: PERIOD, reader: "leadership" });
    api.writeBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    fireEvent.click(await screen.findByRole("button", { name: "Write this week's edition" }));
    await screen.findByTestId("edition-lead");
    expect(api.writeBriefingEdition).toHaveBeenCalledWith("dcc63d83", { preset: "last_week" }, "leadership", "luxexperience", undefined, undefined);
  });

  it("draws the blocks it was given, in their order, and says the one it cannot draw", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    const types = screen.getAllByTestId("edition-block").map(b => b.getAttribute("data-type"));
    expect(types).toEqual(["lead", "bridge", "control", "compare", "table", "map", "sankey", "decision"]);
    expect(screen.getByTestId("edition-bridge")).toBeTruthy();
    expect(screen.getByText(/which this page cannot draw/)).toBeTruthy();
    const odd = screen.getAllByTestId("edition-block")[6];
    expect(within(odd).getByRole("heading").textContent).toBe("Sales");        // untitled: its source's own label
    expect(screen.getByTestId("edition-withheld").textContent).toContain("Promotions lifted sales.");
    // the bridge is a chart too since 2026-11-12: the map is the one whose spec looks countries up
    const spec = screen.getAllByTestId("vega").map(v => JSON.parse(v.getAttribute("data-spec") ?? "{}")).find(sp => sp.transform);
    expect(spec.transform[0].lookup).toBe("properties.name");                   // countries looked up by name
    expect(spec.transform[0].from.data.values.map((v: { place: string }) => v.place)).toEqual(["Japan", "United States"]);
  });

  it("opens a cited number's source beside the page", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    fireEvent.click(await screen.findByText("€167.0k"));
    const panel = await screen.findByTestId("edition-evidence");
    expect(within(panel).getByText("Sales")).toBeTruthy();
    expect(panel.textContent).toContain("SELECT SUM(gmv_eur) FROM orders");
  });

  it("fades every other storefront in the blocks that listen to the control", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    fireEvent.click(screen.getByRole("radio", { name: "Mytheresa" }));
    const rows = within(screen.getAllByTestId("edition-pair-rows")[0]).getAllByRole("row");   // the comparison, not the map's list
    expect(rows[0].getAttribute("data-faded")).toBeNull();                    // Mytheresa
    expect(rows[1].getAttribute("data-faded")).toBe("true");                  // YOOX
  });

  const DRILL_COLUMNS = ["segment", "this_range", "usual", "change", "change_pct", "rows", "too_few"];
  const BY_PLATFORM = { block: { id: "drill_platform", type: "compare", source: "drill_platform_src", kicker: "Drill",
      title: "Sales by platform, within is top True, against usual", by_code: true },
    source: S({ id: "drill_platform_src", label: "Sales by platform", kind: "drill", columns: DRILL_COLUMNS,
                rows: [["Mytheresa", 38840, 29849, 8991, 0.3, 24, true]], facts: { check: "sales", by: "platform", within: { is_top: true } } }) };
  const BY_CHANNEL = { block: { id: "drill_channel", type: "compare", source: "drill_channel_src", kicker: "Drill",
      title: "Sales by channel, within is top True and platform Mytheresa, against usual", by_code: true },
    source: S({ id: "drill_channel_src", label: "Sales by channel", kind: "drill", columns: DRILL_COLUMNS,
                rows: [["web", 20000, 18000, 2000, 0.11, 12, true]], facts: { check: "sales", by: "channel", within: { is_top: true, platform: "Mytheresa" } } }) };
  const THREE_COLUMNS = { ...WRITTEN, drill_columns: { sales: ["platform", "is_top", "channel"] } };
  const card = () => screen.getAllByTestId("edition-block")[1];

  it("draws a drill in the card it came from, and adds no card", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.drillBriefingEdition.mockResolvedValue(BY_PLATFORM);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    const cards = screen.getAllByTestId("edition-block").length;
    expect(card().textContent).toContain("Where the week's sales came from");
    fireEvent.click(screen.getByRole("button", { name: /By platform, within Yes/ }));
    await within(card()).findByText("Sales by platform, within is top True, against usual");
    expect(screen.getAllByTestId("edition-block").length).toBe(cards);
    expect(card().getAttribute("data-type")).toBe("compare");
    expect(card().textContent).not.toContain("Where the week's sales came from");
    expect(api.drillBriefingEdition).toHaveBeenCalledWith("dcc63d83", { preset: "last_week" }, "leadership",
      { source_id: "by_top", column: "platform", segment: true }, "luxexperience", undefined, undefined);
  });

  it("goes back through each version to the one the model wrote, asking the server nothing", async () => {
    api.readBriefingEdition.mockResolvedValue(THREE_COLUMNS);
    api.drillBriefingEdition.mockResolvedValueOnce(BY_PLATFORM).mockResolvedValueOnce(BY_CHANNEL);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    expect(screen.queryByTestId("edition-drill-trail")).toBeNull();           // nothing to go back to yet

    fireEvent.click(within(card()).getByRole("button", { name: "By platform, within Yes" }));
    await within(card()).findByText("Sales by platform, within is top True, against usual");
    fireEvent.click(within(card()).getByRole("button", { name: "By channel, within Mytheresa" }));
    await within(card()).findByText(/Sales by channel, within is top True/);
    expect(api.drillBriefingEdition).toHaveBeenLastCalledWith("dcc63d83", { preset: "last_week" }, "leadership",
      { source_id: "drill_platform_src", column: "channel", segment: "Mytheresa" }, "luxexperience", undefined, undefined);

    const trail = within(card()).getByTestId("edition-drill-trail");
    expect(within(trail).getAllByRole("button").map(b => b.textContent)).toEqual(["Original", "By platform, within Yes"]);
    expect(trail.querySelector("[aria-current]")?.textContent).toBe("By channel, within Mytheresa");

    fireEvent.click(within(trail).getByRole("button", { name: "By platform, within Yes" }));
    expect(within(card()).getByText("Sales by platform, within is top True, against usual")).toBeTruthy();
    fireEvent.click(within(within(card()).getByTestId("edition-drill-trail")).getByRole("button", { name: "Original" }));
    expect(card().textContent).toContain("Where the week's sales came from");
    expect(card().getAttribute("data-type")).toBe("bridge");
    expect(screen.queryByTestId("edition-drill-trail")).toBeNull();
    expect(api.drillBriefingEdition).toHaveBeenCalledTimes(2);
  });

  it("opens a drill's own source, and lists only what the cards draw now", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.drillBriefingEdition.mockResolvedValue(BY_PLATFORM);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    fireEvent.click(screen.getByRole("button", { name: /By platform, within Yes/ }));
    await within(card()).findByText("Sales by platform, within is top True, against usual");
    fireEvent.click(within(card()).getByText("source"));
    expect(within(await screen.findByTestId("edition-evidence")).getByText("Sales by platform")).toBeTruthy();
  });

  it("starts every card clean when the edition is written again, even for a drill still on its way", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.writeBriefingEdition.mockResolvedValue({ ...WRITTEN, generated_at: "2026-10-30T09:00:00Z" });
    let land: (v: typeof BY_PLATFORM) => void = () => {};
    api.drillBriefingEdition.mockReturnValueOnce(new Promise(r => { land = r; })).mockResolvedValueOnce(BY_PLATFORM);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    fireEvent.click(screen.getByRole("button", { name: /By platform, within Yes/ }));   // asked of the old writing
    fireEvent.click(screen.getByRole("button", { name: "Write it again" }));
    await waitFor(() => expect(api.writeBriefingEdition).toHaveBeenCalled());
    await screen.findByText(/30 Oct|Oct 30/);
    land(BY_PLATFORM);
    await waitFor(() => expect((screen.getByRole("button", { name: /By platform, within Yes/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(card().textContent).toContain("Where the week's sales came from");           // never drawn on the new writing
    fireEvent.click(screen.getByRole("button", { name: /By platform, within Yes/ }));
    await within(card()).findByText("Sales by platform, within is top True, against usual");
    expect(within(card()).getByTestId("edition-drill-trail")).toBeTruthy();
  });

  it("says on the figure's own card when it is not read against usual; an edition kept before that rule draws as it was", async () => {
    const why = "Sales reads a table this platform has not seen stop changing.";
    const figure = { id: "sales", label: "Sales", metric: "sales", unit: "EUR", better: "up", why: "", current: 102818, previous: 97989,
      last_year: null, rel: 0.05, rel_last_year: null, n: 900, status: "provisional", z: null, outside: false, floor: false, streak: 2,
      extreme: null, series: [], cells: {}, current_text: "€102.8k", previous_text: "€98.0k", last_year_text: null, like_for_like: "", sql: "",
      usual: { mean: 86000, low: 78682, high: 93515, n: 8, mean_text: "€86.0k", low_text: "€78.7k", high_text: "€93.5k" } };
    const edition = (fig: object): Edition => ({ ...WRITTEN, period: { ...PERIOD, measured: [fig as never] },
      blocks: [{ id: "lead", type: "lead", text: "A week." }, { id: "f", type: "figure", source: "sales" }] });
    api.readBriefingEdition.mockResolvedValue(edition({ ...figure, equal_age: { equal: false, why } }));
    const { unmount } = render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const line = await screen.findByTestId("edition-figure-not-read");
    expect(line.textContent).toContain("not read against usual");
    expect(line.getAttribute("title")).toBe(why);
    expect(line.closest('[data-testid="edition-block"]')?.textContent).toContain("usual €78.7k–€93.5k");       // the band stays
    unmount();
    for (const age of [{ equal_age: { equal: true, why: "" } }, {}]) {
      api.readBriefingEdition.mockResolvedValue(edition({ ...figure, ...age }));
      const again = render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
      await screen.findByText("€102.8k");
      expect(screen.queryByTestId("edition-figure-not-read")).toBeNull();
      again.unmount();
    }
  });

  it("says what the edition did not read and why, and leaves the guide's own notes to the guide", async () => {
    api.readBriefingEdition.mockResolvedValue({ ...WRITTEN, withheld: [], left_out: [], not_read: [
      { label: "Join on the full id.", reason: "", tables: ["order_items"] },
      { label: "Refund rate", reason: "its query failed", tables: [] },
      { label: "Sales and Units against their usual range", reason: "each is still provisional", tables: [] }] });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const said = await screen.findByTestId("edition-withheld");
    expect(said.textContent).toContain("Not read: Refund rate — its query failed");
    expect(said.textContent).toContain("Not read: Sales and Units against their usual range — each is still provisional");
    expect(said.textContent).not.toContain("Join on the full id");
  });

  it("adds nothing to the page when only the guide's own notes are kept", async () => {
    api.readBriefingEdition.mockResolvedValue({ ...WRITTEN, withheld: [], left_out: [],
      not_read: [{ label: "Join on the full id.", reason: "", tables: ["order_items"] }] });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-dateline");
    expect(screen.queryByTestId("edition-withheld")).toBeNull();
  });

  it("puts a decision away on Not now", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByRole("button", { name: "Deep analysis" });
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/Look into app conversion/)).toBeNull();
  });

  it("offers every decision deep analysis, a team and not now — an edition kept before the rename too", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const dec = (await screen.findAllByTestId("edition-block")).find(b => b.getAttribute("data-type") === "decision")!;
    expect(within(dec).getAllByRole("button").map(b => b.textContent))
      .toEqual(["Deep analysis", "Give it to a team", "Ask about this", "Not now"]);
  });

  it("gives a decision to the team picked and says what became of it", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.giveBriefingDecision.mockResolvedValue({ block: "dec", group_id: "finance", name: "Finance", by: "user:amit",
      at: "2026-10-30T09:00:00Z", status: "not_sent", note: "Finance has no channel bound — bind one to the group, then give it again",
      departure_id: "", target: "" });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    fireEvent.click(await screen.findByRole("button", { name: "Give it to a team" }));
    const picker = screen.getByTestId("edition-give");
    expect(within(picker).getAllByRole("button").map(b => b.textContent)).toEqual(["Finance", "Leadership"]);
    fireEvent.click(within(picker).getByRole("button", { name: "Finance" }));
    const said = await screen.findByTestId("edition-given");
    expect(said.textContent).toContain("Given to Finance by amit · not sent — Finance has no channel bound");
    expect(api.giveBriefingDecision).toHaveBeenCalledWith("dcc63d83", { preset: "last_week" }, "leadership",
      { block_id: "dec", group_id: "finance" }, "luxexperience", undefined, undefined);
  });

  const OWN = { id: "cv1", own: true, dataset: "luxexperience", tables: ["orders", "shipments"],
                checks_inside: ["Orders placed", "Shipping cost"], checks_outside: ["Session conversion rate"] };

  it("in a Data Canvas that names tables, reads its own edition, says what it leaves out, and offers no schedule", async () => {
    api.readBriefingEdition.mockResolvedValue({ ...WRITTEN, canvas: OWN });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" canvasId="cv1" />);
    const said = (await screen.findByTestId("edition-canvas")).textContent ?? "";
    expect(said).toContain("This canvas reads orders, shipments, so its edition is its own: 2 of the guide's 3 checks");
    expect(said).toContain("Left out, because they read other tables: Session conversion rate.");
    expect(api.readBriefingEdition).toHaveBeenCalledWith("dcc63d83", { preset: "last_week" }, undefined, "luxexperience", undefined, "cv1");
    expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  });

  it("before a canvas's own edition is written, lists what it would measure and what it leaves out", async () => {
    api.readBriefingEdition.mockResolvedValue({ built: false, scope_key: "canvas:cv1", period: PERIOD, reader: "leadership", canvas: OWN });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" canvasId="cv1" />);
    const unwritten = await screen.findByTestId("edition-unwritten");
    expect(unwritten.textContent).toContain("Measured here: Orders placed, Shipping cost.");
    expect(unwritten.textContent).toContain("Left out, because they read other tables: Session conversion rate.");
    expect(unwritten.textContent).toContain("Writing measures the 2 checks");
    expect(unwritten.textContent).toContain("on these tables only");
  });

  it("in a Data Canvas on every table, says it is the dataset's own edition", async () => {
    api.readBriefingEdition.mockResolvedValue({ ...WRITTEN, canvas: { ...OWN, own: false, tables: [], checks_inside: [], checks_outside: [] } });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" canvasId="cv1" />);
    expect((await screen.findByTestId("edition-canvas")).textContent).toContain(
      "This canvas reads every table of luxexperience, so its Briefing is the dataset's own edition");
  });

  it("says when the data's lag has moved since the edition was written, and draws it still", async () => {
    api.readBriefingEdition.mockResolvedValue({ ...WRITTEN, lag_now: 1 });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    expect(screen.getByTestId("edition-lag-moved").textContent).toContain(
      "Written when this data was read 3 days behind; it is now read 1 day behind");
  });

  const KNOWN: Record<string, EditionSource> = {
    analysis_a1: S({ id: "analysis_a1", label: "Revenue rose on volume", kind: "analysis",
      facts: { inv_id: "fb1b7a55", headline: "September revenue rose €93,820 on order volume", closing: "Volume, not basket.",
               confidence: "HIGH", completed: "2026-10-28", licence: "descriptive" } }),
    analysis_started: S({ id: "analysis_started", label: "Why did refunds fall?", kind: "analysis", status: "running",
      facts: { question: "Why did refunds on returns fall to a seven-month low in September?", session: "briefing:k" } }),
    decision_d1: S({ id: "decision_d1", label: "A return fee", kind: "decision",
      facts: { decision_id: "d1-full-id", question: "Introduce a 9.90 EUR return fee", chosen: "introduce it",
               state: "due for review 2026-11-01" } }),
    discussion_1: S({ id: "discussion_1", label: "Slack #C1 · Ana", kind: "discussion",
      facts: { said: "Small CA/US returns dropped since the fee", who: "Ana", where: "Slack #C1", when: "2026-10-20",
               decision_id: "d1-full-id" } }),
  };
  const WITH_KNOWN: Edition = { ...WRITTEN, sources: { ...SOURCES, ...KNOWN },
    blocks: [WRITTEN.blocks![0], { id: "k1", type: "context", source: "analysis_a1", text: "It explains September's rise." },
             { id: "k2", type: "context", source: "analysis_started" }, { id: "k3", type: "context", source: "decision_d1" },
             { id: "k4", type: "context", source: "discussion_1" }],
    known: { analyses: 3, findings: 4, decisions: 2, discussions: 1, started: "analysis_started" } };

  it("says of a deep analysis that it finished before a metric it names changed, whatever the model wrote", async () => {
    const stale = { ...KNOWN.analysis_a1, facts: { ...KNOWN.analysis_a1.facts,
      definitions_changed: [{ metric: "net_revenue_eur", label: "Net Revenue (EUR, after refunds)", on: "2026-11-04" }] } };
    api.readBriefingEdition.mockResolvedValue({ ...WITH_KNOWN, sources: { ...WITH_KNOWN.sources, analysis_a1: stale } });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    expect(await screen.findByTestId("edition-measured-before")).toHaveTextContent(
      "Finished before the definition of Net Revenue changed on 4 Nov 2026, so what it says of it is about the old figures.");
    expect(screen.getAllByTestId("edition-measured-before")).toHaveLength(1);    // the one it is true of
  });

  it("draws what the platform already knew — a deep analysis, one being looked into, a decision — each to open", async () => {
    api.readBriefingEdition.mockResolvedValue(WITH_KNOWN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const cards = await screen.findAllByTestId("edition-context");
    expect(cards.map(c => c.getAttribute("data-kind"))).toEqual(["analysis", "analysis", "decision", "discussion"]);
    expect(cards[3].textContent).toContain("Slack #C1 · Ana · 2026-10-20");
    expect(cards[3].textContent).toContain("“Small CA/US returns dropped since the fee”");
    expect(cards[0].textContent).toContain("Deep analysis · 2026-10-28 · high confidence");
    expect(cards[0].textContent).toContain("September revenue rose €93,820 on order volume");
    expect(cards[1].textContent).toContain("Being looked into — a deep analysis this edition started");
    expect(cards[2].textContent).toContain("Decision · due for review 2026-11-01");
    fireEvent.click(within(cards[0]).getByRole("button", { name: "Open the deep analysis" }));
    expect(nav.requestTab).toHaveBeenCalledWith("chat", { run: "fb1b7a55" });
    fireEvent.click(within(cards[2]).getByRole("button", { name: "Open the decision" }));
    expect(nav.requestTab).toHaveBeenCalledWith("decisions", { id: "d1-full-id" });
    // how it was written is behind the footer's info icon (2026-11-12: explanation is an icon, not a sentence)
    expect(within(screen.getByTestId("edition-written")).getByTestId("info").getAttribute("title"))
      .toContain("read 3 deep analyses, 4 findings, 2 decisions and 1 discussion");
  });

  it("reads the edition again while a deep analysis it started is still running", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      api.readBriefingEdition.mockResolvedValue(WITH_KNOWN);
      render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
      await screen.findAllByTestId("edition-context");
      expect(api.readBriefingEdition).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(30_000);
      await waitFor(() => expect(api.readBriefingEdition).toHaveBeenCalledTimes(2));
    } finally { vi.useRealTimers(); }
  });

  it("with no guide, says so and drafts one only on a click", async () => {
    api.readBriefingGuide.mockResolvedValue({ ...GUIDE, available: false, guide: null, version: null, editions_read: null });
    api.readBriefingEdition.mockResolvedValue({ built: false, scope_key: "c", period: PERIOD, reader: "" });
    api.draftBriefingGuide.mockResolvedValue(GUIDE);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const empty = await screen.findByTestId("edition-no-guide");
    expect(api.draftBriefingGuide).not.toHaveBeenCalled();
    fireEvent.click(within(empty).getByRole("button", { name: "Draft the guide" }));
    await waitFor(() => expect(api.draftBriefingGuide).toHaveBeenCalledWith("dcc63d83", "luxexperience"));
  });
});

/**
 * ROADMAP §6 item 46 — every part of the Briefing can be asked about (the user, 2026-10-07: "the graphs the charts the
 * numbers everything should be questionable by the user"). Each part that says or draws something offers "Ask about
 * this", a button with its edge at rest; a click points the ONE ask under the page at it — no pop-up, no second box —
 * the ask says which part, the next question carries it as its focus (ids only: the server reads the rest from the
 * edition it kept), and one click takes it back to the whole edition.
 */
describe("asking about one part of the edition", () => {
  const EDITION_KEY = `${PERIOD.key}@leadership`;
  const blockOf = (type: string) => screen.getAllByTestId("edition-block").find(b => b.getAttribute("data-type") === type)!;
  const askFrom = (type: string) => fireEvent.click(within(blockOf(type)).getByRole("button", { name: /^Ask(ing)? about this$/ }));
  const ask = (q: string) => {
    const box = screen.getByRole("textbox", { name: "Ask about this edition" });
    fireEvent.change(box, { target: { value: q } });
    fireEvent.keyDown(box, { key: "Enter" });
  };

  it("offers Ask about this on every part that says or draws something, as a button with its edge at rest", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    const offered = screen.getAllByTestId("edition-block").filter(b => within(b).queryByRole("button", { name: "Ask about this" }))
      .map(b => b.getAttribute("data-type"));
    expect(offered).toEqual(["lead", "bridge", "compare", "table", "map", "decision"]);   // a control chooses; a type the page cannot draw says so
    for (const b of screen.getAllByRole("button", { name: "Ask about this" })) {
      expect(b.tagName).toBe("BUTTON");
      expect(b).toHaveClass("rt-variant-outline");                                      // an edge before the pointer reaches it
      expect(b).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByTestId("edition-ask-part")).toBeNull();                         // asking about the whole edition
  });

  it("points the one ask at the part: it says which, and the next question carries it as its focus", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    askFrom("compare");
    expect(screen.getByTestId("edition-ask-part")).toHaveTextContent("Asking about “Top clients by storefront”");
    expect(within(blockOf("compare")).getByRole("button", { name: "Asking about this" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("edition-ask")).toHaveLength(1);                         // the one ask, no second box
    expect(screen.queryByRole("dialog")).toBeNull();                                      // and no pop-up
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Ask about this edition" }));
    ask("Why is Mytheresa up?");
    expect(chat.sent).toEqual([{ text: "Why is Mytheresa up?", body: { focus: {
      kind: "briefing", id: "cmp", period: EDITION_KEY, source: "stores" } } }]);
    askFrom("lead");                                                                      // the lead draws no source of its own
    expect(screen.getByTestId("edition-ask-part")).toHaveTextContent("Asking about “Sales were an ordinary €167.0k, but top clients spent €9.4k more.”");
    ask("And the week before?");
    expect(chat.sent[1].body).toEqual({ focus: { kind: "briefing", id: "lead", period: EDITION_KEY } });
  });

  it("clears back to the whole edition, and the next question carries no focus", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    askFrom("table");
    expect(screen.getByTestId("edition-ask-part")).toHaveTextContent("Asking about “The largest orders”");
    fireEvent.click(screen.getByRole("button", { name: "Ask about the whole edition" }));
    expect(screen.queryByTestId("edition-ask-part")).toBeNull();
    expect(within(blockOf("table")).getByRole("button", { name: "Ask about this" })).toHaveAttribute("aria-pressed", "false");
    ask("What stands out?");
    expect(chat.sent).toEqual([{ text: "What stands out?", body: undefined }]);
  });

  it("asks about a drilled card as it is drawn now", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.drillBriefingEdition.mockResolvedValue({ block: { id: "drill_platform", type: "compare", source: "drill_platform_src",
        kicker: "Drill", title: "Sales by platform, against usual", by_code: true },
      source: S({ id: "drill_platform_src", label: "Sales by platform", kind: "drill", facts: { check: "sales", by: "platform", within: {} } }) });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    askFrom("bridge");
    expect(screen.getByTestId("edition-ask-part")).toHaveTextContent("Asking about “Where the week's sales came from”");
    fireEvent.click(screen.getByRole("button", { name: /By platform, within Yes/ }));
    await screen.findByText("Sales by platform, against usual");
    expect(screen.getByTestId("edition-ask-part")).toHaveTextContent("Asking about “Sales by platform”");   // follows the card
    ask("Which platform moved most?");
    expect(chat.sent[0].body).toEqual({ focus: { kind: "briefing", id: "where", period: EDITION_KEY, source: "drill_platform_src" } });
  });

  it("forgets the part when the edition is written again: the new writing holds other parts", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    api.writeBriefingEdition.mockResolvedValue({ ...WRITTEN, generated_at: "2026-10-30T09:00:00Z" });
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    await screen.findByTestId("edition-lead");
    askFrom("map");
    expect(screen.getByTestId("edition-ask-part")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write it again" }));
    await waitFor(() => expect(screen.queryByTestId("edition-ask-part")).toBeNull());
  });

  it("says over each answer which part it was about, as the server read it", async () => {
    chat.messages.push(
      { id: "u1", role: "user", parts: [{ type: "text", text: "Why is Mytheresa up?" }], metadata: { mode: "ask" } },
      { id: "a1", role: "assistant", parts: [
        { type: "data-route", data: { depth: "quick", why: "asked quickly", subject: { kind: "briefing", carried: true,
          said: "About “Top clients by storefront” · the week 2026-10-19 to 2026-10-25" } } },
        { type: "text", text: "Mytheresa was up." }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "And YOOX?" }], metadata: { mode: "ask" } },
      { id: "a2", role: "assistant", parts: [
        { type: "data-route", data: { depth: "quick", why: "asked quickly", subject: { kind: "briefing", carried: false,
          said: "About “Top clients by storefront” · the week 2026-10-19 to 2026-10-25" } } },
        { type: "text", text: "YOOX was down." }] });
    api.readBriefingEdition.mockResolvedValue(WRITTEN);
    render(<BriefingEdition connectionId="dcc63d83" schema="luxexperience" />);
    const said = await screen.findAllByTestId("edition-ask-answered-about");
    expect(said.map(s => s.textContent)).toEqual([
      "About “Top clients by storefront” · the week 2026-10-19 to 2026-10-25",
      "About “Top clients by storefront” · the week 2026-10-19 to 2026-10-25 · this answer did not read it"]);
  });
});
