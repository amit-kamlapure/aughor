"""Where a sentence ends (`aughor/util/prose.py`) — the one rule the answer's headline and the evidence ledger share."""
from aughor.util.prose import first_sentence


def test_a_sentence_ends_at_a_stop_and_a_space_never_inside_a_figure():
    assert first_sentence("Revenue was $18,002.50, up 0.33 sd. The rest follows.") == "Revenue was $18,002.50, up 0.33 sd."
    assert first_sentence("Release v2.1 shipped! Then more.") == "Release v2.1 shipped!"
    assert first_sentence("Why did it fall? Because returns rose.") == "Why did it fall?"


def test_an_abbreviation_a_figure_follows_does_not_end_it():
    assert first_sentence("Up 4% vs. 2025, e.g. 3 days earlier. Next.") == "Up 4% vs. 2025, e.g. 3 days earlier."


def test_one_sentence_is_kept_whole_and_given_a_stop_when_it_has_none():
    assert first_sentence("Flat.") == "Flat."
    assert first_sentence("  Flat  ") == "Flat."
    assert first_sentence("") == "" and first_sentence(None) == ""
