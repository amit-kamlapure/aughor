// @vitest-environment jsdom
/**
 * Settings ▸ Models — a person adds an inference provider (the user, 2026-11-09: "Silly enough, user cannot add an
 * inference provider in the platform?"). Pinned: the added providers are listed with what each is and whether its key
 * is set; "Add a provider" opens a dialog over the page and a refusal is said inside it; an added one is offered in
 * both pickers by its own name; editing never sends a blank key and the one way to drop a key is said; removing says
 * first what it will clear and after what it did, and the draft follows what is stored.
 */
import { fireEvent, render, screen, waitFor, within } from "@/lib/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getLlmConfig: vi.fn(), setLlmConfig: vi.fn(), getLlmModels: vi.fn(), getUsageReport: vi.fn(),
  testLlmConfig: vi.fn(), cacheProbe: vi.fn(), addLlmModel: vi.fn(), removeLlmModel: vi.fn(),
  addLlmProvider: vi.fn(), editLlmProvider: vi.fn(), removeLlmProvider: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

import { InferencePanel } from "./InferencePanel";

const CAP = { cache_mode: "none", tooling: "none", structured_output: "instructor_emulated",
  token_accounting: "exact", max_context: 32768, privacy_class: "public_api", cost: "unknown" };
const BOUND = { coder: "m-large", narrator: "m-large", fast: "m-small" };
const MISTRAL = { id: "mistral", name: "Mistral", base_url: "https://api.mistral.ai/v1",
  models: ["m-large", "m-small"], key_state: "set" };

function config(over: Record<string, unknown> = {}) {
  return {
    backend: "anthropic", models: BOUND, models_set: BOUND, base_urls: {}, base_urls_set: {},
    keys_set: { anthropic: true, openai: false }, keys_state: { anthropic: "set", openai: "unset" },
    capabilities: { coder: CAP, narrator: CAP, fast: CAP },
    backends: ["anthropic", "openai", "ollama"], needs_key: ["anthropic", "openai"], local_backends: ["ollama"],
    default_models: {}, json_mode: {}, json_mode_backends: [], providers: [],
    fallback: { backend: "", model: "", chain: ["anthropic"], active: false, env_pinned: false },
    ...over,
  };
}
const withMistral = (over: Record<string, unknown> = {}) => config({
  backends: ["anthropic", "openai", "ollama", "mistral"], providers: [MISTRAL],
  keys_set: { anthropic: true, openai: false, mistral: true },
  keys_state: { anthropic: "set", openai: "unset", mistral: "set" }, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getLlmConfig.mockResolvedValue(config());
  api.getLlmModels.mockResolvedValue({ backend: "anthropic", models: [], custom: [], live: true, live_count: 0, error: "", defaults: {} });
  api.getUsageReport.mockResolvedValue({ axes: ["provider", "model"], total_calls: 0, rows: [] });
});

