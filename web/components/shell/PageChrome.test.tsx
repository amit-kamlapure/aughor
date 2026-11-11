// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InspectorHost, InspectorProvider, useInspector } from "./Inspector";
import { ChromeActions, ChromeStatus, ChromeTitle, ChromeToolbar, PageChromeProvider, PageHeader, StatusStrip, useChromeBack, usePageChrome } from "./PageChrome";
import { Button } from "@/components/ui/button";
import { Freshness } from "@/components/ui/freshness";
import { LayerVisibleContext } from "@/lib/useVisiblePoll";

function Page({ title, visible = true }: { title: string; visible?: boolean }) {
  return (
    <LayerVisibleContext.Provider value={visible}>
      <Says title={title} />
    </LayerVisibleContext.Provider>
  );
}
function Says({ title }: { title: string }) {
  usePageChrome({ title, status: { label: "Draft" } });
  return (
    <>
      <ChromeActions><Button>Publish</Button></ChromeActions>
      <ChromeToolbar><label>Range <select aria-label="Range" defaultValue="all"><option value="all">All</option></select></label></ChromeToolbar>
      <ChromeStatus><span>20 rows</span></ChromeStatus>
    </>
  );
}

describe("the page's chrome", () => {
  it("draws no breadcrumb, and marks a title row that only repeats the section's name as plain", () => {
    render(<PageChromeProvider pageKey="catalog"><PageHeader place={[{ label: "Data", id: "catalog" }, { label: "Catalog" }]} fallbackTitle="Catalog" /></PageChromeProvider>);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();     // no breadcrumb row (2026-11-10)
    // a row that only repeats the section's name is marked plain — the stylesheet draws it only once a fact or an
    // action arrives (jsdom does not apply :has, so the mark is what is asserted)
    expect(document.querySelector(".aug-titlebar")?.getAttribute("data-plain")).toBe("true");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Catalog");
  });

  it("takes the title, state and status items the page says", () => {
    render(
      <PageChromeProvider pageKey="dashboards">
        <PageHeader place={[{ label: "Analyze" }, { label: "Dashboards" }]} fallbackTitle="Dashboards" />
        <Page title="Late dispatch" />
        <StatusStrip connection={{ name: "theLook", engine: "BigQuery" }} running={0} />
      </PageChromeProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Late dispatch");
    expect(screen.getByText("Draft")).toBeTruthy();
    // controls portal into the shell's rows, live: the action sits in the title row, the picker in the toolbar row
    expect(screen.getByRole("button", { name: "Publish" }).closest(".aug-title-actions")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Range" }).closest(".aug-page-toolbar")).toBeTruthy();
    expect(screen.getByLabelText("Status").textContent).toContain("20 rows");
    expect(screen.getByLabelText("Status").textContent).toContain("No agent runs in flight");
  });

  it("never lets a layer kept mounted while hidden speak for the page", () => {
    render(
      <PageChromeProvider pageKey="intelligence">
        <PageHeader place={[{ label: "Define" }, { label: "Graph" }]} fallbackTitle="Graph" />
        <Page title="Briefing, hidden" visible={false} />
      </PageChromeProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Graph");
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();   // its controls stay out of the rows too
  });

  it("lets a page's title be a control, and its section's crumb take the page back to its start", () => {
    const back = vi.fn();
    function Sheet() {
      usePageChrome({ title: "Q3 orders", trail: ["Q3 orders"] });
      useChromeBack(back);
      return <ChromeTitle><Button aria-label="Rename Q3 orders">Q3 orders</Button></ChromeTitle>;
    }
    render(
      <PageChromeProvider pageKey="spreadsheets">
        <PageHeader place={[{ label: "Analyze", id: "dashboards" }, { label: "Spreadsheets", id: "spreadsheets" }]}
          fallbackTitle="Spreadsheets" />
        <Sheet />
      </PageChromeProvider>,
    );
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.querySelector(".aug-title-slot button")).toBeTruthy();       // the rename control stands in the title
    // the way back sits before the title, named by where it goes
    fireEvent.click(screen.getByRole("button", { name: "Back to Spreadsheets" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".aug-titlebar")?.getAttribute("data-plain")).toBeNull();
  });

  it("takes a reader opened from a list back to the list from the crumb before its title", async () => {
    const { BackHeader } = await import("@/components/record/kit");
    const back = vi.fn();
    render(
      <PageChromeProvider pageKey="record">
        <PageHeader place={[{ label: "Decide", id: "inbox" }, { label: "Record", id: "record" }]} fallbackTitle="Record" />
        <BackHeader from="Claims" onBack={back} title="Revenue fell 6.5%" actions={<Button>Settle it</Button>} />
      </PageChromeProvider>,
    );
    expect(screen.getByTestId("page-back")).toHaveTextContent("Claims");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Revenue fell 6.5%");
    expect(screen.getByRole("button", { name: "Settle it" }).closest(".aug-title-actions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to Claims" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("draws no breadcrumb or title row for a work surface, and still shows an action that arrives (the user, 2026-11-10)", () => {
    function Surface() {
      usePageChrome({ bare: true });
      return <ChromeActions><Button>Create agent</Button></ChromeActions>;
    }
    render(
      <PageChromeProvider pageKey="query">
        <PageHeader place={[{ label: "Analyze", id: "dashboards" }, { label: "SQL Editor" }]} fallbackTitle="SQL Editor" />
        <Surface />
      </PageChromeProvider>,
    );
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    // an action a workspace still says lands at the end of the one row left, never nowhere
    expect(screen.getByRole("button", { name: "Create agent" }).closest(".aug-bare-row")).toBeTruthy();
  });

  it("keeps a component's controls where they stand outside the shell (a Data Canvas, a test)", () => {
    render(<Says title="Canvas" />);
    expect(screen.getByRole("button", { name: "Publish" })).toBeTruthy();
  });
});

function Opener() {
  const { inspect } = useInspector();
  return (
    <>
      <Button onClick={() => inspect({ key: "order:1", kind: "Order", title: "Order 1", tabs: { overview: <p>props</p>, provenance: <p>sql</p> } })}>one</Button>
      <Button onClick={() => inspect({ key: "order:3", kind: "Order", title: "Order 3", tabs: { overview: <p>props 3</p>, provenance: <p>sql 3</p> } })}>three</Button>
      <input aria-label="typing" />
    </>
  );
}

describe("the one inspector", () => {
  it("is closed until something is chosen, then shows it with its own tabs", () => {
    render(<InspectorProvider pageKey="p"><Opener /><InspectorHost /></InspectorProvider>);
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByText("one"));
    expect(screen.getByRole("complementary", { name: "Inspector: Order 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Provenance" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Actions" })).toBeNull();   // a tab not given is not drawn
  });

  it("stays open as the reader moves between things, and closes on Esc — not while they type", () => {
    render(<InspectorProvider pageKey="p"><Opener /><InspectorHost /></InspectorProvider>);
    fireEvent.click(screen.getByText("one"));
    fireEvent.click(screen.getByText("three"));
    expect(screen.getByRole("complementary", { name: "Inspector: Order 3" })).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("typing"), { key: "Escape" });
    expect(screen.getByRole("complementary")).toBeTruthy();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("closes when the page changes", () => {
    const { rerender } = render(<InspectorProvider pageKey="a"><Opener /><InspectorHost /></InspectorProvider>);
    fireEvent.click(screen.getByText("one"));
    rerender(<InspectorProvider pageKey="b"><Opener /><InspectorHost /></InspectorProvider>);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("cached or live", () => {
  it("says which, with the time in UTC, and says so when the time is not kept", () => {
    const { rerender } = render(<Freshness state="live" at="2026-11-09T19:40:24Z" receipt="4c2e2a494780" />);
    expect(document.body.textContent).toContain("Live · read Mon 9 Nov at 19:40 UTC");
    expect(document.body.textContent).toContain("4c2e2a49");
    rerender(<Freshness state="cached" at="2026-11-08T22:28:19Z" />);
    expect(document.body.textContent).toContain("Cached · measured Sun 8 Nov at 22:28 UTC");
    rerender(<Freshness state="cached" />);
    expect(document.body.textContent).toContain("Cached · read time not kept");
  });
});
