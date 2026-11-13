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
- **The shell's own account**: its sign-in, its account settings, its session-log export and "Feedback" entry.
  A person here is who Pramanyx says they are.

The overlay is passed on the command line, so it outranks the Settings page: a row turned off here cannot be
turned back on from the interface.

## What is on

- **Pramanyx's model door** (`pramanyx/routers/model_door.py`). The coworker has no model key of its own: it asks
  Pramanyx, which asks the organisation's provider, checks the usage caps first and records the call. Its model
  picker lists the organisation's three roles — narrator, coder, fast — and which model each is, is chosen in
  Pramanyx. The door is an organisation's setting, off by default; closed, the coworker shows the door's own
  sentence saying so and where an admin opens it.
- **Pramanyx's MCP server** (`python -m pramanyx.mcp`), a thin client of the running API. The agent reaches
  Pramanyx through it and through nothing else.
- **The answer card.** It takes over the display of the `ask` tool, and of each custom agent's `ask_<agent>` tool
  the first time one is seen. The chart is drawn by the same resolver the
  app, the PDF export and `POST /charts/svg` use, so it is the chart Pramanyx would have drawn.

- **The work, readable.** A turn's steps read down one line: the agent's own sentence, with a dot, then the calls
  made for it as rows named by what they found — "Total GMV by platform, led by the largest shop · 5 rows" for an
  answer, "Read the definition of the metric: gmv" for a read. A row opens to the SQL and the rows, or to what
  came back. The shell's second fold, one per group of calls, is gone; the turn's own fold stays, and folds all
  of it — the calls and what was said between them — down to the answer.
- **A running turn is folded to its latest row.** While an answer is worked on, one row shows — the call still
  running, or the last one made — above the shell's running line, which carries "Show the work" to open it all.
  The shell keeps a running turn wide open; a long one pushed the question off the screen. The next run starts
  folded again.
- **A result with no query in it gets no card.** When a question is declined, or answered in words with nothing
  run, there is no chart, table or SQL to draw. It is a row in the work that reads "no query run" and opens to
  the words; the agent is told to ask again another way and, if that fails, to say so in its reply.
- **One voice.** The coworker is part of the platform and speaks as it: "I checked the approved definition", never
  "I asked Pramanyx" or "Pramanyx flagged". The agent's instructions say so, and say the tools are its own ways
  of working; the cards, the steps and the first screen do not name Pramanyx as another party.
- **Was this right?** Under an answer, Right and Wrong. Both go to Pramanyx as the app's own control sends them:
  the judgement to `/chat/feedback`, and — when a person says what was wrong, or gives the SQL that would have
  been right — a verdict to `/verify/verdict`, which later answers on the connection are given. The page asks its
  own server (`/pramanyx-feedback`, `/pramanyx-verdict`) and the server asks Pramanyx. These are the only writes
  the page can make, and the route is narrow: POST and JSON only, refused when a browser marks the request as
  another site's, ids checked, the body rebuilt from named fields, two fixed destinations. What was said is
  remembered in the browser by the answer's id, so a card opened again says it and does not ask twice.
- **Pramanyx's identity.** The mark and name in the sidebar and over a new conversation, the tab's title and icon,
  the first screen's wording, the app's dark palette, small corners, and a plain ring where the shell draws its
  animal while an answer is worked on.
- **The sidebar.** New conversation, Agents, Schedules, and conversations in one newest-first list. Agents opens a
  page of a person's own agents; asking one begins a new conversation. Schedules is the shell's own scheduled
  runs, reworded. The one-list view is the shell's own option, chosen once on a first visit.
- **The first screen.** The mark on a tile over a large headline, then the question box. Under it: questions worth
  asking of a chosen connection as plain lines, and two cards — the questions asked lately (each with its
  connection and how long ago) and a person's own agents. Each row writes a question into the box; nothing is
  asked until it is sent. The tile, the headline size and the box's corners restyle the shell's own elements by
  the names its stylesheet gives them, and fall back to the shell's look if it renames them.
- **A workspace per connection.** At start, each Pramanyx connection gets a folder whose `AGENTS.md` names it, and
  a workspace over that folder titled with the connection's name. The shell gives its agent that file before the
  first question, so the shell's own picker above the question box chooses the connection and the agent is told
  it in its instructions, not in the person's question.
