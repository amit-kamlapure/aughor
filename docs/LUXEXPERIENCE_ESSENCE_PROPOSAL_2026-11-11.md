# LuxExperience — the essence of the business, as a proposal

**Status:** a draft for review, 2026-11-11. Nothing here is applied. Every count and cardinality below was read from
the live ontology of connection `dcc63d83`, schema `luxexperience` (`GET /object-types`, `GET /object-types/{type}`),
on 2026-11-10. Where I am judging rather than reading, the line says so.

## The finding

The ontology holds **33 entities because the warehouse holds 33 tables**. None is folded into another: no entity has
a part, none is absorbed, none has a second binding.

The business is not 33 things. Read by what the data itself measured, it is **11 things**, 2 pieces of reference,
and 20 tables that are a part, a facet or a history of one of the 11.

Most of the measurement is already done. The builder has proposed **64 bindings** on these entities — each counted,
each with its coverage — and none has been confirmed. **16 of the 20 folds below already have one.** The fold was
found; nobody took the step from "this table can be read under Order" to "so it is not an entity of its own".

The proposals are evidence, not the decision. The builder proposes a binding wherever one table carries another's
key, so it also proposes reading Customers under Platform and Orders under Customer. Which of those is a fold and
which is a link between two things is the judgment this document makes: **a table folds when nothing else hangs off
it and it has no life of its own.**

## The 11 things

| Thing | Objects | Why it is a thing |
|---|---:|---|
| **Platform** | 5 | The storefronts of the group. 18 of the 49 links point at it; everything happens on one. Filed today as reference data. |
| **Customer** | 35,136 | Orders, tickets, clienteling, attendance and sessions all point at it. |
| **Order** | 146,009 | The transaction. 12 links; lines, payment, attribution and shipment all hang off its key. |
| **Product** | 8,600 | What is sold. Variants, prices and stock all hang off its key. |
| **Brand** | 70 | Whose product it is. **Not linked to Product today** (see Gaps). |
| **Warehouse** | 8 | Where stock is held and orders are dispatched from. |
| **Return** | 85,966 | Has a life of its own: requested, received, refunded. |
| **Stylist** | 60 | The person behind clienteling. |
| **Service Ticket** | 13,712 | A case raised by a customer about an order. *Judgment — see Open questions.* |
| **Business Event** | 66 | Events the business runs, which customers attend. |
| **Corporate Entity** | 6 | The group's legal entities. **Linked to nothing today** (see Gaps). |

Reference, shown as attributes rather than structures: **Country** (35) and **Date** (2,312 — a calendar; an order's
`order_date` already says what "placed on Date" says).

## Where the other 20 tables go

"Proposed binding" means the builder already measured this fold and it waits for a person.

| Table (entity today) | Rows | Folds into | As | What the data measured |
|---|---:|---|---|---|
| consent (Consent) | 35,136 | Customer | facet | 1:1; proposed binding covers 35,136 of 35,136 customers |
| email_engagement (Email Engagement) | 35,136 | Customer | facet | 1:1; covers 35,136 of 35,136 |
| clienteling_interactions (Clienteling Interaction) | 7,399 | Customer | history | proposed binding: 7,399 rows over 1,233 customers; each led by one Stylist |
| event_attendance (Event Attendance) | 1,642 | Customer | history | proposed binding: 1,642 rows over 836 customers; each at one Business Event |
| web_sessions (Web Session) | 4,814,660 | Customer | history | 2,465,476 rows name a customer (24,238 of them); 119,262 convert to an order |
| web_events (Web Event) | 4,168,441 | Web Session | part | N:1 to its session; 3,833,689 view a product |
| order_items (Order Line) | 274,249 | Order | part | proposed binding: 274,249 lines over 146,009 orders, all of them |
| payments (Payment) | 146,009 | Order | facet | 1:1; covers 146,009 of 146,009 |
| marketing_attribution (Marketing Attribution) | 146,009 | Order | facet | 1:1; covers 146,009 of 146,009 |
| shipments (Shipment) | 140,177 | Order | facet | 1:1; covers 140,177 of 146,009 — 5,832 orders have no shipment. *Judgment — see Open questions.* |
| product_variants (Product Variant) | 37,783 | Product | part | proposed binding: 37,783 rows over all 8,600 products |
| price_history (Price Change) | 26,005 | Product | history | proposed binding: 26,005 rows over all 8,600 products |
| inventory_snapshots (Inventory Snapshot) | 172,000 | Product | history | proposed binding: 172,000 rows over all 8,600 products; each held at one Warehouse |
| return_logistics (Return Shipment) | 85,966 | Return | facet | 1:1; covers 85,966 of 85,966 |
| marketing_campaigns (Marketing Campaign) | 453 | Platform | history | N:1 to Platform; its own description says it is yearly figures per platform and channel, not a campaign |
| financial_summary (Financial Summary) | 25 | Platform | history | N:1 to Platform; one row per platform and fiscal year |
| ownership (Ownership) | 12 | Platform | history | N:1 to Platform: who owned it, when |
| brand_collaborations (Brand Collaboration) | 62 | Platform | history | N:1 to Platform. Belongs under Brand too once Brand is linked |
| group_financials (Group Financial) | 6 | Corporate Entity | history | keyed by fiscal year; **no link exists** to attach it by |
| corporate_events (Corporate Event) | 14 | Corporate Entity | history | keyed by date; **no link exists** to attach it by |

