// @vitest-environment jsdom
/**
 * Settings ▸ Organization ▸ Models & keys reads the deployment's one list of providers — built-in and added — from the
 * server. It kept its own copy until 2026-11-09, which is how it offered neither OpenAI nor a provider a person added.
 */
import { fireEvent, render, screen, within } from "@/lib/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getOrgLLM: vi.fn(), updateOrgLLM: vi.fn(), clearOrgLLM: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

import { OrgByokSection } from "./OrgByokSection";

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getOrgLLM.mockResolvedValue({
    backends: ["ollama", "anthropic", "openai", "mistral"], keyed: ["anthropic", "openai", "mistral"],
    labels: { mistral: "Mistral" }, configured: false, backend: "", models: {}, keys_set: {}, keys_state: {},
    updated_at: "",
  });
});

describe("Organisation ▸ Models & keys", () => {
  it("offers the server's list, an added provider by its own name, and its key field", async () => {
    render(<OrgByokSection />);
    const select = await screen.findByRole("combobox", { name: "Organisation provider" });
    fireEvent.keyDown(select, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "OpenAI" })).toBeInTheDocument();
    const mistral = screen.getByRole("option", { name: "Mistral" });
    fireEvent.keyDown(mistral, { key: "Enter" });
    const card = screen.getByTestId("org-byok");
    expect(within(card).getByLabelText(/API key/)).toBeInTheDocument();
  });
});
