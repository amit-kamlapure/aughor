"""Where a sentence ends — said once, for every writer that takes a text's first sentence.

A sentence ends at ".", "!" or "?" followed by whitespace: never inside a figure ("0.33", "$18,002.50", "v2.1") and
never after an abbreviation a figure follows ("vs. 2025", "e.g. 3 days"). The rule was the answer's headline rule
(`agent/investigate.py`, `_lead_sentence`); the evidence ledger split on every "." instead and cut 69 of theLook's
latest 80 claims mid-number (2026-11-10: "…the 2026-11-02 revenue of $18,002 is only 0.").
"""
from __future__ import annotations

import re

#: Where a sentence ends — not inside a figure, not after an abbreviation a figure follows.
SENTENCE_END_RE = re.compile(r"(?<!\bvs)(?<!\be\.g)(?<!\bi\.e)(?<!\bapprox)(?<!\bincl)(?<!\bexcl)[.!?](?=\s)")


def first_sentence(text: str | None) -> str:
    """The text's first sentence, ending in its own stop — or the whole text, given one, when it holds a single
    sentence (a text with no stop at all is given a full stop)."""
    t = (text or "").strip()
    if not t:
        return ""
    end = SENTENCE_END_RE.search(t)
    head = t[:end.end()] if end else t
    return head if head[-1] in ".!?" else f"{head}."
