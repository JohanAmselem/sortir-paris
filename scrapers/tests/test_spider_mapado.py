"""Mapado: no public agenda any more (404). Parser tested on a SYNTHETIC JSON-LD page."""
from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

import spiders.mapado as mapado


def test_parse_page_prices_in_centimes():
    evs = mapado.parse_page(load_fixture("mapado_ticketing_synthetic.html"), "https://test.mapado.com/", "theatre")
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (1200, 2500, "paid")
    assert ev["start_date"] == "2026-11-05T18:30:00+00:00"
    assert ev["category_slug"] == "theatre"


class _Resp:
    status_code = 404
    text = "<html><title>Erreur 404</title></html>"


class _Client:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def get(self, url):
        return _Resp()


def test_fetch_events_fails_gracefully(monkeypatch, capsys):
    monkeypatch.setattr(mapado, "PoliteClient", _Client)
    assert list(mapado.fetch_events()) == []
    assert "no public feed" in capsys.readouterr().out
