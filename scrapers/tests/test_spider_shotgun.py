"""Shotgun: blocked by a Vercel Security Checkpoint (HTTP 429) on 2026-10-07.
Fixture = first 3 KB of the real challenge page."""
from tests.conftest import load_fixture

import spiders.shotgun as shotgun


def test_challenge_detected():
    html = load_fixture("shotgun_challenge.html")
    assert shotgun.is_challenge(html)
    assert shotgun.parse_page(html) == []


class _Resp:
    status_code = 429
    text = ""


class _Client:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def get(self, url):
        r = _Resp()
        r.text = load_fixture("shotgun_challenge.html")
        return r


def test_fetch_events_fails_gracefully(monkeypatch, capsys):
    monkeypatch.setattr(shotgun, "PoliteClient", _Client)
    assert list(shotgun.fetch_events()) == []
    assert "blocked" in capsys.readouterr().out
