"""Split the suite across parallel CI jobs, a whole test FILE at a time.

CI sets ``PRAMANYX_TEST_SHARD=k/n`` (1-based k). Each job collects exactly what an unsharded
run collects, then keeps the files whose position in the sorted list is ``k-1`` modulo ``n``
— so every file runs in exactly one job, in the same order as before, and a file's tests are
never split from the fixtures and module state they share. Unset, nothing is deselected.
"""
from __future__ import annotations

ENV = "PRAMANYX_TEST_SHARD"


def parse(value: str | None) -> tuple[int, int] | None:
    """``"2/4"`` → ``(2, 4)``; empty → None. Anything else is an error, never a silent full run."""
    if not value:
        return None
    k, sep, n = value.partition("/")
    if not sep or not k.isdigit() or not n.isdigit() or not 1 <= int(k) <= int(n):
        raise ValueError(f"{ENV} must look like k/n with 1 <= k <= n, got {value!r}")
    return int(k), int(n)


def files_for(files: list[str], k: int, n: int) -> set[str]:
    """The files shard ``k`` of ``n`` runs: every n-th of the sorted, de-duplicated list."""
    ordered = sorted(set(files))
    return {f for i, f in enumerate(ordered) if i % n == k - 1}
