/** Display names for the LLM providers (backends) the platform can bind.
 *
 *  Shared by the Models tab (Settings → Models, the one place a model is chosen)
 *  and every surface that only *names* the provider — so "openrouter" reads the
 *  same everywhere without each panel keeping its own copy of this map.
 *
 *  These are the BUILT-IN ones. A provider a person added carries the name they gave it
 *  (`LlmConfig.providers`, `OrgLLMConfig.labels`); `providerLabel` reads both.
 */
export const BACKEND_LABEL: Record<string, string> = {
  ollama: "Ollama (local)",
  lmstudio: "LM Studio (local)",
  groq: "Groq",
  together: "Together AI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
};

/** A provider's name: an added one's own, else the built-in label, else its id. */
export function providerLabel(id: string, added?: Record<string, string>): string {
  return added?.[id] ?? BACKEND_LABEL[id] ?? id;
}
