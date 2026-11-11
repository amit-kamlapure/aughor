# Arc OC-4's falsifier, read (2026-11-08)

The falsifier for OC-4 was pre-registered on 2026-10-10 (ROADMAP §3.56, `PENDING.md` "OC-4 · the falsifier"). It
became readable on 2026-11-07. The scheduled task written to read it (`aughor-oc4-falsifier-read`) ran on 2026-11-07 at
21:28 UTC but was interrupted at its first command and left no report. This reading was taken by hand on 2026-11-08, at
the user's *"Yes, do both"*. It is read-only: one `GET /ontology/census` on the live install, and one
`GET /ledger/v1/claims` to see who made the claims it counts. No model call, and no setting changed.

## The rule, as written before the readings

- **Baseline:** the journaled reading taken on 2026-10-10 (UTC).
- **Read:** the latest journaled reading on or after 2026-11-07.
- **D** (declared by a person) = processes + promises + rules + impacts + declared actions + links named by a person.
- **L** (leaned on) = automations that read the ontology + Record claims about the ontology.
- **Verdict:** MOVED if D rose by 3 or more, or L by 5 or more; otherwise NOT MOVED.

## The reading

**Baseline** 2026-10-10 23:16 UTC. **Read** 2026-11-07 22:13 UTC. In the 28 days between there are 18 journaled
readings; the 10 missing days are when the machine was off or asleep, or the API was down.

| | Baseline | Read |
|---|---:|---:|
| processes | 5 | 2 |
| promises | 7 | 4 |
| rules | 12 | 3 |
| impacts | 2 | 1 |
| declared actions | 9 | 4 |
| links named by a person | 15 | 4 |
| **D** | **50** | **18** |
| automations that read the ontology | 1 | 1 |
| Record claims about the ontology | 21 | 80 |
| **L** | **22** | **81** |

**Verdict by the rule: MOVED.** L rose by 59, past its threshold of 5. D fell by 32.

## What it means

The rule says MOVED. The reading does not show what MOVED was meant to show: that the cockpit surface gave
**people** a reason to declare or lean on the ontology.

- **Nothing a person declares changed after 2026-10-12.** D fell from 50 to 18 in a single step between the 10-10
  and 10-12 readings, and has been flat at 18 in every reading since. A one-step fall is what declarations leaving the
  census's scope would look like, not people removing them one by one. Its cause is not established here; the
  baseline also included the arc's own receipt declarations, which the rule chose to count.
- **The whole of L's rise is Record claims, and none of them is a person's.** Of the 80 claims about the ontology, 45
  were made by an agent (`agent:ua_aaeb9e07870a`) and 35 by the system: 59 findings, 16 observations, 5 hypotheses.
  They rose steadily from 10-24 as exploration ran, while all Record claims went from 203 to 1,040. Automations that
  read the ontology stayed at 1 throughout.
- **The caveat the task named applies, in L rather than D.** The census counts declarations and reliance, not whether
  anyone opened a cockpit. Machine-made work inflates it.

So, read as intended, OC-4's falsifier **holds**: the surface was not the bottleneck for people. The step the rule
prescribed for that case was to turn `ontology.cockpit_pieces` back off and re-survey the arc. That flag no longer
exists: every flag was removed on 2026-10-28 (#634, ROADMAP §3.65), so the cockpit pieces are part of the platform.

**What is left is the user's decision, recommended, not taken:**
- Re-survey the arc: what a person would need before declaring a process, a promise or an action.
- ~~Optionally, count a person's reliance apart from an agent's in the census.~~ Done the same day: every reading
  now carries `leaned_on.record.about_the_ontology_by` (person · agent · system) beside the unchanged total.

The verdict was decided by the numbers above; the reading of it is this document's.