Check: 11 things + 2 reference + 20 folded = 33.

## The processes the data can carry

LuxExperience has no process declared. Two can be, from columns that exist:

- **Order fulfilment**, on Order: *placed* (`order_date`) → *shipped* (`ship_date`). The second moment lives on
  `shipments`, so this process cannot be declared until Shipment is read under Order — the fold is what makes it
  possible. There is **no delivered moment**: `shipments` carries `delivery_days`, a number, not a date.
- **Return**, on Return: *requested* (`return_date`) → *received* (`received_date`) → *refunded*
  (`refund_completed_date`). The last two live on `return_logistics`, so again the fold comes first.

Two more are the business's own but **cannot be declared from this data**: clienteling (an interaction has one date
and no stages) and campaign-to-order (campaigns are yearly totals).

One figure worth a person's eye before any promise is set: returns cover **67,872 of 146,009 orders**.

## Gaps the data shows

- **Brand is linked to nothing.** `products.brand` and `brands.brand` are both text; no link was found on the name.
  A link has to be declared and counted before Brand can stand beside Product.
- **Corporate Entity, Group Financial and Corporate Event are linked to nothing.** The company half of the twin
  cannot be drawn connected until `orders.parent_entity` or `financial_summary.owner_during_fy` is tried as the link.
- **Stock is per product, not per variant.** `inventory_snapshots` carries `product_id` only, and no table links an
  order line to a variant.
- **No delivered date.** On-time delivery cannot be promised or measured as it stands.
- **Web tables were not counted as entities** (their row count is blank on the entity map), though the proposed
  bindings count them.

## What it takes in the product

**Corrected 2026-11-11, after reading the code I should have read first.** An earlier version of this section said
the product could not fold a table without leaving its entity standing. That was wrong. The platform already has
every piece:

- **Parts and absorption** (ON-7, `pramanyx/ontology/parts.py`). A table is read under its entity through a binding,
  and its own entity is marked a part. Nothing is deleted: the part stays an entity, its objects, links and pages
  keep working by name, and it is hidden from the map and listed under its parent.
- **An explorer that maps the business first** (ON-7b, `pramanyx/ontology/explorer.py`). It reads a connection's
  source catalogue and proposes entities, parts and links; each is measured before it lands and stays proposed until
  a person confirms it. It runs on demand, because its falsifier fired once: a draft fused what the hand-made
  reference keeps apart.
- **A package's own folds** (`POST /ontology/explore/pack`): core-ecommerce already says an order's lines are its
  parts.

**And LuxExperience's essence was already declared by hand.** The repository ships it under
`data/shipped/ontology_overrides/key=luxexperience`: Order with payments, shipments and lines folded in, Customer,
Product and Return, three links, seven rules, two metrics, one action, and the same two processes this document
arrives at (`order_to_shipment`, `return_to_refund`). It was measured on an earlier connection (914df862) on
2026-09-15.

**None of it reaches the live connection.** Shipped declarations are matched by a connection's scope key, and
`dcc63d83` has none set. That, not a missing feature, is why the live ontology shows 33 unfolded entities.

