"""The model door — another runtime's model calls, made by Pramanyx with the organisation's own models.

The coworker (`coworker/`) is an agent shell beside Pramanyx. Left to itself it has a model key of its own: a second
place the organisation's spend goes, which Pramanyx neither counts nor caps, and a key typed twice. Through this
door it asks Pramanyx, and Pramanyx asks the provider.

What the door is:

* **A relay, not a translator.** It speaks the chat-completions wire and forwards a request as it arrives —
  messages, tools, tool results, streamed or not — changing one thing: the model. The caller names a ROLE
  (`coder`, `narrator`, `fast`) and the door binds it exactly as a call of Pramanyx's own is bound
  (`llm.provider.door_binding`), so the caller cannot choose a model the organisation did not.
* **An organisation's setting, off by default** (`coworker_models`). What it sends is a conversation, and it leaves
  the install for the provider; lending the keys for that is an admin's choice. Off, the door says so and where to
  change it, and sends nothing.
* **Counted where model calls are counted.** A usage cap that blocks is checked before anything is sent
  (`govern.outbound.external_call`, the one place that does that), and each call is recorded in the model-call
  record with its tokens (`llm.provider.record_door_call`).

What it does not do: keep the words. The conversation is the other runtime's, and it keeps its own.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, AsyncIterator, Optional

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["llm"])

SETTING = "coworker_models"
ROLES = ("coder", "narrator", "fast")
CALLER_HEADER = "x-pramanyx-door-caller"

#: A provider that has not answered in this long is not going to: the caller is a person waiting on a reply.
_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


def _client() -> httpx.AsyncClient:
    """The upstream client. A seam, so a test answers for the provider."""
    return httpx.AsyncClient(timeout=_TIMEOUT)


def _said(status: int, message: str, kind: str) -> JSONResponse:
    """A refusal in the wire's own error shape, so the caller shows the sentence and not a parse failure."""
    return JSONResponse(status_code=status, content={"error": {"message": message, "type": kind, "code": kind}})


def _off() -> Optional[JSONResponse]:
    """The refusal when the organisation has not allowed the door, or None when it has."""
    from pramanyx.orgsettings.allows import WHERE, allows
    if allows(SETTING):
        return None
    return _said(403, "The organisation has not allowed the coworker to ask its models through Pramanyx. "
                      f"An admin can allow it in {WHERE}. Nothing was sent.", "door_closed")


def _role_of(model: Any) -> str:
    name = str(model or "").strip()
    return name[len("pramanyx/"):] if name.startswith("pramanyx/") else name


def _binding(role: str):
    """`(backend, model, url, key)`, or the refusal that says why there is none."""
    from pramanyx.llm.provider import NoModelConfigured, NotOnTheDoorsWire, door_binding
    try:
        return door_binding(role), None  # type: ignore[arg-type]
    except NoModelConfigured as exc:
        return None, _said(409, f"{exc} Nothing was sent.", "no_model")
    except NotOnTheDoorsWire as exc:
        return None, _said(501, f"{exc} Nothing was sent.", "not_on_the_wire")
    except RuntimeError as exc:                      # a stored key that cannot be decrypted, said by name
        return None, _said(503, str(exc), "key_unreadable")


@router.get("/llm/door/v1/models")
def door_models():
    """The roles the door serves — what a caller may put in `model`. A role with no usable binding is not listed."""
    closed = _off()
    if closed is not None:
        return closed
    served = [role for role in ROLES if _binding(role)[0] is not None]
    return {"object": "list", "data": [{"id": role, "object": "model", "owned_by": "pramanyx"} for role in served]}


def _usage(found: Optional[dict]) -> tuple[Optional[int], Optional[int]]:
    if not isinstance(found, dict):
        return None, None
    prompt, completion = found.get("prompt_tokens"), found.get("completion_tokens")
    return (prompt if isinstance(prompt, int) else None), (completion if isinstance(completion, int) else None)


def _usage_on(line: bytes) -> Optional[dict]:
    """The usage block one line of a server-sent stream carries, or None.

    Most lines carry none, and some are not JSON at all (`data: [DONE]`, a keep-alive comment). That is the
    stream's ordinary shape, not a failure to hide: a line is asked whether it has a usage block, and the answer
    for nearly all of them is no."""
    if not line.startswith(b"data:") or b'"usage"' not in line:
        return None
    try:
        event = json.loads(line[5:].strip())
    except ValueError:
        return None
    usage = event.get("usage") if isinstance(event, dict) else None
    return usage if isinstance(usage, dict) else None


