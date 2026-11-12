"""The Briefing as a running account: an edition's figures laid on the business, and its storylines.

The user, 2026-11-12, on the edition page: *"Argue how actionable this is? And is it role based?"* An edition was
blocks of equal weight, and almost every step it offered was "look more". This module reads a WRITTEN edition and
says of it what makes a page something to act on:

* **stages** — every measured figure, placed on the part of the business it reads on (the metric map's areas,
  `ranges.areas_of`; a metric the map does not place falls back to its reading-order kind);
* **storylines** — one per part of the business where a figure left its usual range, and one per decision in the
  Record the edition cites. Each says its **owner**, what it is **worth**, the **decision** on it and when it is
  **checked** — or says plainly which of the four is missing.

Nothing here is written by a model and nothing is stored: it is a projection of the edition, the metric registry
and the Record, computed on a read. So there is no new store —

* the owner of a storyline is the owner of the metric it stands on (`MetricDefinition.owner`), or the owner the
  Record gives its decision;
* the decision is the Record's (`record.decisions`), found by the metric it names as its objective, or the
  edition's own `decision` block while nobody has taken it;
* the check is the Record's review date and whether an expectation was declared before the fact.

A block the model wrote belongs to the storyline it cites; a block that cites none follows the block before it
(an edition is written in order: the context comes after its subject). A block that belongs to no storyline is
left where it was — the page draws it under the storylines, never drops it.
"""
from __future__ import annotations

import re
from typing import Callable, Optional

