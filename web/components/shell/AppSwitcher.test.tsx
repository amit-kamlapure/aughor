// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const door = vi.hoisted(() => ({ answer: { available: false } as { available: boolean; url?: string | null }, asked: 0 }));
vi.mock("@/lib/api", () => ({
  fetchCoworkerDoor: () => { door.asked += 1; return Promise.resolve(door.answer); },
}));

import { AppSwitcher, coworkerHref } from "@/components/shell/AppSwitcher";

describe("the way to the coworker", () => {
  beforeEach(() => { door.asked = 0; });
  afterEach(cleanup);

  it("draws nothing when no coworker is running", async () => {
    door.answer = { available: false };
    const { container } = render(<AppSwitcher connectionId="c1" theme="dark" />);
    await waitFor(() => expect(door.asked).toBe(1));
    expect(container.innerHTML).toBe("");
  });

  it("draws nothing for a coworker that gave no address", async () => {
    door.answer = { available: true, url: null };
    const { container } = render(<AppSwitcher />);
    await waitFor(() => expect(door.asked).toBe(1));
    expect(container.innerHTML).toBe("");
  });

  it("draws nine dots when one is running, and they open the two places", async () => {
    door.answer = { available: true, url: "http://127.0.0.1:3090/?token=abc" };
    render(<AppSwitcher connectionId="c1" theme="light" />);
    const dots = await screen.findByRole("button", { name: "Switch to" });
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(dots);
    expect(dots.getAttribute("aria-expanded")).toBe("true");
    const here = screen.getByText("Pramanyx").closest("[role=menuitem]");
    expect(here?.getAttribute("aria-current")).toBe("page");
    expect(here?.tagName).toBe("DIV");                       // where you are is not a link to it

    const there = screen.getByText("Coworker").closest("a") as HTMLAnchorElement;
    const to = new URL(there.href);
    expect(to.origin + to.pathname + to.search).toBe("http://127.0.0.1:3090/?token=abc");
    const carried = new URLSearchParams(to.hash.replace(/^#pramanyx:/, ""));
    expect(to.hash.startsWith("#pramanyx:")).toBe(true);
    expect(carried.get("conn")).toBe("c1");
    expect(carried.get("theme")).toBe("light");
    expect(carried.get("back")).toBe(window.location.href);
  });

  it("looks again as it opens, so a coworker that stopped is not offered", async () => {
    door.answer = { available: true, url: "http://127.0.0.1:3090/" };
    render(<AppSwitcher />);
    const dots = await screen.findByRole("button", { name: "Switch to" });
    door.answer = { available: false };
    fireEvent.click(dots);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Switch to" })).toBeNull());
    expect(door.asked).toBe(2);
  });

  it("closes on Escape", async () => {
    door.answer = { available: true, url: "http://127.0.0.1:3090/" };
    render(<AppSwitcher />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("what is carried to the coworker", () => {
  it("rides in the fragment and leaves the address itself alone", () => {
    const href = coworkerHref("http://localhost:3090/?token=t", { connectionId: "abc", theme: "dark", back: "http://localhost:3000/?tab=home" });
    expect(href.startsWith("http://localhost:3090/?token=t#pramanyx:")).toBe(true);
    expect(new URLSearchParams(href.split("#pramanyx:")[1]).get("back")).toBe("http://localhost:3000/?tab=home");
  });

  it("adds no fragment when there is nothing to carry", () => {
    expect(coworkerHref("http://localhost:3090/", {})).toBe("http://localhost:3090/");
  });

  it("returns an address it cannot read as it was given", () => {
    expect(coworkerHref("not an address", { connectionId: "abc" })).toBe("not an address");
  });
});
