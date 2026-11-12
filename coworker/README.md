# The coworker

Pramanyx in an agent shell: a chat that asks Pramanyx, and shows what Pramanyx answered as Pramanyx gave it.

The shell is [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT), unmodified. Everything
here is composition — it is built on that shell and changes none of its code. One piece of the shell's own
configuration is copied: its `standard` agent preset, which `profile.patch.yml` restates with the host-reaching
tools taken out, under the shell's MIT licence.

| File | What it is |
|---|---|
| `profile.patch.yml` | An overlay on the shell's stock `web` profile: what is turned off, and what is added. |
| `plugins/answer-card/` | A browser plugin that draws a Pramanyx answer: chart, table, SQL, how it was answered. |
| `build.sh` | Bundles the card with the chart resolver from `web/components/charts/vega`. |
| `start.sh` | Installs the card into the shell's profile and serves the page. |

## What is off, and why

- **The agent's shell, file tools, web search and web fetch.** A business answer comes from Pramanyx's guarded
  path. An agent that could run its own query against the warehouse would skip every check Pramanyx makes.
- **The same tools inside the agent preset.** An agent's tools are mounted in its preset, not in the rows that
  provide them: turning the rows off alone left every tool in the agent's hands. The overlay replaces the shell's
  `standard` preset with a copy that has none of them, and turns the other presets off. That copy was taken from
  shell 0.2.2-rc.1 and has to be taken again when the shell is upgraded.
- **The person's terminal, the embedded browser, and installing plugins from the page.** Each is a way back to
  the above.
- **Everything that reports to the shell's maker**, and the feedback buttons that would feed it.

The overlay is passed on the command line, so it outranks the Settings page: a row turned off here cannot be
turned back on from the interface.

## What is on

- **Pramanyx's MCP server** (`python -m pramanyx.mcp`), a thin client of the running API. The agent reaches
  Pramanyx through it and through nothing else.
- **The answer card.** It takes over the display of the `ask` tool. The chart is drawn by the same resolver the
  app, the PDF export and `POST /charts/svg` use, so it is the chart Pramanyx would have drawn.

## Run it

```sh
./start.sh
```

Needs Node 24.9+, pnpm, and the Pramanyx API running. Open the address it prints, then choose a model under
Settings → Models. The model is deliberately not set by this folder: Settings refuses to save a provider when a
later layer owns that row.

## What is not done

- Only `ask` has a card. `deep_analysis` and the custom agents' tools still show the shell's plain row.
- The chart is drawn from the answer's grid and chart type. The app's own `chart_config` and column units are
  not carried over MCP yet, so a chart the app would have labelled or formatted specially is drawn plainly here.
- A result longer than the shell's cap reaches the page cut short. The card reads it without its receipt; a
  result cut inside its rows is not drawn.
- The shell's name, mark and colours are still its own.
- The person's file panel is still on.
- No test covers the card or the tool removal. The card was checked by eye on three real answers, one of them
  live; the tool removal by asking a fresh session to list its tools.