So for LuxExperience the work is small: set the connection's scope key to `luxexperience` and measure the shipped
declarations on it, then decide the folds this document adds beyond them (Customer's consent and email engagement,
Product's variants, prices and stock, Platform as a thing). Nothing new has to be measured for the 16 folds that
already have a proposed binding; the other four have none: `web_events`, `ownership`, `group_financials` and
`corporate_events`.

## What the Atlas would draw

Eleven structures and two routes, each labelled, instead of 33 boxes: the platforms; customers with their stylists,
tickets and events; products with their brand; warehouses; and two routes — an order placed and shipped, a return
requested, received and refunded.

## Open questions for you

- **Shipment: a facet of Order, or a thing?** The data says one shipment per order, never two. I folded it. If the
  business thinks in parcels, it stays a thing.
- **Service Ticket: a thing, or Customer's history?** I kept it because a ticket is worked on; its stages are not in
  the data I read.
- **Return: a thing, or a part of Order?** I kept it because it has its own three moments.
- **Platform:** the word is the table's. If the business says "storefront" or "banner", the entity should too.

## Where it stands (2026-11-11, evening)

| Step | Entities standing on their own | State |
|---|---:|---|
| Before | 33 | one entity per table |
| Scope key set, six parts marked | 27 | **release 3, in force** — the six the measured reference absorbs |
| Four more folds | 23 | **in the draft**, not published |

The four in the draft, each bound and counted on the live data and classed safe by the release check:

| Table | Under | Binding | Counted |
|---|---|---|---|
| consent | Customer | static, 5 properties | 35,136 rows, one per customer, all 35,136 covered |
| email_engagement | Customer | static, 5 properties | 35,136 rows, one per customer, all covered |
| marketing_attribution | Order | static, 5 properties | 146,492 rows, one per order, all covered |
| product_variants | Product | detail, one rollup (`variant_count`) | 37,783 rows over all 8,600 products |

**Not drafted, and why.** These go beyond what the reference ontology ever folded, and each has a reason the fold is
not clean. They should be decided one by one, and proven on the evaluation set before they are published:

- **Two parents.** Clienteling Interaction (Customer and Stylist), Event Attendance (Customer and Business Event),
  Inventory Snapshot (Product and Warehouse). A part has one parent; folding under either hides it from the other.
- **Half of it has no parent.** Web Session: 2,465,476 of 4,814,660 sessions name a customer. The rest are anonymous
  and would have no home under Customer.
- **The tables questions are asked of.** Marketing Campaign, Financial Summary, Ownership and Brand Collaboration
  under Platform. A part is hidden from the agent's catalogue; hiding the finance and marketing figures is untested.
- **Cannot be bound.** Web Event (its session has no counted key), Group Financial and Corporate Event (no link).

## Closing the open items (2026-11-11, late)

**Release 4 is in force:** 23 entities stand on their own, 10 are parts.

### The promises

- **Shipping, within 2 days — it really never breaks.** Every shipped order ships 1 day (122,953) or 2 days (17,677)
  after it was placed. The promise is read from the right two dates; this data simply never ships late.
- **The 5,858 "overdue" orders were cancelled orders.** The process declared no way to leave it, so 5,862 cancelled
  orders, none of which has a shipment, counted as open and past the promise for ever. **In the draft:** the process
  now says an order leaves when its status is `cancelled`. Counted with it: 5,862 left, none open, none overdue. The
  release check classes this as a change of meaning, as it should.
- **Refund, within 10 days of receipt — read from the wrong moment.** 35,662 of 86,287 returns are refunded BEFORE
  the item is received, by either refund method, so the gap from receipt runs from −6 to +8 days and can never pass
  10. Counted from the day the return was requested, a refund takes a median of 7 days and at most 12, and **15,651
  returns (18.1%) take more than 10.** That is the promise the data can break. **Not changed:** what the business
  promises about refunds is its own to say.

### The missing links

- **Brand ↔ Product — declared, in the draft.** `products.brand` matches `brands.brand` for all 70 brands and every
  one of the 8,600 products; measured N:1.
- **The corporate tables — the data cannot link them.** Their entity names are free text: none of the 10 names in
  `corporate_events` and none of the 3 in `group_financials` matches `corporate_entities`, and `ownership` matches 3
  of 5 (`orders.parent_entity` matches 2 of 3). They stay unlinked until the source carries a key.

### The ten folds that were held back

None of them is folded, and none should be on this data:

- **Records of activity between two things** — Clienteling Interaction, Event Attendance, Inventory Snapshot. They
  are not parts; a part has one parent. They stay entities.
- **Web Session, Web Event** — half the sessions name no customer. They stay entities.
- **Marketing Campaign, Financial Summary, Ownership, Brand Collaboration** — the tables finance and marketing
  questions are asked of. They stay entities.
- **Group Financial, Corporate Event** — cannot be linked (above).

**So the ontology settles at 23 entities, not 13.** The first draft of this document was wrong to count on folding
alone: what stands between 23 and a dozen is not more parts, it is the difference between a THING and a RECORD OF
ACTIVITY about things. That difference belongs to the picture, not to the ontology — the agents need the records as
entities.

### The Atlas

The Atlas now draws that difference. An entity whose rows are events is marked on the ground between the things it
links, instead of being built as a structure. LuxExperience at release 4 draws **13 structures, 8 records of
activity and 2 routes** — where it drew 33 boxes this morning — and no entity was changed to get there.
