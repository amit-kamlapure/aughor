"""Identity resolution — a door-supplied principal → a stable attribution key."""
from pramanyx.identity.models import UNATTRIBUTED, Identity, parse_ref
from pramanyx.identity.resolver import attribution_key, resolve

__all__ = ["UNATTRIBUTED", "Identity", "parse_ref", "resolve", "attribution_key"]
