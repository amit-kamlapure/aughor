"""Where the coworker is: said by the coworker, remembered for two minutes, and only for an address on this machine."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from pramanyx.routers import coworker as C


@pytest.fixture()
def door(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(C, "_now", lambda: clock["t"])
    monkeypatch.setattr(C, "_last", {"url": "", "at": 0.0})
    app = FastAPI()
    app.include_router(C.router)
    # The test client's caller is "testclient"; a coworker's is this machine.
    return TestClient(app, client=("127.0.0.1", 50000)), clock


def test_no_coworker_has_said_anything_so_none_is_offered(door):
    client, _ = door
    assert client.get("/coworker").json() == {"available": False, "url": None}


def test_a_coworker_says_where_it_is_and_the_app_is_told(door):
    client, _ = door
    said = client.put("/coworker/address", json={"url": "http://127.0.0.1:3090/?token=abc"})
    assert said.status_code == 200
    assert client.get("/coworker").json() == {"available": True, "url": "http://127.0.0.1:3090/?token=abc"}


def test_a_coworker_that_has_stopped_saying_so_is_not_offered(door):
    client, clock = door
    client.put("/coworker/address", json={"url": "http://localhost:3090/"})
    clock["t"] += C.FRESH_FOR
    assert client.get("/coworker").json()["available"] is True          # the last second it stands
    clock["t"] += 1
    assert client.get("/coworker").json() == {"available": False, "url": None}
    client.put("/coworker/address", json={"url": "http://localhost:3090/"})
    assert client.get("/coworker").json()["available"] is True          # and it comes back when it says so again


@pytest.mark.parametrize("url", [
    "http://example.com:3090/",            # another machine
    "http://10.0.0.7:3090/",               # another machine on the network
    "javascript:alert(1)",                 # not an address a browser should be sent to
    "ftp://127.0.0.1/",
    "http://127.0.0.1.example.com/",       # looks local, is not
    "//127.0.0.1:3090/",
    "",
])
def test_an_address_that_is_not_http_on_this_machine_is_refused_and_not_kept(door, url):
    client, _ = door
    assert client.put("/coworker/address", json={"url": url}).status_code == 422
    assert client.get("/coworker").json()["available"] is False


def test_an_ipv6_loopback_address_is_this_machine(door):
    client, _ = door
    assert client.put("/coworker/address", json={"url": "http://[::1]:3090/"}).status_code == 200


def test_another_machine_may_not_say_where_the_coworker_is(monkeypatch):
    monkeypatch.setattr(C, "_last", {"url": "", "at": 0.0})
    app = FastAPI()
    app.include_router(C.router)
    stranger = TestClient(app, client=("203.0.113.9", 50000))
    assert stranger.put("/coworker/address", json={"url": "http://127.0.0.1:3090/"}).status_code == 403
    assert stranger.get("/coworker").json()["available"] is False


def test_the_route_is_served_by_the_api():
    """The router only matters if the app mounts it."""
    import inspect
    from pramanyx import api
    assert "coworker_router.router" in inspect.getsource(api)