_CITE_RE = re.compile(r"\{[^{}|]+\|([A-Za-z0-9_\-]+)\}")
_ORDINAL = {2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth"}
#: Units a difference can be priced in. A rate, a count or a number of days is not money, and is not priced.
_MONEY = re.compile(r"^[A-Z]{3}$")
#: The kinds a metric the map does not place is read as (`reading_order.KINDS`), in the words a reader sees.
_KIND_NAMES = {"sales": "Sales", "volume": "Volume", "rate": "Rates and averages", "margin": "Margin",
               "cost": "Cost and leakage", "operations": "Operations", "profit": "Profit"}
OTHER = {"id": "other", "name": "Other", "order": 10 ** 6}


def side(fig: dict) -> int:
    """Where a figure stands against its usual range: 1 above it, -1 below it, 0 inside it or not read against one."""
    usual, cur = fig.get("usual") or {}, fig.get("current")
    low, high = usual.get("low"), usual.get("high")
    if cur is None or low is None or high is None:
        return 0
    return 1 if cur > high else -1 if cur < low else 0


def _metric_name(fig: dict) -> str:
    return str(fig.get("metric_name") or fig.get("metric") or "")


def _person(who: str) -> str:
    """``person:Sidha Sadhak`` → ``Sidha Sadhak``: the Record keeps the kind of principal, a reader wants the name."""
    return who.split(":", 1)[1] if ":" in who and who.split(":", 1)[0] in ("person", "user", "group", "slack") else who


def places(conn_id: str, schema: Optional[str], measured: list[dict], *,
           areas_fn: Optional[Callable[..., dict]] = None, metrics_fn: Optional[Callable[..., list]] = None,
           kind_fn: Optional[Callable[[str, str], Optional[str]]] = None) -> dict[str, dict]:
    """figure id → ``{"id", "name", "order"}``: the area of the metric map its metric reads on, else its
    reading-order kind, else :data:`OTHER`."""
    if metrics_fn is None:
        from pramanyx.semantic.metrics import list_metrics
        metrics_fn = lambda: list_metrics(connection_id=conn_id, schema_name=schema or None)  # noqa: E731
    if areas_fn is None:
        from pramanyx.briefing.ranges import areas_of
        areas_fn = areas_of
    if kind_fn is None:
        from pramanyx.briefing.reading_order import kind_by_words
        kind_fn = kind_by_words
    from pramanyx.briefing.reading_order import KINDS

    by_name = {m.name: m for m in metrics_fn()}
    governed = [by_name[n] for n in dict.fromkeys(_metric_name(f) for f in measured) if n in by_name]
    areas = areas_fn(conn_id, governed, schema) if governed else {}
    out: dict[str, dict] = {}
    for f in measured:
        area = areas.get(_metric_name(f))
        if area and area.get("id"):
            out[f["id"]] = {"id": str(area["id"]), "name": str(area.get("name") or area["id"]), "order": area.get("order", 0)}
            continue
        kind = kind_fn(_metric_name(f) or f["id"], str(f.get("label") or ""))
        out[f["id"]] = ({"id": f"kind:{kind}", "name": _KIND_NAMES.get(kind, kind), "order": 10 ** 5 + KINDS.index(kind)}
                        if kind in KINDS else dict(OTHER))
    return out


def stages(measured: list[dict], place: dict[str, dict]) -> list[dict]:
    """Every measured figure under the part of the business it reads on, the parts in the map's order."""
    out: dict[str, dict] = {}
    for f in measured:
        p = place.get(f["id"]) or OTHER
        out.setdefault(p["id"], {"id": p["id"], "name": p["name"], "order": p.get("order", 0), "figures": []})["figures"].append(f["id"])
    return sorted(out.values(), key=lambda s: s["order"])


def owners(conn_id: str, schema: Optional[str], *, metrics_fn: Optional[Callable[..., list]] = None) -> dict[str, str]:
    """metric name → its owner, for the metrics that have one."""
    if metrics_fn is None:
        from pramanyx.semantic.metrics import list_metrics
        metrics_fn = lambda: list_metrics(connection_id=conn_id, schema_name=schema or None)  # noqa: E731
    return {m.name: str(m.owner).strip() for m in metrics_fn() if getattr(m, "owner", None) and str(m.owner).strip()}


def _refs(block: dict) -> list[str]:
    """Every source a block reads or cites, in the order it names them."""
    ids = [block.get("source") or "", *(block.get("chain") or [])]
    for text in (block.get("text"), block.get("sub"), block.get("title")):
        ids += _CITE_RE.findall(text or "")
    return [i for i in dict.fromkeys(ids) if i]


def _shown(fig: dict, value: float) -> str:
    """A past value of a figure in the figure's own unit — the series keeps numbers, the page prints words."""
    unit = str(fig.get("unit") or "")
    if unit.startswith("ratio"):
        return f"{value * 100:.2f}%"
    if unit == "%":
        return f"{value:.2f}%"
    if _MONEY.match(unit) or (unit == "count" and abs(value) >= 20):
        return f"{value:,.0f}"
    return f"{value:,.2f}"


def _head(fig: dict, period: str) -> str:
    """The storyline's one sentence, from the measurement alone: what it read, against what, and how unusual."""
    usual, way = fig.get("usual") or {}, side(fig)
    words = f"{fig.get('label')} read {fig.get('current_text')}, {'above' if way > 0 else 'below'} its usual " \
            f"{usual.get('low_text')}–{usual.get('high_text')}"
    extreme, streak = fig.get("extreme") or {}, fig.get("streak") or 0
    tail = []
    if extreme.get("which") and extreme.get("of"):
        tail.append(f"the {extreme['which']} of {extreme['of']} {period}s")
    if abs(streak) >= 2 and (streak > 0) == (way > 0):
        tail.append(f"a {_ORDINAL.get(abs(streak), f'{abs(streak)}th')} straight {'rise' if streak > 0 else 'fall'}")
    return words + (": " + " and ".join(tail) if tail else "") + "."


def worth(fig: dict) -> dict:
    """What the move is worth, when its unit is money: the distance beyond the nearer edge of its usual range.
    Computed, never measured — and said to be. Anything else is not priced, with why."""
    unit, way, usual = str(fig.get("unit") or ""), side(fig), fig.get("usual") or {}
    if not way:
        return {"value": None, "why": "inside its usual range, so there is nothing to price"}
    if not fig.get("outside"):
        return {"value": None, "why": "read outside its usual range but not called a move, so it is not priced"}
    if not _MONEY.match(unit):
        return {"value": None, "why": "not a money figure, so it is not priced"}
    edge = usual["high"] if way > 0 else usual["low"]
    value = float(fig["current"]) - float(edge)
    return {"value": value, "unit": unit, "text": f"{abs(value):,.0f}",
            "says": f"{'above the top' if way > 0 else 'below the bottom'} of its usual range "
                    f"({usual.get('high_text') if way > 0 else usual.get('low_text')}) — computed, not measured"}


def _series_trail(fig: dict) -> list[dict]:
    """What the figure read on the way here: the run that led to this range, and the far end of its recent history."""
    series = [p for p in (fig.get("series") or []) if p.get("value") is not None and p.get("start")]
    if not series:
        return []
    run = max(1, min(abs(int(fig.get("streak") or 0)), 3))
    picked = {len(series) - 1 - i for i in range(run + 1) if len(series) - 1 - i >= 0}
    values = [p["value"] for p in series[:-1]]
    if values:
        way = side(fig)
        far = values.index(min(values) if way > 0 else max(values)) if way else None
        if far is not None:
            picked.add(far)
    out = []
    for i in sorted(picked):
        p, now = series[i], i == len(series) - 1
        says = fig.get("current_text") if now else _shown(fig, float(p["value"]))
        if not now and values and i == (values.index(min(values))) and side(fig) > 0:
            says += f" — the lowest of the {len(series)}"
        elif not now and values and i == (values.index(max(values))) and side(fig) < 0:
            says += f" — the highest of the {len(series)}"
        out.append({"when": str(p["start"])[:10], "kind": "read", "says": str(says), "now": now})
    return out


def _known_trail(src: dict) -> list[dict]:
    """A source the platform already held, as dated lines of a trail: an analysis's verdict, a decision and its
    review, what someone said."""
    kind, facts, sid = src.get("kind"), src.get("facts") or {}, src.get("id")
    if kind == "analysis":
        rows = src.get("rows") or [[]]
        done = str(rows[0][2]) if rows[0][2:] else ""
        return [{"when": done[:10], "kind": "analysis", "source": sid,
                 "says": f"Deep analysis: {facts.get('headline') or src.get('label')}"}]
    if kind == "decision":
        out = [{"when": str(facts.get("decided") or "")[:10], "kind": "decision", "source": sid,
                "says": f"Decided: {facts.get('chosen')}"}]
        if facts.get("review_on"):
            out.append({"when": str(facts["review_on"])[:10], "kind": "review", "source": sid, "open": not facts.get("outcome"),
                        "says": f"Reviewed: {facts['outcome']}" if facts.get("outcome") else "Review due"})
        return out
    if kind == "discussion":
        return [{"when": str(facts.get("when") or "")[:10], "kind": "discussion", "source": sid,
                 "says": f"{_person(str(facts.get('who') or 'Someone'))} ({facts.get('where') or 'a discussion'}): "
                         f"“{facts.get('said')}”"}]
    if kind == "finding":
        return [{"when": str(facts.get("when") or facts.get("as_of") or "")[:10], "kind": "finding", "source": sid,
                 "says": f"Explorer finding: {src.get('label')}"}]
    return []


def _record_decision(d: dict) -> dict:
    """A decision in the Record, as a storyline says it: what was chosen, by whom, when it is reviewed, and whether
    there is anything to score it by."""
    extra = d.get("extra") or {}
    expected = bool(d.get("expectation_claim"))
    return {"taken": True, "id": d.get("id"), "text": str(d.get("chosen") or d.get("question") or ""),
            "question": str(d.get("question") or ""), "decided": str(d.get("decided_at") or "")[:10],
            "by": _person(str(d.get("decided_by") or "")), "owner": _person(str(d.get("owner") or "")),
            "review_on": str(d.get("review_on") or "")[:10], "expected": expected, "outcome": str(d.get("outcome") or ""),
            "where": str((d.get("source") or {}).get("detail") or extra.get("note") or "")}


def _check(decision: Optional[dict]) -> dict:
    """When a storyline is checked, and against what. A decision with no expectation declared before the fact has
    nothing to score — said, since an expectation written afterwards is hindsight and closes no loop."""
    if not decision or not decision.get("taken"):
        return {"state": "none", "says": "Nothing is checked until a decision is taken: taking it books what it is "
                                         "expected to change, before the fact, and the date it is reviewed."}
    if decision.get("outcome"):
        return {"state": "reviewed", "on": decision.get("review_on"), "says": "Reviewed; the outcome is in the Record."}
    if decision.get("expected"):
        return {"state": "booked", "on": decision.get("review_on"),
                "says": "An expectation was booked before the fact; the review scores the figure against it."}
    return {"state": "unscored", "on": decision.get("review_on"),
            "says": "No expected figure was declared when it was decided, so the review has nothing to score. An "
                    "expectation written now would be hindsight, and does not count as a closed loop."}


def build(entry: dict, place: dict[str, dict], owner_of: dict[str, str], decisions: list[dict]) -> dict:
    """``{"stages", "storylines", "rest"}`` for a written edition. ``decisions`` are the Record's for the
    connection, newest first, as dicts. ``rest`` is the ids of the blocks no storyline holds (the lead is the
    page's own opening and is in neither)."""
    period = entry.get("period") or {}
    measured = list(period.get("measured") or [])
    word = str(period.get("period") or "range")
    figs = {f["id"]: f for f in measured}
    sources = entry.get("sources") or {}
    live = [d for d in decisions if not d.get("superseded_by")]

    # one storyline per part of the business where a figure is outside its usual range
    stories: dict[str, dict] = {}
    for f in measured:
        if not side(f):
            continue
        p = place.get(f["id"]) or OTHER
        stories.setdefault(f"area:{p['id']}", {"id": f"area:{p['id']}", "kind": "figures", "stage": p["id"],
                                                "stage_name": p["name"], "figures": [], "blocks": []})["figures"].append(f["id"])
    area_story = {s["stage"]: s for s in stories.values()}

    def far(fid: str) -> tuple:
        f = figs[fid]
        usual = f["usual"]
        band = (usual["high"] - usual["low"]) or 1.0
        edge = usual["high"] if side(f) > 0 else usual["low"]
        return (bool(f.get("floor")), bool(f.get("outside")), abs(f["current"] - edge) / abs(band))

    # one per decision of the Record the edition cites
    def decision_story(sid: str) -> dict:
        key = f"decision:{sid}"
        if key not in stories:
            stories[key] = {"id": key, "kind": "decision", "stage": "", "stage_name": "", "figures": [], "blocks": [],
                            "source": sid}
        return stories[key]

    def story_of_figure(ref: str) -> Optional[dict]:
        src = sources.get(ref) or {}
        fid = ref if ref in figs else str((src.get("facts") or {}).get("check") or "")
        if fid not in figs:
            return None
        return area_story.get((place.get(fid) or OTHER)["id"])

    rest: list[str] = []
    current: Optional[dict] = None
    for b in entry.get("blocks") or []:
        if b.get("type") == "quiet":
            rest.append(b["id"])
            continue
        refs = _refs(b)
        if b.get("type") == "lead":
            # the page's own opening, held by no storyline — but what it opens on is what the next block is about
            first = next((st for st in (story_of_figure(r) for r in refs) if st), None)
            current = first or current
            continue
        decided = [r for r in refs if (sources.get(r) or {}).get("kind") == "decision"]
        about = [s for s in (story_of_figure(r) for r in refs) if s]
        measured_refs = [r for r in refs if r in figs or (sources.get(r) or {}).get("kind") in ("breakdown", "drill")]
        if decided:
            current = decision_story(decided[0])
        elif about:
            current = max(about, key=about.count)
        elif measured_refs:
            current = None            # it is about a figure that stayed inside its usual range
        if current is None:
            rest.append(b["id"])
        else:
            current["blocks"].append(b["id"])

    by_id = {b["id"]: b for b in entry.get("blocks") or []}
    out = []
    for s in stories.values():
        held = [by_id[i] for i in s["blocks"]]
        known = [sources[r] for b in held for r in _refs(b) if (sources.get(r) or {}).get("kind") in
                 ("analysis", "decision", "discussion", "finding")]
        known = list({k.get("id"): k for k in known}.values())
        trail: list[dict] = [t for k in known for t in _known_trail(k)]
        if s["kind"] == "figures":
            s["figures"].sort(key=far, reverse=True)
            anchor = figs[s["figures"][0]]
            names = [_metric_name(figs[i]) for i in s["figures"]]
            record = next((d for d in live if d.get("objective") and d.get("objective") in names), None)
            proposed = next((b for b in held if b.get("type") == "decision"), None)
            decision = _record_decision(record) if record else (
                {"taken": False, "text": re.sub(r"\{([^{}|]+)\|[A-Za-z0-9_\-]+\}", r"\1", proposed.get("text") or ""),
                 "block": proposed["id"]} if proposed else None)
            streak = anchor.get("streak") or 0
            owner = (decision or {}).get("owner") or owner_of.get(_metric_name(anchor), "")
            s.update({
                "anchor": anchor["id"], "metric": _metric_name(anchor), "head": _head(anchor, word),
                "called": bool(anchor.get("outside")),
                # a range still filling reads low or high for that reason alone: said on the storyline, never implied
                "status": str(anchor.get("status") or "final"),
                "state": "decided" if record else "developing" if abs(streak) >= 2 and (streak > 0) == (side(anchor) > 0) else "new",
                "owner": owner, "owner_from": "decision" if (decision or {}).get("owner") else "metric" if owner else "",
                "worth": worth(anchor), "decision": decision, "check": _check(decision),
            })
            trail += _series_trail(anchor)
            if record and not any(t.get("kind") == "decision" for t in trail):
                # a decision taken on this storyline's metric after the edition was written is not among its sources
                trail.append({"when": decision["decided"], "kind": "decision", "says": f"Decided: {decision['text']}"})
                if decision.get("review_on"):
                    trail.append({"when": decision["review_on"], "kind": "review", "open": not decision.get("outcome"),
                                  "says": "Reviewed" if decision.get("outcome") else "Review due"})
            if not owner:
                trail.append({"when": "", "kind": "open", "open": True, "says": f"Nobody owns {anchor.get('label')}."})
        else:
            src = sources.get(s["source"]) or {}
            facts = src.get("facts") or {}
            record = next((d for d in live if str(d.get("id") or "")[:12] == str(facts.get("decision_id") or "")[:12]), None)
            decision = _record_decision(record) if record else {
                "taken": True, "id": facts.get("decision_id"), "text": str(facts.get("chosen") or ""),
                "question": str(facts.get("question") or ""), "decided": str(facts.get("decided") or ""), "by": "", "owner": "",
                "review_on": str(facts.get("review_on") or ""), "expected": False, "outcome": str(facts.get("outcome") or ""),
                "where": ""}
            s.update({
                "anchor": "", "metric": "", "head": decision["text"][:1].upper() + decision["text"][1:],
                "called": True, "status": "final", "state": "decided", "owner": decision.get("owner") or "", "owner_from": "decision" if decision.get("owner") else "",
                "worth": {"value": None, "why": "a decision is not priced here; its figures are in the blocks below"},
                "decision": decision, "check": _check(decision),
            })
        s["trail"] = sorted(trail, key=lambda t: (bool(t.get("open")), t.get("when") or "9999"))
        s["waits"] = not s["owner"] or bool(s["decision"] and not s["decision"].get("taken"))
        out.append(s)

    def rank(s: dict) -> tuple:
        f = figs.get(s.get("anchor") or "")
        return (0,) + tuple(-x for x in map(float, far(f["id"]))) if f else (1, 0.0, 0.0, 0.0)
    out.sort(key=rank)
    return {"stages": stages(measured, place), "storylines": out, "rest": rest}


def for_edition(conn_id: str, schema: Optional[str], entry: dict) -> dict:
    """The running account of a written edition, read from the metric registry and the Record. A store that cannot
    be read is NAMED (`unread`) and the rest still stands: an edition without storylines is still an edition."""
    from pramanyx.kernel.errors import tolerate

    measured = list((entry.get("period") or {}).get("measured") or [])
    unread: dict[str, str] = {}
    try:
        place = places(conn_id, schema, measured)
    except Exception as exc:  # noqa: BLE001 — the figures still stand, unplaced
        tolerate(exc, "the Briefing's figures could not be placed on the business", counter="briefing.storylines", conn_id=conn_id)
        place, unread["the metric map"] = {}, str(exc)[:160]
    try:
        owner_of = owners(conn_id, schema)
    except Exception as exc:  # noqa: BLE001
        tolerate(exc, "the Briefing could not read who owns its metrics", counter="briefing.storylines", conn_id=conn_id)
        owner_of, unread["metric owners"] = {}, str(exc)[:160]
    try:
        from pramanyx.record.decisions import list_decisions
        decisions = [d.model_dump(mode="json") for d in list_decisions(conn_id=conn_id)]
    except Exception as exc:  # noqa: BLE001
        tolerate(exc, "the Briefing could not read the Record's decisions", counter="briefing.storylines", conn_id=conn_id)
        decisions, unread["the Record's decisions"] = [], str(exc)[:160]
    return {**build(entry, place, owner_of, decisions), **({"account_unread": unread} if unread else {})}
