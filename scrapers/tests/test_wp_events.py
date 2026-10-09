"""The Events Calendar (Tribe) REST parser — utils/wp_events.py + spider wrapper.

Fixtures are trimmed real responses fetched on 2026-10-09:
  venue_nouvelleseine_tribe.json   venue + geo on every event, next_rest_url
  venue_bizzart_tribe.json         no venue on events (fixed venue from config)
  venue_exploradome_tribe.json     cost_details prices, "Gratuit"
  venue_regardducygne_tribe.json   room-only venue, weekly classes to exclude
"""
import json
from datetime import datetime, timezone

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.venues_config import ALL_VENUES_BY_KEY
from spiders.venues_structured import parse_tribe_page
from utils.wp_events import (
    event_from_tribe, events_from_tribe, is_tribe_payload, tribe_dates, tribe_next_url, tribe_price,
    tribe_url, tribe_venue,
)

NOW = datetime(2026, 10, 9, tzinfo=timezone.utc)


def _data(key):
    return json.loads(load_fixture(f"venue_{key}_tribe.json"))


def test_tribe_url_and_payload_detection():
    assert tribe_url("https://www.exemple.fr/agenda/") == \
        "https://www.exemple.fr/wp-json/tribe/events/v1/events?start_date=now&per_page=50"
    assert tribe_url("https://x.fr", plain_permalinks=True).startswith(
        "https://x.fr/?rest_route=%2Ftribe%2Fevents%2Fv1%2Fevents&start_date=now")
    assert is_tribe_payload(_data("nouvelleseine"))
    assert is_tribe_payload({"events": [], "total": 0})
    assert not is_tribe_payload({"code": "rest_no_route"})
    assert not is_tribe_payload([{"id": 1}])
    assert tribe_next_url(_data("nouvelleseine")).startswith(
        "https://lanouvelleseine.com/wp-json/tribe/events/v1/events/?per_page=50&start_date=")
    assert tribe_next_url({"events": []}) is None


def test_dates_timed_use_utc_fields():
    s, e, tk = tribe_dates({"start_date": "2026-10-09 19:00:00", "end_date": "2026-10-09 20:00:00",
                            "utc_start_date": "2026-10-09 17:00:00", "utc_end_date": "2026-10-09 18:00:00",
                            "timezone": "Europe/Paris", "all_day": False})
    assert (s, e, tk) == ("2026-10-09T17:00:00+00:00", "2026-10-09T18:00:00+00:00", True)


def test_dates_all_day_are_dates_only():
    s, e, tk = tribe_dates({"start_date": "2026-11-02 00:00:00", "end_date": "2026-11-05 23:59:59",
                            "utc_start_date": "2026-11-01 23:00:00", "all_day": True})
    assert (s, e, tk) == ("2026-11-02", "2026-11-05", False)
    s, e, tk = tribe_dates({"start_date": "2026-11-02 00:00:00", "end_date": "2026-11-02 23:59:59",
                            "all_day": True})
    assert (s, e) == ("2026-11-02", None)


def test_dates_without_utc_fields_use_local_time():
    s, _, tk = tribe_dates({"start_date": "2026-10-09 20:30:00", "timezone": "Europe/Paris"})
    assert s == "2026-10-09T20:30:00" and tk  # naive = Paris local (make_event contract)
    assert tribe_dates({"title": "x"}) == (None, None, False)


def test_price_rules():
    assert tribe_price({"cost": "", "cost_details": {"values": []}})["price_status"] == "unknown"
    assert tribe_price({"cost": "Gratuit", "cost_details": {"values": []}})["price_status"] == "free"
    p = tribe_price({"cost": "12 € – 18 €", "cost_details": {"currency_code": "EUR", "values": ["12", "18"]}})
    assert (p["price_status"], p["price_min"], p["price_max"]) == ("paid", 1200, 1800)
    p = tribe_price({"cost": "Gratuit – 10 €", "cost_details": {"currency_code": "EUR", "values": ["0", "10"]}})
    assert (p["price_status"], p["price_min"], p["price_max"], p["is_free"]) == ("paid", 0, 1000, False)
    p = tribe_price({"cost": "$20", "cost_details": {"currency_code": "USD", "values": ["20"]}})
    assert p["price_status"] != "paid" or p["price_min"] != 2000  # no USD as EUR


def test_venue_mapping():
    assert tribe_venue({"venue": []}) == {}
    v = tribe_venue({"venue": {"venue": "Th&eacute;&acirc;tre X", "address": "3 rue Y", "zip": "75005",
                               "city": "Paris", "geo_lat": 48.85, "geo_lng": "2.35"}})
    assert v == {"venue_name": "Théâtre X", "venue_address": "3 rue Y", "venue_city": "Paris",
                 "venue_zip": "75005", "venue_lat": 48.85, "venue_lng": 2.35}