describe("Settings ▸ Models — added providers", () => {
  it("says none is added yet, and what can be", async () => {
    render(<InferencePanel />);
    const card = await screen.findByTestId("llm-added-providers");
    expect(card).toHaveTextContent("None yet. Any endpoint that speaks the OpenAI API can be added");
    expect(within(card).getByRole("button", { name: "Add a provider" })).toBeInTheDocument();
  });

  it("offers OpenAI as a built-in provider", async () => {
    render(<InferencePanel />);
    await screen.findByTestId("llm-added-providers");
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Provider" }), { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "OpenAI" })).toBeInTheDocument();
  });

  it("adds one in a dialog over the page, and it is listed and offered by its name", async () => {
    api.addLlmProvider.mockResolvedValue(withMistral());
    render(<InferencePanel />);
    fireEvent.click(await screen.findByTestId("llm-provider-add"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "llm-provider-dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Mistral" } });
    fireEvent.change(within(dialog).getByLabelText(/Base URL/), { target: { value: "https://api.mistral.ai/v1" } });
    fireEvent.change(within(dialog).getByLabelText(/API key/), { target: { value: "sk-typed" } });
    fireEvent.change(within(dialog).getByLabelText(/Models/), { target: { value: "m-large\nm-small" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add provider" }));

    await waitFor(() => expect(api.addLlmProvider).toHaveBeenCalledWith({
      name: "Mistral", base_url: "https://api.mistral.ai/v1", api_key: "sk-typed", models: ["m-large", "m-small"] }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const row = screen.getByTestId("llm-provider-mistral");
    expect(row).toHaveTextContent("Mistral");
    expect(row).toHaveTextContent("https://api.mistral.ai/v1");
    expect(row).toHaveTextContent("key set");
    expect(row).toHaveTextContent("2 models");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Fallback provider" }), { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Mistral" })).toBeInTheDocument();
  });

  it("says a refusal inside the dialog, which stays open", async () => {
    api.addLlmProvider.mockRejectedValue(new Error(
      "'OpenAI' is the name of a built-in provider (openai), which is already in the list — choose another name."));
    render(<InferencePanel />);
    fireEvent.click(await screen.findByTestId("llm-provider-add"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "OpenAI" } });
    fireEvent.change(within(dialog).getByLabelText(/Base URL/), { target: { value: "https://x.example/v1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add provider" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("is the name of a built-in provider");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("edits with the name fixed, never sends a blank key, and drops one only when asked", async () => {
    api.getLlmConfig.mockResolvedValue(withMistral());
    api.editLlmProvider.mockResolvedValue(withMistral());
    render(<InferencePanel />);
    const row = await screen.findByTestId("llm-provider-mistral");
    fireEvent.click(within(row).getByRole("button", { name: "Edit" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^Name/)).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Base URL/), { target: { value: "https://eu.mistral.ai/v1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.editLlmProvider).toHaveBeenCalledWith("mistral", {
      base_url: "https://eu.mistral.ai/v1", models: ["m-large", "m-small"] }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId("llm-provider-mistral")).getByRole("button", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.editLlmProvider).toHaveBeenLastCalledWith("mistral",
      expect.objectContaining({ api_key: "" })));
  });

  it("says before removing what it will clear, and after what it did; the draft follows what is stored", async () => {
    api.getLlmConfig.mockResolvedValue(withMistral({
      fallback: { backend: "mistral", model: "m-small", chain: ["mistral"], active: false, env_pinned: false } }));
    api.removeLlmProvider.mockResolvedValue({
      removed: "mistral", name: "Mistral",
      said: ["The fallback was Mistral; it is the built-in order again."],
      config: config({ fallback: { backend: "", model: "", chain: ["anthropic"], active: false, env_pinned: false } }),
    });
    render(<InferencePanel />);
    const row = await screen.findByTestId("llm-provider-mistral");
    expect(row).toHaveTextContent("fallback");
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("It is the fallback: the fallback goes back to the built-in order.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Mistral" }));

    await waitFor(() => expect(api.removeLlmProvider).toHaveBeenCalledWith("mistral"));
    expect(await screen.findByTestId("llm-provider-removed")).toHaveTextContent(
      "Mistral is removed. The fallback was Mistral; it is the built-in order again.");
    expect(screen.queryByTestId("llm-provider-mistral")).not.toBeInTheDocument();
    // The draft no longer names it — a Save would otherwise be refused.
    expect(screen.getByRole("combobox", { name: "Fallback provider" })).toHaveTextContent(
      "Built-in order (try each configured provider)");
  });

  it("names an added provider in force by its address, never as running on this machine", async () => {
    api.getLlmConfig.mockResolvedValue(withMistral({ backend: "mistral" }));
    render(<InferencePanel />);
    await waitFor(() => expect(screen.getByTestId("fig-provider-value")).toHaveTextContent("Mistral"));
    expect(screen.getByTestId("fig-provider")).toHaveTextContent("api.mistral.ai");
    expect(screen.getByTestId("fig-provider")).not.toHaveTextContent("runs on this machine");
    expect(screen.getByTestId("llm-provider-mistral")).toHaveTextContent("in use");
  });

  it("tests what is on the form: the models picked beside a provider not yet saved", async () => {
    // 2026-11-09: an added NVIDIA NIM was answered "no model configured" — the test sent the provider, never its models.
    api.getLlmConfig.mockResolvedValue(withMistral());
    api.testLlmConfig.mockResolvedValue({ ok: true, backend: "anthropic", results: [] });
    render(<InferencePanel />);
    await screen.findByTestId("llm-added-providers");
    fireEvent.keyDown(screen.getByTestId("models-tools"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("llm-test"));
    await waitFor(() => expect(api.testLlmConfig).toHaveBeenCalled());
    expect(api.testLlmConfig).toHaveBeenCalledWith("anthropic", undefined, true,
      { coder: "m-large", narrator: "m-large", fast: "m-small" });
  });
});
