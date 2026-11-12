# The coworker

Pramanyx in an agent shell: a chat that asks Pramanyx, and shows what Pramanyx answered as Pramanyx gave it.

The shell is [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT), unmodified. Everything
here is composition — it is built on that shell and changes none of its code. One piece of the shell's own
configuration is copied: its `standard` agent preset, which `profile.patch.yml` restates with the host-reaching
tools taken out, under the shell's MIT licence.

| File | What it is |
|---|---|
| `profile.patch.yml` | An overlay on the shell's stock `web` profile: what is turned off, and what is added. |
| `plugins/answer-card/` | Draws a Pramanyx answer: chart, table, SQL, how it was answered. |
| `plugins/brand/` | Pramanyx's mark, name, tab icon, first-screen wording and look. |
| `plugins/home/` | The first screen under the question box, and the read-only relay it reads Pramanyx through. |
| `build.sh` | Bundles each plugin's browser half; the card carries the chart resolver from `web/components/charts/vega`. |
| `start.sh` | Installs the plugins into the shell's profile and serves the page. |

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
- **The answer card.** It takes over the display of the `ask` tool, and of each custom agent's `ask_<agent>` tool
  the first time one is seen. The chart is drawn by the same resolver the
  app, the PDF export and `POST /charts/svg` use, so it is the chart Pramanyx would have drawn.

- **Pramanyx's identity.** The mark and name in the sidebar and over a new conversation, the tab's title and icon,
  the first screen's wording, the app's dark palette, small corners, and a plain ring where the shell draws its
  animal while an answer is worked on.
- **The first screen.** Under the question box: questions worth asking of a chosen connection, the questions asked
  lately, and a person's own agents. Each row writes a question into the box; nothing is asked until it is sent.
- **A read-only relay**, `/pramanyx/…` on the shell's own server, so the page can read Pramanyx without the API's
  allowed origins being changed. It relays four paths (`/connections`, `/suggestions`, `/agents/custom`,
  `/investigations`), GET and HEAD only, and answers 404 for anything else.

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
- **The relay answers without the page's sign-in.** The shell does not put a plugin's route behind its token. On
  this machine that is the same reach as the Pramanyx API already has; if the page is ever served to other
  machines, the relay must check who is asking first.
- **Four things work around the shell rather than through it**, and each falls back to the shell's own if the shell
  changes: the tab title (a literal in the shell's layout), the first screen's wording (written into the shell's
  dictionary, which cannot be added to), the block under the question box (the shell has no place there) and the
  ring (the shell's drawing has no slot).
- The chosen connection reaches the agent as words at the end of the question. Nothing else carries it yet.
- Reading the suggested questions is a cached read in Pramanyx; the first read for a connection costs a model call.
- The light theme takes only the accent, the corners and the type. The app's light palette was not measured.
- Source Sans 3 is used when it is installed; it is not bundled.
- Still the shell's wording: "Standard mode", "Workspace Write", "Automation tasks", "Deep diving", and its
  preview notice on first open.
- Not built from the target layout: sidebar entries for agents, discovery, a person's own things and schedules;
  chat history grouped by day; pinned items.
- The custom agents' card is untested live: asked for an agent by name, the model used `ask`.
- The person's file panel is still on.
- No test covers the card or the tool removal. The card was checked by eye on three real answers, one of them
  live; the tool removal by asking a fresh session to list its tools.
