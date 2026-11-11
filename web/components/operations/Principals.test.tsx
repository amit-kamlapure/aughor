// @vitest-environment jsdom
/**
 * Arc ED, ED-2 — a person names a service principal's grant when minting it, and each principal's row says what it is
 * held to: its grant, or the agent policy alone.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/lib/testing";

const api = vi.hoisted(() => ({
  mintServicePrincipal: vi.fn(async (_body: Record<string, unknown>) => ({ key: "k-once" })),
  revokeServicePrincipal: vi.fn(async () => ({})),
  registerMethod: vi.fn(async (_body: Record<string, unknown>) => ({})),
}));
vi.mock("@/lib/record", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/record")>()), ...api }));

import { Methods, Principals } from "./DeveloperPanel";

afterEach(() => { vi.clearAllMocks(); });

describe("service principals and their grants", () => {
  it("says what each principal is held to", () => {
    render(<Principals onChanged={() => {}} principals={[
      { name: "acme", areas: ["catalog:read"], entities: ["Order"] },
      { name: "plain" },
    ]} />);
    expect(screen.getByText("Held to its grant: areas catalog:read · entities Order")).toBeInTheDocument();
    expect(screen.getByText("Held to the agent policy alone")).toBeInTheDocument();
  });

  it("mints with the areas, entities and actions a person named, and nothing they did not", async () => {
    render(<Principals onChanged={() => {}} principals={[]} />);
    const dialog = await openMint();
    fireEvent.change(within(dialog).getByLabelText("Service principal name"), { target: { value: "vendor" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "objects:read" }));
    fireEvent.change(within(dialog).getByLabelText("Entities it may read"), { target: { value: " Order, Customer " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mint it" }));
    await waitFor(() => expect(api.mintServicePrincipal).toHaveBeenCalledTimes(1));
    expect(api.mintServicePrincipal.mock.calls[0][0]).toEqual(
      { name: "vendor", note: "", areas: ["objects:read"], entities: ["Order", "Customer"] });
    expect(await within(dialog).findByText("k-once")).toBeInTheDocument();
  });

  it("mints a principal with no grant as it always did", async () => {
    render(<Principals onChanged={() => {}} principals={[]} />);
    const dialog = await openMint();
    fireEvent.change(within(dialog).getByLabelText("Service principal name"), { target: { value: "plain" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mint it" }));
    await waitFor(() => expect(api.mintServicePrincipal).toHaveBeenCalledTimes(1));
    expect(api.mintServicePrincipal.mock.calls[0][0]).toEqual({ name: "plain", note: "" });
  });
});

/** Open the Mint dialog from its button, as a person does. */
async function openMint() {
  const open = screen.getByRole("button", { name: "Mint a principal" });
  expect(open).toHaveAttribute("aria-haspopup", "dialog");
  fireEvent.click(open);
  return screen.findByRole("dialog", { name: "Mint a principal" });
}

// The user, 2026-11-07: a principal is minted in a dialog over the page, opened by its button. Its key is shown once,
// so the dialog stays open on it until the person closes it, and closing forgets it.
describe("minting a principal is a dialog", () => {
  it("opens the form in a dialog — the name, the note and the grant inside it; Cancel closes it", async () => {
    render(<Principals onChanged={() => {}} principals={[]} />);
    // No mint form stands open on the page.
    expect(screen.queryByLabelText("Service principal name")).toBeNull();
    expect(screen.queryByTestId("principal-grant")).toBeNull();
    const dialog = await openMint();
    expect(dialog).toHaveAttribute("data-testid", "principal-new");
    expect(within(dialog).getByLabelText("Service principal name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What it is for")).toBeInTheDocument();
    expect(within(dialog).getByTestId("principal-grant")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Actions it may propose")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Mint it" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.mintServicePrincipal).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mint a principal" })).toBeInTheDocument();
  });

  it("says a refused mint inside the dialog, and closing it takes the refusal away", async () => {
    api.mintServicePrincipal.mockRejectedValueOnce(new Error("a principal named vendor exists"));
    render(<Principals onChanged={() => {}} principals={[]} />);
    let dialog = await openMint();
    fireEvent.change(within(dialog).getByLabelText("Service principal name"), { target: { value: "vendor" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mint it" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("a principal named vendor exists");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    dialog = await openMint();
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("stays open on the minted key, held while minting, until the person closes it — and closing forgets the key",
    async () => {
      let answer: (v: { key: string }) => void = () => {};
      api.mintServicePrincipal.mockImplementationOnce(() => new Promise(r => { answer = r; }));
      const onChanged = vi.fn();
      render(<Principals onChanged={onChanged} principals={[]} />);
      let dialog = await openMint();
      fireEvent.change(within(dialog).getByLabelText("Service principal name"), { target: { value: "vendor" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Mint it" }));
      // While the mint is in flight the dialog cannot be walked away from.
      await waitFor(() => expect(within(dialog).getByRole("button", { name: "Close" })).toBeDisabled());
      answer({ key: "k-once" });
      expect(await within(dialog).findByTestId("principal-key")).toHaveTextContent("k-once");
      expect(dialog).toHaveTextContent("The key for vendor is shown once and stored hashed. Copy it now.");
      expect(onChanged).toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Mint a principal" })).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "I have copied it" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.queryByText("k-once")).toBeNull();
      // Opened again, it is a fresh form — the key is not shown a second time.
      dialog = await openMint();
      expect(within(dialog).queryByText("k-once")).toBeNull();
      expect(within(dialog).getByLabelText("Service principal name")).toHaveValue("");
    });

  it("forgets the key when closed from its corner too", async () => {
    render(<Principals onChanged={() => {}} principals={[]} />);
    let dialog = await openMint();
    fireEvent.change(within(dialog).getByLabelText("Service principal name"), { target: { value: "plain" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mint it" }));
    expect(await within(dialog).findByText("k-once")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("k-once")).toBeNull();
    dialog = await openMint();
    expect(within(dialog).queryByText("k-once")).toBeNull();
  });
});

// The user, 2026-11-07: a method is registered in a dialog over the page, opened by its button.
describe("registering a projection method", () => {
  const methods = (onChanged = () => {}) =>
    render(<Methods builtin={["seasonal"]} registered={[]} rule="a method carries its backtest" onChanged={onChanged} />);

  it("opens the form in a dialog; Cancel closes it", async () => {
    methods();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Register a method" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "method-new");
    expect(within(dialog).getByLabelText("Name")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.registerMethod).not.toHaveBeenCalled();
  });

  it("registers from the dialog and closes it", async () => {
    const onChanged = vi.fn();
    methods(onChanged);
    fireEvent.click(screen.getByRole("button", { name: "Register a method" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "vendor-forecaster" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Register it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.registerMethod.mock.calls[0][0]).toMatchObject({ name: "vendor-forecaster", kind: "forecaster" });
    expect(onChanged).toHaveBeenCalled();
  });
});
