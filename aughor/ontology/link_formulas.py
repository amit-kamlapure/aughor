"""PENDING item 29 (ROADMAP §6 item 62) — a score on objects, the SQL stand-in: two formula properties offered on an
entity from the ontology's own shape, with no model binding, no model call and no warehouse read.

For an entity with a MEASURED to-many link to an entity that names its time (`created_at_col` — a date or a timestamp
of its own), the platform offers:

* **the days since the latest linked object** — today minus the latest linked moment, in whole calendar days, empty
  for an object nothing links to (negative when the latest is dated after today: the data's own reading); and
* **how many linked objects fall in the last 90 days** — dated today or in the 89 days before it, the window the object
  door's ``in_last 90`` keeps; one dated after today is not in it. 0 for an object nothing links to.

Each is a formula the formula law reads (an aggregate across one to-many link, pre-aggregated per key by the object
compiler — `object_query._Compiler.link_aggregate`), checked through that compiler before it is offered, so an offer
the compiler would refuse is not shown.

**Offered, never written.** The offers are computed from the served graph on every read and stored nowhere. A person
takes one by declaring it through the expression door (``PUT /ontology/entities/{id}/expressions/{name}``, the body
each offer carries): the door verifies it through the compiler on up to 1,000 objects, stamps the offer as the
formula's provenance (`offered_formula` — read by the server, never sent by a caller), records who declared it, and the
change waits in the draft until a person publishes it — the release's own law (OC-2). Not the inbox: ROADMAP §6 item
61 — Attention takes no formula; structure is published once, in the Ontology.

**Withheld is said.** Every to-many link of an entity that is not offered is listed once, with why: the link is not
traversable (its own measured reason), the entity it reaches names no time, the time is not a date or a time, the link
joins on the time itself, the reached entity lives on another connection or in the platform's edit layer, no name
tells the link apart from another, or the formula is not one the platform writes for this engine. Two links on the
same columns are one join — the builder's and a person's declared one, as on theLook — read through the person's,
by the name that names it alone; the other is said as read instead.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from aughor.ontology.models import OntologyEntity, OntologyGraph

#: The window the count reads, in days: today and the days before it, as the object door's `in_last` reads N days.
WINDOW_DAYS = 90
#: The engines the platform writes these two formulas for — each reads "the whole days from a date to today" as an
#: integer through the compiler's own reading of a formula (BigQuery's date subtraction is an INTERVAL, so it is
#: written there through `UNIX_DATE`). Another engine is said, never guessed at.
WRITTEN_FOR = ("duckdb", "postgres", "redshift", "snowflake", "bigquery")
_NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def days_before_today(moment: str, dialect: str) -> str:
    """The whole calendar days from ``moment`` (SQL) to today, as the formula is written for ``dialect``."""
    day = f"CAST({moment} AS DATE)"
    if dialect == "bigquery":
        return f"UNIX_DATE(CURRENT_DATE) - UNIX_DATE({day})"
    return f"CURRENT_DATE - {day}"


def _formulas(link: str, time: str, tag: str, target: OntologyEntity, dialect: str) -> list[dict]:
    reached, moment = target.display_name or target.id, f"{link}.{time}"
    return [
        {"name": f"days_since_last_{tag}", "unit": "days", "semantic_type": "measure", "measures": "recency",
         "expression": days_before_today(f"MAX({moment})", dialect),
         "description": (f"Whole days from the latest {reached} linked through {link} (its {time}) to today; empty when "
                         "none is linked")},
        {"name": f"{tag}_count_last_{WINDOW_DAYS}_days", "unit": "", "semantic_type": "measure", "measures": "frequency",
         "expression": (f"COUNT(CASE WHEN {days_before_today(moment, dialect)} BETWEEN 0 AND {WINDOW_DAYS - 1} "
                        "THEN 1 END)"),
         "description": (f"How many {reached} objects linked through {link} are dated ({time}) today or in the "
                         f"{WINDOW_DAYS - 1} days before it")},
    ]


def _provenance(formula: dict, entity: OntologyEntity, link: Any, seg: str, time: str) -> str:
    what = (f"the days since the latest {link.target.id}" if formula["measures"] == "recency"
            else f"how many {link.target.id} objects fall in the last {WINDOW_DAYS} days")
    return (f"offered by the platform from the ontology's shape: {what}, across the measured to-many link {seg} "
            f"({entity.id} → {link.target.id}, {link.label}), dated by {link.target.id}.{time} (PENDING item 29); no "
            "model wrote it")


def _not_offered(entity: OntologyEntity, link: Any, why: str) -> dict:
    return {"entity": entity.id, "object_type": entity.api_name, "link": link.name, "to": link.target.id, "why": why}


def _why_not(graph: OntologyGraph, entity: OntologyEntity, link: Any) -> str:
    """Why ``link`` from ``entity`` carries no offer, or ""."""
    from aughor.ontology.security import masked
    from aughor.ontology.sources import entity_source
    from aughor.semantic.object_query import find_property, is_temporal, link_problem
    problem = link_problem(link)
    if problem:
        return problem
    for e in (entity, link.target):
        if e.backing is not None and e.backing.kind == "platform":
            return f"{e.id}'s objects live in the platform's edit layer, which no formula reads"
    if entity_source(graph, link.target) != entity_source(graph, entity):
        return f"{link.target.id} lives on another connection — a formula is read on the connection its type lives on"
    time = link.target.created_at_col or ""
    if not time:
        return f"{link.target.id} names no time, so nothing dates its objects"
    p = find_property(link.target, time)
    if p is None or not is_temporal(p):
        return f"{link.target.id}'s time {time} is not a date or a time of its own"
    if masked(link.target, p.name):
        return f"{link.target.id}.{time} is masked for the reader"
    if time.lower() == (link.remote_col or "").lower():
        return f"the link joins on {link.target.id}.{time} itself, so its latest moment is the object's own key"
    return ""


#: Which of two links on the same columns a formula reads — a person's declaration first, then the one the builder
#: found, then a model's proposal.
_ORIGIN_RANK = {"human": 0, "join_map": 1, "model": 2}


def _segment(links: list, link: Any) -> str:
    """The name a path reaches ``link`` by from its entity — its mechanical name, else its business name — whichever
    names exactly that one link (the compiler refuses a name two links answer to); "" when neither does."""
    for seg in (link.name, link.business):
        low = (seg or "").lower()
        if low and sum(1 for x in links if low in (x.name.lower(), x.business.lower())) == 1:
            return seg
    return ""


def formula_offers(graph: Optional[OntologyGraph], *, entity_id: str = "", dialect: str = "duckdb") -> dict:
    """The formulas offered on each type of ``graph`` (or on ``entity_id`` alone), and each to-many link not offered
    with why. Read from the graph and checked through the object compiler — nothing is written, no warehouse is read."""
    from aughor.ontology.bindings import taken_names
    from aughor.semantic.object_query import formula_problem, object_links
    dialect = (dialect or "duckdb").lower()
    out: dict = {"connection_id": getattr(graph, "connection_id", ""), "schema_name": getattr(graph, "schema_name", ""),
                 "dialect": dialect, "window_days": WINDOW_DAYS, "offers": [], "not_offered": []}
    if graph is None:
        out["said"] = "no ontology is built for this scope"
        return out
    entities = [graph.entities[entity_id]] if entity_id else sorted(graph.entities.values(), key=lambda e: e.api_name)
    said: set = set()

    def withhold(entity: OntologyEntity, link: Any, why: str) -> None:
        if (entity.id, link.rel.id, why) not in said:          # once per link and reason, whatever it costs
            said.add((entity.id, link.rel.id, why))
            out["not_offered"].append(_not_offered(entity, link, why))

    for entity in entities:
        links = object_links(graph, entity)
        many = sorted((h for h in links if not h.to_one), key=lambda x: (x.name, x.rel.id))  # an N:N is said, by its refusal
        # two links on the same columns are one join: a formula reads it once, through the one a person declared
        joins: dict[tuple, list] = {}
        for h in many:
            joins.setdefault((h.target.id, h.local_col.lower(), h.remote_col.lower()), []).append(h)
        chosen = []
        for same in joins.values():
            same.sort(key=lambda x: (_ORIGIN_RANK.get(x.rel.origin, 3), not _segment(links, x)))
            chosen.append(same[0])
            for other in same[1:]:
                withhold(entity, other, f"it joins on the same columns as {_segment(links, same[0]) or same[0].name}, "
                                        "which is read instead")
        reaching: dict[str, int] = {}
        for h in chosen:
            reaching[h.target.id] = reaching.get(h.target.id, 0) + 1
        taken = taken_names(graph, entity, list(entity.bindings or []))
        for h in chosen:
            why = _why_not(graph, entity, h)
            seg = _segment(links, h)
            time = h.target.created_at_col or ""
            if not why and not seg:
                why = (f"'{h.name}' names more than one link from {entity.id}, and no business name tells this one "
                       "apart — name the link")
            if not why and not (_IDENT.match(seg) and _IDENT.match(time)):
                why = f"{seg}.{time} needs quoting in SQL — declare it by hand"
            if not why and dialect not in WRITTEN_FOR:
                why = (f"the platform writes these formulas for {', '.join(WRITTEN_FOR)}; on {dialect} a person declares "
                       "them by hand")
            if why:
                withhold(entity, h, why)
                continue
            tag = h.target.api_name if reaching[h.target.id] == 1 else seg.lower()
            formulas = []
            for f in _formulas(seg, time, tag, h.target, dialect):
                name = f["name"]
                declared = (entity.expressions or {}).get(name)
                if not _NAME.match(name):
                    withhold(entity, h, f"'{name}' is not a property name it may take")
                    continue
                if declared is not None and " ".join(declared.expression.split()) == " ".join(f["expression"].split()):
                    formulas.append({**f, "status": "declared", "verified": declared.verified,
                                     "provenance": declared.provenance})
                    continue
                if name.lower() in taken:
                    withhold(entity, h, f"{taken[name.lower()]} — '{name}' is taken")
                    continue
                problem = formula_problem(graph, entity.api_name, f["expression"], name=name,
                                          purpose=f"the offered formula '{name}'")
                if problem:
                    withhold(entity, h, problem)
                    continue
                provenance = _provenance(f, entity, h, seg, time)
                body = {k: f[k] for k in ("expression", "semantic_type", "unit", "description")}
                formulas.append({**f, "status": "offered", "provenance": provenance,
                                 "declare": {"method": "PUT", "path": f"/ontology/entities/{entity.id}/expressions/{name}",
                                             "body": body}})
            if formulas:
                out["offers"].append({
                    "entity": entity.id, "object_type": entity.api_name, "link": seg, "to": h.target.id,
                    "time": time, "cardinality": h.label, "formulas": formulas,
                    "why": (f"{entity.id} links to {h.target.id} through {seg}, measured {h.label}, and "
                            f"{h.target.id} is dated by {time}")})
    offered = sum(1 for o in out["offers"] for f in o["formulas"] if f["status"] == "offered")
    declared = sum(1 for o in out["offers"] for f in o["formulas"] if f["status"] == "declared")
    out["said"] = (f"{offered} formula{'s' if offered != 1 else ''} offered over {len(out['offers'])} link"
                   f"{'s' if len(out['offers']) != 1 else ''}, {declared} declared already; "
                   f"{len(out['not_offered'])} not offered, each with why")
    return out


def offered_formula(graph: Optional[OntologyGraph], entity: OntologyEntity, name: str, expression: str, *,
                    dialect: str = "duckdb") -> Optional[dict]:
    """The offer ``name`` = ``expression`` on ``entity`` answers, or None — what the expression door stamps as the
    formula's provenance. Read from the graph by the server, so a caller cannot claim an offer that was not made."""
    if graph is None or entity.id not in graph.entities:
        return None
    want = " ".join((expression or "").split())
    offers = formula_offers(graph, entity_id=entity.id, dialect=dialect)
    return next((f for o in offers["offers"] for f in o["formulas"]
                 if f["name"] == name and " ".join(f["expression"].split()) == want), None)
