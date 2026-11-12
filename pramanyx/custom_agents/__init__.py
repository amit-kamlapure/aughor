"""User-defined agents — the product entity binding instructions + documents +
a connection into a reusable persona that answers over governed data.

Flag `agents.user_defined`, **default ON since Wave H** (receipt `df89c044999a` —
the capability is data-gated: with no agent named on a request, nothing about the
answer path changes). Slice 1 wires: pinned INSTRUCTIONS
(lead the quick-path prompt, rules_block-style), DOCUMENT scope (retrieval
restricted to the agent's bound documents — an agent with no documents sees
none), and the CONNECTION binding (the agent always answers over its data;
a conflicting explicit connection is rejected, fail-closed). Pack bindings,
schema scoping, deep-intake injection, and the builder UI are later slices.
"""
from pramanyx.custom_agents.models import UserAgent
from pramanyx.custom_agents.store import (
    create_agent,
    delete_agent,
    get_agent,
    list_agents,
    update_agent,
)

__all__ = [
    "UserAgent",
    "create_agent",
    "delete_agent",
    "get_agent",
    "list_agents",
    "update_agent",
]
