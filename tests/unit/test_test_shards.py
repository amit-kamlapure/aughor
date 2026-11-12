"""CI's parallel test jobs: every file runs in exactly one shard, and a bad setting is an error."""
import pytest

from tests._shard import files_for, parse

FILES = [f"tests/unit/test_{c}.py" for c in "abcdefghij"] + ["tests/integration/test_x.py"]


@pytest.mark.parametrize("n", [1, 2, 3, 4, 7])
def test_the_shards_cover_every_file_exactly_once(n):
    shards = [files_for(FILES, k, n) for k in range(1, n + 1)]
    assert set().union(*shards) == set(FILES)
    assert sum(len(s) for s in shards) == len(set(FILES))


def test_a_file_named_twice_is_still_run_once():
    assert files_for(FILES + FILES[:3], 1, 1) == set(FILES)


def test_unset_means_no_sharding():
    assert parse(None) is None and parse("") is None


@pytest.mark.parametrize("bad", ["2", "0/4", "5/4", "a/b", "1/0", "-1/4"])
def test_a_malformed_shard_is_an_error_not_a_full_run(bad):
    with pytest.raises(ValueError):
        parse(bad)


def test_a_well_formed_shard_parses():
    assert parse("2/4") == (2, 4)