def test_nouvelleseine_real_page():
    v = ALL_VENUES_BY_KEY["nouvelleseine"]
    assert len(parse_tribe_page(_data("nouvelleseine"), v, now=NOW)) == 2  # the 8 Oct shows are over
    evs = parse_tribe_page(_data("nouvelleseine"), v, now=datetime(2026, 10, 8, 12, tzinfo=timezone.utc))
    assert len(evs) == 4
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == "venue_nouvelleseine"
        assert ev["venue_zip"] == "75005" and ev["venue_lat"] == 48.851482
        assert ev["time_known"] and ev["image_url"].startswith("https://lanouvelleseine.com/")
        assert ev["price_status"] == "unknown"  # cost empty → never invented
    assert evs[1]["end_date"] is None  # end == start is not a real end
    first = evs[2]
    assert first["title"] == "Lisa PERRIO dans C’est compliqué, je t’expliquerai."  # HTML entities decoded
    assert first["start_date"] == "2026-10-09T17:00:00+00:00"  # 19:00 Paris
    assert first["end_date"] == "2026-10-09T18:00:00+00:00"
    assert first["source_id"] == "10010564#2026-10-09T17:00:00+00:00"
    assert first["source_url"].startswith("https://lanouvelleseine.com/events/lisa-perrio")


def test_bizzart_no_venue_uses_fixed_venue():
    v = ALL_VENUES_BY_KEY["bizzart"]
    evs = parse_tribe_page(_data("bizzart"), v, now=NOW)
    assert len(evs) == 3
    assert {e["venue_name"] for e in evs} == {"Le Bizz'Art"}
    assert {e["venue_zip"] for e in evs} == {"75010"}
    # "… AFTERWORK feat … DJ …" is a party (soirees); the two others are concerts
    assert sorted(e["category_slug"] for e in evs) == ["concerts", "concerts", "soirees"]
    # without a default venue the event has no place (never guessed)
    bare = events_from_tribe(_data("bizzart"), source="t")
    assert all(e["venue_name"] is None and e["venue_zip"] is None for e in bare)


def test_exploradome_prices():
    v = ALL_VENUES_BY_KEY["exploradome"]
    evs = parse_tribe_page(_data("exploradome"), v, now=NOW)
    by_title = {e["title"]: e for e in evs}
    assert by_title["Visite d’une heure – 10 oct. 2026-10h30"]["price_status"] == "free"
    workshop = by_title["La science du petit déjeuner-10:30"]
    assert (workshop["price_status"], workshop["price_min"], workshop["price_max"]) == ("paid", 500, 500)
    assert workshop["start_date"] == "2026-10-10T08:30:00+00:00"


def test_regardducygne_rooms_and_exclusions():
    v = ALL_VENUES_BY_KEY["regardducygne"]
    raw = _data("regardducygne")
    assert any(e["title"].startswith("Cours Hebdo") for e in raw["events"])
    evs = parse_tribe_page(raw, v, now=NOW)
    assert [e["title"][:9] for e in evs] == ["Concert –", "Concert –"]
    # the event venue is a room ("Grand Studio", no address) → the studio itself
    assert {e["venue_name"] for e in evs} == {"Le Regard du Cygne"}
    assert {e["venue_zip"] for e in evs} == {"75020"}


def test_other_place_keeps_its_own_venue():
    ev = {"id": 1, "title": "Hors les murs", "url": "https://x.fr/e/1",
          "utc_start_date": "2026-12-01 19:00:00", "start_date": "2026-12-01 20:00:00",
          "venue": {"venue": "Salle Pleyel", "address": "252 rue du Faubourg Saint-Honoré",
                    "zip": "75008", "city": "Paris"}}
    from spiders.venues_structured import _same_place

    out = event_from_tribe(ev, source="t", same_place=_same_place,
                           default_venue={"venue_name": "Le Bizz'Art", "venue_zip": "75010",
                                          "venue_lat": 48.87, "venue_lng": 2.36})
    assert out["venue_name"] == "Salle Pleyel" and out["venue_zip"] == "75008"
    assert out["venue_lat"] is None  # the fixed venue's coordinates are not borrowed


def test_malformed_events_are_skipped():
    data = {"events": [{"id": 1}, "junk", {"id": 2, "title": "Ok", "utc_start_date": "2026-12-01 19:00:00"}],
            "total": 3}
    evs = events_from_tribe(data, source="t")
    assert [e["title"] for e in evs] == ["Ok"]
