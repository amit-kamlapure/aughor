"""Pramanyx MCP server — exposes Pramanyx's GOVERNED intelligence as Model Context Protocol
tools (ask · deep_analysis · get_metric · list_findings · get_briefing · explore · jobs),
so any MCP client (Claude Desktop / Claude Code / Cursor) can ask Pramanyx a question and get
a verified answer with a Trust Receipt — not raw SQL.

The differentiator vs a generic text-to-SQL MCP: these tools return *governed* results.
Pramanyx writes and runs the SQL, grounds every number in real rows, enforces registered
metric definitions, and attaches the guards that fired. The intelligence lives in the
*tool*, not in the client.

Run it::

    python -m pramanyx.mcp           # stdio   (Claude Desktop/Code/Cursor)
    python -m pramanyx.mcp --http    # streamable-HTTP on 127.0.0.1:8765

It is a thin client over the running Pramanyx REST API (``PRAMANYX_API_URL``, default
``http://127.0.0.1:8000``; ``PRAMANYX_API_KEY`` optional), so every tool runs the exact
governed path the web app runs. Start the API first.
"""
from pramanyx.mcp.server import mcp

__all__ = ["mcp"]
