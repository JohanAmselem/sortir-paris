"""Bandsintown: no public city feed (website 403 Cloudflare, API artist-based with an
authorised app_id). Parser tested on a SYNTHETIC fixture written from the API v3 docs."""
import json

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

import spiders.bandsintown as bit


def test_parse_artist_events_idf_only():
    data = json.loads(load_fixture("bandsintown_artist_events_synthetic.json"))
    evs = bit.parse_artist_events(data, "Groupe Test")
    assert len(evs) == 1  # Lyon dropped
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["start_date"] == "2026-11-14T19:00:00+00:00"  # naive venue-local = Paris
    assert ev["price_status"] == "unknown"
    assert ev["category_slug"] == "concerts"
    assert ev["booking_url"].startswith("https://www.bandsintown.com/t/")


def test_skipped_without_credentials(monkeypatch, capsys):
    monkeypatch.delenv("BANDSINTOWN_APP_ID", raising=False)
    monkeypatch.delenv("BANDSINTOWN_ARTISTS", raising=False)
    assert list(bit.fetch_events()) == []
    assert "skipped" in capsys.readouterr().out
