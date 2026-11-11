# The ontology arc, re-surveyed (2026-11-08)

Punch list item 57. The user decided *"Re-survey it"*: a study, no build (ROADMAP §6 item 62). OC-4's falsifier read
MOVED by its rule, but only on claims an agent or the system made (`docs/OC4_FALSIFIER_READ_2026-11-08.md`). This
study asks what a person would need before they declare a process, a promise or an action, and why none has.

**Method.** Read-only. GETs to the live API at `127.0.0.1:8000`, all on 2026-11-08 between 10:31 and 11:30 UTC. The
code was read on this branch. No model call, no write, no setting changed. One door used, `GET
/ontology/processes/candidates`, runs counting SQL against the warehouse; it writes nothing. Commands are given as
paths. Each one is `curl -s http://127.0.0.1:8000<path>`. Other sessions had uncommitted edits in
`aughor/routers/ontology.py` and `aughor/db/registry.py` during the study. Line numbers there are as read at 11:30
UTC, with the function named.

---

## 1 · The premise, measured

**D has been 18 in every reading since 2026-10-12.** D is processes + promises + rules + impacts + declared actions
+ links named by a person. The census journal holds 21 daily readings (`/ontology/census`, `history`).

| Reading (UTC) | D | L | Entities |
|---|---:|---:|---:|
| 2026-10-09 23:05 | 39 | 12 | 52 |
| 2026-10-10 23:16 (OC-4's baseline) | 50 | 22 | 54 |
| 2026-10-12 01:32 | **18** | 22 | 19 |
| 2026-10-13 → 2026-11-07, 18 readings | 18 every time | 22 → 81 | 61 → 69 |
| live, 2026-11-08 10:31 | 18 | 87 | 69 |

From 10-09 to 10-10, D rose by 11. That was one day of OC-5 to OC-9 receipts.

**Where today's 18 came from.** The live overrides (`/ontology/overrides?connection_id=…`) and their history
(`/ontology/history?kind=…&target_id=…`) show where each one started.

| Scope | D | What wrote it |
|---|---:|---|
| theLook `8233e4fd` · process `order_fulfilment`, 2 promises | 3 | A model proposed it on 09-24 (version 1: *"proposed by model:deepseek/deepseek-v4.1-flash"*). It was confirmed under `sidhasadhak`. Its promises came in 8 versions within 31 s on 10-09 10:44:58–10:45:29, and again on 10-10 01:08: the OC-1 and OC-5 receipts. |
| theLook · rule `completed_orders` | 1 | Proposed by the same model run. Confirmed under `sidhasadhak` on 09-24 21:12. |
| theLook · impact `dispatch_bears_on_delivery` | 1 | Written 10-10 01:10, the OC-5 receipt. |
| theLook · 4 declared actions | 4 | `flag_for_review` on 10-09 14:19 (OC-4). Then `open_case`, `start_work_on_case` and `resolve_case` within 1.03 s on 10-10 02:14:36–37 (OC-6). |
| theLook · 4 links named | 4 | Model-proposed links (run `157886a7cbc7`, 09-14), confirmed 09-23 21:49–21:51. |
| DuckDB `baef6c3e` · ecommerce · 1 process, 2 promises, 2 rules | 5 | Three files written 73 ms apart on 09-13 00:03:28, with the same ids as the shipped `key=olist` seed. |

None of the 18 can be shown to be a person's. The census cannot show it either way:
- A declaration's `source` defaults to `"human"` (`aughor/ontology/overrides.py:323`).
- A process's `origin` defaults to `"human"` (`aughor/ontology/processes.py:237`).
- Without sign-in, every request acts as the computer's login (`aughor/security/authz.py:153-190`). So every
  approval since 10-09 reads `amitkamlapure`, whether the user pressed it or an agent drove the screen.
- The 10-10 baseline of 50 was built the same way: seeds, confirmed model proposals and the arc's receipts. The rule
  chose to count them (`PENDING.md`, the OC-4 line).

**L by who made it.** The census on this branch splits Record claims by author (`aughor/ontology/census.py:119-131`).
The live API does not serve that split yet: `about_the_ontology_by` is absent from the 10:31 reading. Counted by hand
from `/ledger/v1/claims?limit=1000`, which returned 1,000 of 1,047 claims:
- 87 claims are about the ontology, the census's own figure. 52 were made by an agent (`agent:ua_aaeb9e07870a`), 35
  by the system, **0 by a person**.
- A person made 23 of the 1,000 claims.

**Where the person works.** The re-added LuxExperience connection (PostgreSQL `dcc63d83`) is where the person works:
- 532 of the 1,000 claims;
- 21 of the 23 claims a person made: 16 predictions, 4 *said*, 1 finding;
- 35 of the 37 decisions (`/record/decisions?limit=500`).

**On that connection D is 0**: no process, promise, rule, impact, declared action or named link, in 33 entities and
49 links.

**The premise, restated.** Nothing a person declared can be found on this install, before or after 10-12. Where the
person works, nothing is declared at all.

---

## 2 · What happened on 2026-10-12

**Cause: two LuxExperience connections were removed from the registry between the 10-10 23:16 and 10-12 01:32
readings. Their declarations left the census with them. The same day's purge then deleted their files.** No person
withdrew a declaration.

**How we know.** `history` drops each reading's scopes (`census.py:188-197`). The journal keeps them, because
`record_if_due` writes `scopes` into every reading (`census.py:225-227`). So the scopes were read from
`/ledger/v1/events?kind=ontology.census&limit=100`, which returned 21 events.

| Scope on 10-10 23:16 | proc | prom | rules | imp | actions | named links | D | On 10-12 01:32 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| LuxExperience `914df862` · luxexperience | 2 | 3 | 7 | 1 | 5 | 7 | 25 | gone |
| LuxExperience (explorer draft) `b428fce7` | 1 | 0 | 2 | 0 | 0 | 4 | 7 | gone |
| Superstore `8d36d4c2`, spotify `7611b995` ×2, Workspace · traffic | 0 | 0 | 0 | 0 | 0 | 0 | 0 | gone |
| theLook, DuckDB ecommerce and main, Workspace · uber_ncr | | | | | | | 18 | unchanged |

25 + 7 = 32, which is exactly 50 − 18.

- **The census reads only registered connections.** `take_census` loops over `list_connections()`
  (`census.py:158-171`). A removed connection is not "not built". It is absent.
- **They are gone from the disk.** `/connections/914df862/residue` and `/connections/b428fce7/residue` both answer
  `{"residue":{}}`. #608 records the removal default the user set on 10-11 (`862c7d6a`). It also records clearing the
  older removed connections, *"yes clear all of them"* (`71898b57`). Its `c6532062` names *"two removed LuxExperience
  connections"* that the organisation's Order and Customer were bound to (`git show f8752765`).
- **Not one by one.** Had declarations been withdrawn, the two scopes would read lower. They are absent, and every
  other scope reads exactly as before. The approval journal (`/ledger/v1/events?kind=action.approval&limit=1000`,
  514 events from 07-02 to 11-05) shows no ontology withdrawal after 07-02, and no ontology change on any surviving
  scope between 10-10 20:00 and 10-12 02:00. It cannot speak for the removed ids: their rows were swept (next point).
- **The removal's own approval is not in the journal.** A removal sweeps every row whose `conn_id` names the
  connection, except `audit_log` and `session_events` (`aughor/db/purge.py:194-203`). The journal's approval rows
  carry `conn_id`. So the removal is dated by the census readings, not by its own record.
- **The declarations did not come back.** The new connection is PostgreSQL `dcc63d83`:
  - It was listed as not built on 10-12. From 10-13 it has had 33 entities on `luxexperience` and 0 declarations.
  - The repository still ships Lux's declarations under `data/shipped/ontology_overrides/key=luxexperience/` (`git
    ls-files`): 2 processes with 2 promises, 7 rules, 1 action, 3 links, 4 entities and 2 metrics.
  - A seed filed under a scope key reaches only a connection whose settings carry that key
    (`aughor/ontology/overrides.py:117-139`, `scope_key_of` at `aughor/db/registry.py:379-386`).
  - `/connections/dcc63d83/settings` answers `{}`. It has no scope key.

The rest of what 914df862 held was the OC-9 receipt of 10-10 (ROADMAP §3.56): a 7-day receipt promise, the
receipt → refund impact, *Escalate the refund*, and the Case with its three actions. Those had no seed, and they are
gone.

---

## 3 · The path from "I want this process tracked" to a declared process

The process designer replaced the form the walk-through found (`web/components/ontology/ProcessDesigner.tsx`, built
10-09, #596). The walk-through's job 1 is mostly answered:
- stages are named in words;
- moments come with counts;
- statuses can anchor a stage;
- a draft is counted before anything is written;
- the over-a-year ask is put as a question;
- exits can be declared.

The path below is Lux's return-to-refund promise, which can be designed today. `/ontology/processes/candidates?
entity=Return&connection_id=dcc63d83&schema_name=luxexperience` offers 86,199 returns, each with Return Date,
Received Date and Refund Completed Date. The last two are reached through the to-one return logistic.

| # | Where | The person does | What can refuse it |
|---:|---|---|---|
| 1 | Rail | **Ontology** (`web/app/page.tsx:307`) | — |
| 2 | Ontology bar | Picks the connection and the schema. On 10-22 the page opened on the wrong schema (`docs/OLIST_LIVE_RUN_2026-10-22.md`, Gap 11). | "No ontology built for schema …" |
| 3 | Rail › Processes | **New process** (`web/components/ontology/EntityTypeMap.tsx:483-488`) | Not offered on an organisation's ontology (`:291`) |
| 4 | Designer | Process name | "Name the process." (`web/lib/processDraft.ts:118-119`) |
| 5 | | What moves through it: *Return · 86,199* | "Choose what moves through the process." (`:120`) |
| 6–11 | Stages | Three stages, each with a name and *When is it reached?*. *Add a stage* gives the third. | "Name stage n." · "Choose when an object reaches …" (`:122-127`) |
| 12–13 | Promise on *Refunded* | *within days*, then `10` | Seven promise refusals (`:128-139`) |
| — | | Waits 0.9 s (`ProcessDesigner.tsx:74`). The draft is counted by `POST /ontology/processes/preview` (`preview_declared_process`, `aughor/routers/ontology.py:2811-2854`). | 400 · 404 · 409, said under Stages |
| 14 | Before you publish | Answers each ask: *They left the process* or *They really are late* | None. Unanswered asks turn the button into *Declare it anyway*. |
| 15 | Header | **Review and publish** | — |
| 16 | Review | **Declare the process**. This is `POST /ontology/processes`. | The guard first (`_declare_process_core`, `ontology.py:2877`). Then four 400s, a 404, a 409 and a 500 (`:2887-2913`). |
| 17 | Approval dialog | **Approve**. Every ontology write is HIGH risk (`aughor/govern/actions.py:56`), and approving allowlists it for the whole connection (`:180-210`). | Closing the dialog: "Not approved" (`ProcessDesigner.tsx:83-88`) |
| 18 | Designer | **Publish release n**. This is `POST /ontology/release/publish` (`ontology.py:722-739`). | The guard again. Then a 409 while any change is ERR, including any model proposal not yet confirmed (`aughor/ontology/release.py:225-228, 283-290`). |

**18 steps, or 14 using the *Suggested from your data* chips.** A chip sets a stage's name and moment in one press
(`ProcessDesigner.tsx:192-205`). Two of the steps are governance acts, and either can refuse. The approval stands
until revoked:
- On theLook it was revoked on 10-26 at 11:32:27, so the next declaration there meets the dialog.
- On `dcc63d83` it was never given.

**The same task cannot be done for orders.** Lux's shipped `order_to_shipment` promise ("shipped within 2 days")
cannot be designed from Order on the PostgreSQL scope:
- Order offers one moment, Order Date (146,364 orders).
- `ship_date` lives on Shipment, and the designer follows to-one links only
  (`aughor/ontology/process_design.py:111`).
- From Shipment it works: Ship Date, and Order Date through the order, on 140,507 shipments.
- A person who thinks "orders ship within two days" starts from the wrong entity and is not told which one to use.

**An action** (`web/components/ontology/ActionDesigner.tsx`) takes 11 steps from the rail to a button on a dashboard:
- **New action**, a name, the type it is about, the mark's name;
- the mark's value (`yes`) and a required *Reason* question come pre-filled (`web/lib/actionDraft.ts:73-81`);
- Review, Declare, Approve, Publish, then tick a dashboard and **Place**.
- *Tell someone* first needs a destination saved in Notifications (`actionDraft.ts:129`).

**What happened to every attempt since 10-12.** The approval journal holds every ontology write. None of them is a
declaration made in a designer.

| When (UTC) | Scope | Approvals | What it was |
|---|---|---|---|
| 10-22 17:21–17:24 | Workspace · olist | 1 blocked, 16 approved | The live run's *Draft the business* and its nine Confirms (`docs/OLIST_LIVE_RUN_2026-10-22.md` §8–9) |
| 10-26 10:54–11:32 | theLook | 3 blocked, 5 approved | Arc FA receipts. Version 15 of `order_fulfilment` reads *"put back from version 10"*. |
| 10-29 13:09, 10-30 09:07 | Lux `dcc63d83` | 2 blocked | The connection's birth step `business_terms` (§4) |

---

## 4 · What the platform proposes, and what was accepted

| Source | Where it waits | Offered | Accepted | Reached readers |
|---|---|---:|---:|---:|
| The business explorer: processes, rules, links, names, parts (`aughor/ontology/explorer.py`) | The Ontology's draft only | theLook 15 · Olist 10 · Lux PostgreSQL **0** | theLook 7 · Olist 9 | theLook's 7, before releases existed · Olist **0** |
| Warehouse-history candidates (Arc NV-3) | Agent Ops ▸ Attention (`ontology.py:4565`) | Lux 16 measures, 11-04 | 1 (`gmv_eur`, 11-05 09:14) · 15 rejected within 2 s at 10:29:50 | **0**. The one accepted sits in Lux's draft. |
| Engine recommendations | Ontology ▸ Proposals | theLook 3 | 2 (a metric, a table note) | Not part of D |
| Routing proposals | Ontology | 0 everywhere | — | — |
| Proposed declared actions | Attention | 1 (`open_case`, theLook, 10-10) | Rejected 58 s later, by its proposer | — |
| **Promises and actions** | — | **Nothing proposes them** | — | — |

Sources: `/ontology/draft?…&ontology_view=draft` (read without the draft view, every proposal reads *withdrawn*),
`/ontology/release?…`, `/kinetic-actions/inbox?connection_id=…`, `/ontology/recommendations?…&ripe_only=false`,
`/ontology/routing-proposals?…`.

- **Olist: 9 confirmed, 0 published.** Release 1 of `workspace/olist` holds 0 elements. Its draft holds 10 changes,
  every one SAFE: 1 process, 1 rule, 4 links, 4 entities. Nothing blocks *Publish*, and nobody pressed it.
  - The census reads what is published, so its 10-22 17:52 reading still said 0 processes on olist.
  - Published, these would add 5 or 6 to D.
  - The confirms were made by the live run that drove the screen as a customer would, not by a person on their
    own.
- **theLook: 6 proposals have waited 45 days.** Two parts and four link names from the 09-24 run are still
  *proposed*: neither confirmed nor withdrawn.
- **Lux PostgreSQL: the explorer never ran.** The connection's birth runs the business explorer once on a scope
  nobody has explored (`aughor/routers/_shared.py:274-326`).
  - On 10-29 and 10-30 it hit the approval gate: `HTTPException: 428 … 'ontology.override', 'scope': 'dcc63d83'`.
  - The failure was tolerated as *"birth business-terms step failed; the rite stands without it"* (`_shared.py:321-326`;
    `/obs/logs?q=approval_required`).
  - Nobody was asked to approve it. The draft lists no run.
- **The model may not propose a promise or an action.** By design, a proposed process carries stages only (*"how
  fast the business promises to move is the business's to say"*, `explorer.py:285-286, 905-908`). Nothing proposes
  an action.
- **The one time candidates reached the person, the person answered within a day.** The 16 NV-3 candidates went to
  Attention, the queue the person reads. The user asked *"should I again approve in Semantic Layer? … One approval
  door"*. That became §6 item 61 on 11-05, and 15 candidates were rejected that morning.
  - Explorer proposals never go to Attention, Home or the Inbox.
  - Only the four ontology screens read the draft or the release (`ReleaseStrip`, `EntityTypeMap`, the two designers).

---

## 5 · What blocks a person, ranked by evidence

1. **Where the person works, there is nothing to accept and nothing declared.** *Strong.*
   - Lux PostgreSQL carries 35 of 37 decisions and 21 of 23 claims a person made, and D = 0.
   - The platform's step that would propose its processes and rules died on the approval gate, twice and silently.
   - The person's earlier Lux declarations went with `914df862`.
   - The shipped copy cannot reach the new connection without a scope key.
2. **Confirmed is not published, and nothing outside the Ontology says so.** *Strong.*
   - Of the two acceptances on live scopes since 10-12, neither reached a reader: Olist's 9, and Lux's `gmv_eur`.
   - The release strip says *"10 changes waiting to be published"* (`ReleaseStrip.tsx:141-144`), but only on that
     page.
   - A careful run that confirmed all nine still stopped there.
3. **Nothing asks for a promise or an action where decisions are made.** *Moderate.*
   - In the text of the 37 decisions (`/record/decisions`), *segment* appears 27 times. *process* and *promise*
     appear 0 times, and no declared action's id appears.
   - The explorer is barred from proposing a promise.
   - So the three things D counts that only a person can say each start from a blank designer, reached from the
     Ontology rail and nowhere else.
   - One prompt points there: the dashboards' *"No process is declared on this connection yet. Design one in the
     Ontology, with New process."* (`web/components/dashboards/BriefingDashboards.tsx:445`).
4. **Every write is a high-risk act the person approves for the whole connection.** *Moderate.*
   - On 10-22 the gate told a first-time user drafting their own new schema that the click was high-risk, and that
     approving widened to the whole connection (Olist run §8).
   - The same gate is why the platform's own proposals never reached Lux (item 1).
   - A draft write changes nothing a reader sees; publishing does. Yet both are gated alike (`ontology.py:2877, 732`).
5. **The designer reads only to-one links.** *One measured case.* Lux's order-to-shipment promise cannot start from
   Order, and the designer does not say to start from Shipment (§3).
6. **The census cannot tell a person from an agent.** *Structural.* This is not why people do not declare. It is
   why no falsifier can say whether they did (§1). Sign-in was decided on 11-08 (Google OAuth, TENX §7.1 G0) and is
   not built.

**Not shown to be a blocker:** the designer's length. 14 to 18 steps is long, but since 10-12 there has been no
attempt for it to stop: no designer declaration was blocked, abandoned at approval or refused. The data cannot say
whether anyone opened the page (see *Not measured*).

---

## 6 · Options

Each option is written so that its falsifier is set before it is built. "A person" below means a request made
outside any agent run, the stamp approvals already carry (`run_kind`, `aughor/actions/attribution.py:42-56`), until
sign-in exists. That reading needs option D.

**A · Bring Lux's declarations back to the connection the person uses.**
- *Changes:* check each of the 19 files under `key=luxexperience` against `dcc63d83`. `order_to_shipment` will not
  bind on Order (§3), so restate it on Shipment. Then the user sets the scope key in the connection's settings.
- *Cost:* 0.5–1 day. A compile test over shipped declarations already exists
  (`tests/unit/test_shipped_declarations_by_scope_key.py`, `ROADMAP.md:8714`). It binds against recorded schemas, so
  it needs a PostgreSQL recording of `luxexperience`.
- *Falsifier:* D rises without any person, so this moves no falsifier and must be journaled as a restoration. A new
  baseline is taken after it. Then read reliance: if no person's claim or decision on `dcc63d83` cites a promise or
  segment these declarations make within 4 weeks, declarations alone do not create reliance.

**B · Put the platform's proposals where the person decides.**
- *Changes:*
  - The birth's `business_terms` refusal is said on the connection's page with its Approve, not tolerated.
  - Home and Attention say *"n proposals and n confirmed changes wait in the Ontology on <connection>"* and link
    there. Approving stays in the Ontology, as §6 item 61 decided.
  - The designer's review names what is still unpublished.
- *Cost:* 2–3 days, and one model call per scope the person approves.
- *Falsifier:* within 14 days of landing, on `dcc63d83`, a person publishes a release with at least one element.
  Measured by the release's `by` and run stamp, and by when the notice was shown, which B records because nothing
  records page views today. If the notice is shown and nothing is
  published, proposals are not what a person needs: stop B.

**C · Ask for a promise from a decision.**
- *Changes:* when a person books a decision whose expectation is a duration or a rate between two moments (a refund
  lag, a dispatch time), offer *Make it a promise*. It opens the designer with the stages filled in. The person still
  declares. A mockup comes first (`web/AGENTS.md`).
- *Cost:* 3–5 days.
- *Falsifier:* if, in the 4 weeks after landing, at least 5 decisions are booked and no person declares a promise
  from that door, the pull is not there: stop C.

**D · Count who declared.**
- *Changes:* stamp each declaration version with the run it was made in, as approvals are already stamped. The
  census splits D by person · agent run · explorer confirmed · seed, beside the unchanged total, as it now does for L.
  Sign-in later makes *person* exact.
- *Cost:* 1 day.
- *Falsifier:* none, because it is an instrument. Its guard must be mutation-tested: a declaration made inside an
  agent run must never count as a person's.

**E · Stop asking the ontology for a person's declarations.**
- *Changes:* record that on a one-person install the ontology is written by seeds, the explorer and the builder. The
  arc is judged by what a person leans on, not by D.
- *Cost:* 0 days.
- *Falsifier:* if L by a person (claims and decisions citing a segment, promise or action) is still 0 four weeks
  from now, the arc's surfaces are unused. Open no new ontology wave until that changes.

---

## 7 · Recommendation

**D, then B, with A's binding check done as B's first half-day.**
- D first, because without it no option's falsifier can be read the way OC-4's was meant to be.
- B next, because the two strongest blockers are both on B's path: the person's connection holds nothing to accept,
  and the one acceptance path ends in an unpublished draft. The only time candidates reached the queue the person
  reads (NV-3, 11-04), the person engaged within a day.
- A's check tells the user, before they choose, which of Lux's 19 shipped declarations would bind.
- Defer C until B's falsifier reads. Building another way into a draft nobody publishes repeats what §1 measured.
- Do not take E yet: L by a person has never been readable, so it has never been 0 by measurement.

Total: about 3.5–4.5 days, and one model call per scope, only when the person approves it.

---

## 8 · What the user must decide

1. **May the business explorer run on LuxExperience (PostgreSQL)?** One model call. It was blocked twice at birth
   and has never run there.
2. **Does writing to the draft stay a high-risk, connection-wide approval?** The other choice is that only publishing
   is gated. This is a governance posture: if it changes, it is an organisation's setting, off by default (AGENTS.md
   *No feature flags*).
3. **Restore Lux's shipped declarations on `dcc63d83`** (the scope key `luxexperience`)? And do restored seeds count
   in D, or in a new line?
4. **Olist's draft:** publish or discard the 9 changes the 10-22 live run confirmed (10 waiting in all).
5. **The next falsifier:** who counts as a person before sign-in (recommended: a request outside any agent run),
   and the date it is read.

---

## Not measured

- **Whether anyone opened the Ontology page or a designer since 10-12.** No page view is recorded, and the API's
  access log is not journaled.
- **What the explorer would have proposed on Lux PostgreSQL.** It never ran.
- **Who pressed Olist's nine Confirms and Lux's fifteen rejections.** The record names only the install's login.
- **Whether Lux's shipped declarations bind on `dcc63d83`.** That needs a compile against the PostgreSQL schema, or
  setting the scope key, which is a write. Only the candidates door was read (§3).
- **The content of the two blocked birth runs** (`de4d344d5f4f`, `fe056e939312`). Reading a trace writes an access
  audit row (`aughor/routers/obs.py:342-366`), so only the run log's search was read.
- **The removal of `914df862` and `b428fce7` as its own event.** Their rows were swept, so it is dated by the census
  readings.
- **47 of the 1,047 Record claims.** The claims door returns at most 1,000. The count about the ontology, 87,
  matches the census's own total.
