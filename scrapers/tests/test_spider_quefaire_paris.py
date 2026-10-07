from datetime import date

from tests.conftest import load_fixture

import spiders.quefaire_paris as qf


def test_maintenance_page_yields_nothing():
    html = load_fixture("quefaire_paris_maintenance.html")
    assert qf.is_maintenance_page(html)
    assert qf.parse_page(html) == []


def test_jsonld_page_is_parsed():
    html = load_fixture("paris_fr_detail.html")  # same schema.org Event markup
    evs = qf.parse_page(html, "https://quefaire.paris.fr/x")
    assert len(evs) == 1 and evs[0]["source"] == "quefaire_paris"


def test_month_order_rollover_fixed():
    start, end = qf.parse_quefaire_dates("Du 15 oct. au 10 janv.", today=date(2026, 10, 7))
    assert start == "2026-10-15T10:00:00+00:00"
    assert end == "2027-01-10T22:59:00+00:00"  # janvier of the NEXT year


def test_no_date():
    assert qf.parse_quefaire_dates("Toute l'année") == (None, None)


def test_fetch_events_offline(monkeypatch):
    class Fake:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            pass

        def get_text(self, url):
            return load_fixture("quefaire_paris_maintenance.html")

    monkeypatch.setattr(qf, "PoliteClient", Fake)
    assert list(qf.fetch_events(max_pages=10)) == []
