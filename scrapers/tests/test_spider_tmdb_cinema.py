from __future__ import annotations

import json

from tests.conftest import load_fixture

from spiders import tmdb_cinema
from spiders.tmdb_cinema import enrich_film, fetch_events, parse_search_result


def test_parse_search_result_picks_exact_title():
    data = json.loads(load_fixture("tmdb_search_movie.json"))
    r = parse_search_result(data, "Butterfly Jam", 2026)
    assert r["tmdb_id"] == 1234567
    assert r["poster_url"] == "https://image.tmdb.org/t/p/w500/ptButterflyJam.jpg"
    assert r["backdrop_url"] == "https://image.tmdb.org/t/p/w780/bdButterflyJam.jpg"
    assert r["genres"] == ["Drame"]
    assert r["overview"].startswith("Dans le New Jersey")


def test_parse_search_result_no_confident_match():
    data = json.loads(load_fixture("tmdb_search_movie.json"))
    assert parse_search_result(data, "Un tout autre film", 1990) is None
    assert parse_search_result({"results": []}, "X") is None
    assert parse_search_result(None, "X") is None


def test_enrich_without_key_returns_none(monkeypatch):
    monkeypatch.delenv("TMDB_API_KEY", raising=False)
    monkeypatch.delenv("TMDB_ACCESS_TOKEN", raising=False)
    assert enrich_film("Butterfly Jam", 2026) is None


class _FakeClient:
    def __init__(self, data):
        self.data = data
        self.calls = 0

    def get_json(self, url, **kw):
        self.calls += 1
        assert url.endswith("/search/movie")
        assert kw["params"]["language"] == "fr-FR"
        return self.data


def test_enrich_uses_cache(monkeypatch):
    monkeypatch.setenv("TMDB_API_KEY", "dummy")
    tmdb_cinema._CACHE.clear()
    fake = _FakeClient(json.loads(load_fixture("tmdb_search_movie.json")))
    a = enrich_film("Butterfly Jam", 2026, client=fake)
    b = enrich_film("Butterfly Jam", 2026, client=fake)
    assert a == b and a["tmdb_id"] == 1234567
    assert fake.calls == 1
    tmdb_cinema._CACHE.clear()


def test_fetch_events_yields_nothing():
    assert list(fetch_events()) == []
