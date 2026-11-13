"""Where the coworker is — so the app can lead to it.

The coworker (`coworker/`) is a second page of the platform, served by its own process on its own port. The app
reaches it from the nine dots in its top bar, and for that it has to know two things: that a coworker is running
now, and the address to open. Both are facts about a process that may start and stop while the API runs, so
neither is configuration and neither is stored.

* **The coworker says where it is**, when it starts and every half minute after (`coworker/plugins/home`). The
  address it gives is the one its own shell prints for a person to open.
* **The API remembers the last thing it was told, for two minutes.** A coworker that has stopped saying so is not
  offered: the app draws no nine dots, where it would otherwise draw a way in that leads nowhere.

Only this machine may say where the coworker is, and only an address on this machine is accepted. The address is
opened by a person's browser from the app's top bar; a route that let any caller set it would let any caller choose
where the app sends people.
"""
from __future__ import annotations

import ipaddress
import time
from typing import Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["coworker"])

#: How long the last announcement stands. The coworker says where it is every 30 seconds; four missed is gone.
FRESH_FOR = 120.0

_last: dict = {"url": "", "at": 0.0}


def _now() -> float:
    """A seam, so a test moves the clock."""
    return time.monotonic()


def _on_this_machine(host: Optional[str]) -> bool:
    if not host:
        return False
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


class CoworkerAddress(BaseModel):
    url: str = Field(max_length=2048, description="The address a person opens to reach the coworker.")


class CoworkerDoor(BaseModel):
    available: bool = Field(description="Whether a coworker has said it is running within the last two minutes.")
    url: Optional[str] = Field(default=None, description="The address to open, when one is running.")


@router.put("/coworker/address", response_model=CoworkerDoor)
def say_where_the_coworker_is(body: CoworkerAddress, request: Request) -> CoworkerDoor:
    """The coworker's own announcement of its address. Refused from another machine, and for an address on one."""
    if not _on_this_machine(request.client.host if request.client else None):
        raise HTTPException(status_code=403, detail="Only a coworker on this machine may say where it is.")
    parts = urlsplit(body.url)
    if parts.scheme not in ("http", "https") or not _on_this_machine(parts.hostname):
        raise HTTPException(status_code=422, detail="The coworker's address must be an http(s) address on this machine.")
    _last["url"], _last["at"] = body.url, _now()
    return CoworkerDoor(available=True, url=body.url)


@router.get("/coworker", response_model=CoworkerDoor)
def where_the_coworker_is() -> CoworkerDoor:
    """Whether a coworker is running, and the address to open. Reads what was last said; asks nothing."""
    if _last["url"] and _now() - _last["at"] <= FRESH_FOR:
        return CoworkerDoor(available=True, url=_last["url"])
    return CoworkerDoor(available=False)