- **A read-only relay**, `/pramanyx/…` on the shell's own server, so the page can read Pramanyx without the API's
  allowed origins being changed. It relays four paths (`/connections`, `/suggestions`, `/agents/custom`,
  `/investigations`), GET and HEAD only, and answers 404 for anything else.

## Run it

```sh
./start.sh
```

Needs Node 24.9+, pnpm, and the Pramanyx API running. Open the address it prints. No model key is asked for: an
admin allows "Let the coworker ask its models through Pramanyx" in Settings ▸ Organization, once.

## What is not done

- A deep analysis is one named row that opens to what came back. Its own steps — baseline, decomposition, what
  each concluded — are not drawn, and it has no card.
- A Pramanyx tool added since this was written, and each custom agent's, is named from the end of the first turn
  that calls it; until then that one call shows the shell's plain row.
- The chart is drawn from the answer's grid and chart type. The app's own `chart_config` and column units are
  not carried over MCP yet, so a chart the app would have labelled or formatted specially is drawn plainly here.
- A result longer than the shell's cap reaches the page cut short. The card reads it without its receipt; a
  result cut inside its rows is not drawn.
- **The relay and the two feedback routes answer without the page's sign-in.** The shell does not put a plugin's
  route behind its token. On this machine that is the same reach as the Pramanyx API already has; if the page is
  ever served to other machines, they must check who is asking first — the feedback routes above all, since they
  write.
- Right and Wrong have not been pressed on a live answer. The route is covered by a test against a stand-in
  Pramanyx (what is sent on, and eleven refusals), checked by breaking each guard in turn; the press itself is a
  person's statement and was left to a person.
- A words-only result is told by what it lacks (no SQL, no rows). Pramanyx says which kind of answer it gave in
  its stream; the MCP client does not carry that yet.
- "Show the work" is a button put on the shell's running line by hand, since the shell has no place there. If the
  shell changes that line, the work stays folded while it runs and opens when the turn ends.
- The voice is an instruction to a model, checked on two live answers. The MCP server's own tool descriptions
  still speak of Pramanyx as someone else, because other callers read them.
- A conversation is about a connection because the agent is told so, not because anything holds it there: it can
  still list connections and ask another. Nothing fixes a conversation to a set of tables.
- **Four things work around the shell rather than through it**, and each falls back to the shell's own if the shell
  changes: the tab title (a literal in the shell's layout), the first screen's wording (written into the shell's
  dictionary, which cannot be added to), the block under the question box (the shell has no place there) and the
  ring (the shell's drawing has no slot).
- A connection added in Pramanyx appears here on the next start. The folder the shell was first started in stays
  in the picker as a workspace of its own; a question asked there names its connection in words.
- Reading the suggested questions is a cached read in Pramanyx; the first read for a connection costs a model call.
- The light theme takes only the accent, the corners and the type. The app's light palette was not measured.
- Source Sans 3 is used when it is installed; it is not bundled.
- Still the shell's wording: "Standard mode", "Workspace Write", "Deep diving", "New Session" on an untitled
  conversation, and its preview notice on first open.
- Not built from the target layout: sidebar entries for discovery and a person's own things; day headings in the
  conversation list (the shell's list has no place for them, and replacing its list would drop its per-row
  rename, archive and delete); pinned items.
- **A schedule made here spends Pramanyx model calls unattended**, and Pramanyx's own setting for scheduled model
  work does not see it: the run arrives as an ordinary question over MCP.
- The door relays to a provider on the chat-completions wire. An organisation whose roles are bound to one that
  is not (Anthropic's own API today) is told so by name, and the coworker cannot answer until a role is bound to
  one that is.
- The words of a coworker conversation are not kept in Pramanyx's model-call record; the call, its model, its
  tokens and who asked are.
- On an install where Pramanyx does not require identity, a question from here is the local operator's, the same
  as in the app. Where identity is required, every person here is the one principal the MCP server was started
  as.
- Nothing in the app leads here, and light or dark is chosen again here.
- A custom agent's answer has a card, seen live once. It has no Right and Wrong: the agent's answer does not say
  which connection it was for. An agent's turn may run several queries; the card shows the last one's grid and
  SQL, which is what the platform's fold keeps, and that is not always the one the answer is about.
- The person's file panel is still on.
- No test covers the card's drawing or the tool removal. `node --test plugins/answer-card/test/feedback-route.test.mjs`
  covers the feedback routes. The card was checked by eye on three real answers, one of them
  live; the tool removal by asking a fresh session to list its tools.