class _StreamedUsage:
    """Reads the usage block out of a server-sent stream as it passes, without holding the stream.

    The bytes go to the caller untouched. A copy is cut into lines, and a `data:` line that carries `usage` is
    parsed; the provider sends it last, because the door asks for it (`stream_options.include_usage`)."""

    def __init__(self) -> None:
        self._tail = b""
        self.found: Optional[dict] = None

    def feed(self, chunk: bytes) -> None:
        *lines, self._tail = (self._tail + chunk).split(b"\n")
        for line in lines:
            usage = _usage_on(line)
            if usage is not None:
                self.found = usage


@router.post("/llm/door/v1/chat/completions")
async def door_chat(request: Request):
    """One chat-completions call, made by Pramanyx with the organisation's model for the role named in `model`."""
    from pramanyx.govern.outbound import OutboundBlocked, external_call
    from pramanyx.llm.provider import record_door_call

    closed = _off()
    if closed is not None:
        return closed
    try:
        body = await request.json()
    except ValueError:
        body = None
    if not isinstance(body, dict) or not isinstance(body.get("messages"), list):
        return _said(400, "The door takes a chat-completions request: a JSON object with `messages`.", "bad_request")

    role = _role_of(body.get("model"))
    if role not in ROLES:
        return _said(404, f"The door serves the organisation's roles — {', '.join(ROLES)} — and `model` names one. "
                          f"It does not take a model's own name: the organisation chooses the model for each role.",
                     "unknown_role")
    bound, refusal = _binding(role)
    if refusal is not None:
        return refusal
    backend, model, url, key = bound

    caller = (request.headers.get(CALLER_HEADER) or "").strip()[:60]
    streamed = bool(body.get("stream"))
    upstream = {**body, "model": model}
    if streamed:
        # Asked for, so the call can be counted: without it a streamed reply says nothing of what it cost.
        upstream["stream_options"] = {**(body.get("stream_options") or {}), "include_usage": True}
    headers = {"content-type": "application/json"}
    if key:
        headers["authorization"] = f"Bearer {key}"

    # A cap that blocks is said before anything is sent, as a status the caller can show.
    gate = external_call("model_door", "chat.completions",
                         attributes={"role": role, "backend": backend, "model": model, "caller": caller or "unnamed"})
    try:
        note = gate.__enter__()
    except OutboundBlocked as exc:
        return _said(429, f"A usage cap stopped this call before it was sent: {exc.reason}", "usage_cap")

    started = time.monotonic()

    def settle(*, ok: bool, usage: Optional[dict], error: Optional[BaseException] = None) -> None:
        """Record the call and close the outbound door — once, on every path."""
        prompt_tokens, completion_tokens = _usage(usage)
        note.update({"role": role, "streamed": streamed, "prompt_tokens": prompt_tokens,
                     "completion_tokens": completion_tokens})
        try:
            record_door_call(backend=backend, model=model, role=role, prompt_tokens=prompt_tokens,
                             completion_tokens=completion_tokens, ms=(time.monotonic() - started) * 1000.0,
                             ok=ok, error_class=(type(error).__name__ if error else (None if ok else "upstream")),
                             streamed=streamed, caller=caller)
        finally:
            if error is not None:
                gate.__exit__(type(error), error, error.__traceback__)
            else:
                gate.__exit__(None, None, None)

    client = _client()
    try:
        answer = await client.send(client.build_request("POST", url, json=upstream, headers=headers), stream=True)
    except Exception as exc:
        await client.aclose()
        settle(ok=False, usage=None, error=exc)
        return _said(502, f"The organisation's model provider ({backend}) did not answer: {type(exc).__name__}.",
                     "provider_unreachable")

    if answer.status_code >= 400 or not streamed:
        try:
            raw = await answer.aread()
        finally:
            await answer.aclose()
            await client.aclose()
        ok = answer.status_code < 400
        usage = None
        if ok:
            try:
                usage = json.loads(raw).get("usage")
            except (ValueError, AttributeError):
                usage = None
        settle(ok=ok, usage=usage)
        return StreamingResponse(iter([raw]), status_code=answer.status_code,
                                 media_type=answer.headers.get("content-type", "application/json"))

    reader = _StreamedUsage()

    async def relay() -> AsyncIterator[bytes]:
        failed: Optional[BaseException] = None
        try:
            async for chunk in answer.aiter_raw():
                reader.feed(chunk)
                yield chunk
        except BaseException as exc:                 # the caller hanging up counts: the call was made, in part
            failed = exc
            raise
        finally:
            await answer.aclose()
            await client.aclose()
            if isinstance(failed, Exception):
                settle(ok=False, usage=reader.found, error=failed)
            else:
                settle(ok=failed is None, usage=reader.found)

    return StreamingResponse(relay(), status_code=answer.status_code,
                             media_type=answer.headers.get("content-type", "text/event-stream"))
