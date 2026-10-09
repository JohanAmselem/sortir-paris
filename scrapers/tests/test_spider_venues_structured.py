from datetime import datetime, timezone

import pytest

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.venues_config import VENUES, VENUES_BY_KEY
from spiders.venues_structured import (
    clean_iso,
    clean_url,
    parse_ics_feed,
    parse_jsonld_page,
    parse_listing_links,
)

NOW = datetime(2026, 10, 7, tzinfo=timezone.utc)  # fixtures fetched on 2026-10-07

JSONLD_DETAIL = [v.key for v in VENUES if v.enabled and v.kind == "jsonld_detail"]
ICS = [v.key for v in VENUES if v.enabled and v.kind == "ics"]


def test_config_is_consistent():
    assert len(VENUES_BY_KEY) == len(VENUES)
    for v in VENUES:
        assert v.kind in ("jsonld", "jsonld_detail", "ics"), v.key
        assert v.urls, v.key
        assert v.source == f"venue_{v.key}"
        if v.enabled:
            assert v.default_venue.get("venue_name") and v.default_venue.get("venue_zip"), v.key
            if v.kind == "jsonld_detail":
                assert v.detail_link_regex, v.key
        else:
            assert v.notes, f"disabled venue {v.key} must say why"


def test_every_enabled_venue_has_fixture_and_test():
    # adding an enabled venue requires a fixture (see parametrized tests below)
    for key in JSONLD_DETAIL:
        assert load_fixture(f"venue_{key}_listing.html")
        assert load_fixture(f"venue_{key}_detail.html")
    for key in ICS:
        assert load_fixture(f"venue_{key}.ics")


@pytest.mark.parametrize("key", JSONLD_DETAIL)
def test_listing_links(key):
    v = VENUES_BY_KEY[key]
    links = parse_listing_links(load_fixture(f"venue_{key}_listing.html"), v.urls[0], v.detail_link_regex)
    assert len(links) >= 3, links
    assert len(links) == len(set(links))
    assert all(u.startswith("http") and "#" not in u for u in links)


@pytest.mark.parametrize("key", JSONLD_DETAIL)
def test_detail_pages_parse(key):
    v = VENUES_BY_KEY[key]
    evs = parse_jsonld_page(load_fixture(f"venue_{key}_detail.html"), v.urls[0], v, now=NOW)
    assert evs, key
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == f"venue_{key}"
        assert ev["venue_zip"] == v.default_venue["venue_zip"]
        assert ev["category_slug"]


@pytest.mark.parametrize("key", ICS)
def test_ics_feeds_parse(key):
    v = VENUES_BY_KEY[key]
    evs = parse_ics_feed(load_fixture(f"venue_{key}.ics"), v, now=NOW)
    assert len(evs) >= 5
    for ev in evs:
        assert_valid_event(ev)
        assert ev["source"] == f"venue_{key}"
        assert ev["venue_name"] == v.default_venue["venue_name"]
        assert ev["price_status"] == "unknown"  # never guessed from iCal text


# ───────────────────────── precise per-venue assertions ─────────────────────────

def test_bataclan_utc_z_time():
    v = VENUES_BY_KEY["bataclan"]
    url = "https://www.bataclan.fr/evenement/gavin-degraw_2026-10-09"
    (ev,) = parse_jsonld_page(load_fixture("venue_bataclan_detail.html"), url, v, now=NOW)
    assert ev["title"] == "GAVIN DEGRAW"
    assert ev["start_date"] == "2026-10-09T17:30:00+00:00"  # "17:30:00.000Z" = 19h30 Paris
    assert ev["time_known"] is True
    assert ev["venue_address"] == "50 Boulevard Voltaire"
    assert ev["price_status"] == "unknown"  # no offers in JSON-LD → not invented
    assert ev["category_slug"] == "concerts"  # bio keywords ignored
    assert ev["source_url"] == url


def test_olympia_price_and_cancelled():
    v = VENUES_BY_KEY["olympia"]
    (ev,) = parse_jsonld_page(load_fixture("venue_olympia_detail.html"),
                              "https://www.olympiahall.com/agenda/rnboi/", v, now=NOW)
    assert ev["title"] == "RnBoi"
    assert ev["start_date"] == "2026-11-23T19:00:00+00:00"  # naive 20:00 = Paris local
    assert (ev["price_min"], ev["price_max"], ev["price_status"]) == (5900, 5900, "paid")
    (cancelled,) = parse_jsonld_page(load_fixture("venue_olympia_detail_cancelled.html"),
                                     "https://www.olympiahall.com/agenda/salif-keita/", v, now=NOW)
    assert cancelled["event_status"] == "cancelled"


def test_chatelet_subevents_local_time_and_image():
    v = VENUES_BY_KEY["chatelet"]
    url = "https://www.chatelet.com/programmation/26-27/jeu-de-piste-laffiche-a-disparu-2/"
    evs = parse_jsonld_page(load_fixture("venue_chatelet_detail.html"), url, v, now=NOW)
    # parent (season range) skipped; 5 sub-events, the 27/09 one is past
    assert len(evs) == 4
    starts = [e["start_date"] for e in evs]
    # page shows "Samedi 21 novembre 11h00": "T11:00:00+00:00" is Paris local time
    assert "2026-11-21T10:00:00+00:00" in starts
    assert "2027-04-03T09:00:00+00:00" in starts  # 11h00 CEST
    assert all(e["time_known"] for e in evs)
    assert evs[0]["image_url"] == "https://www.chatelet.com/app/uploads/2026/04/JeuDePiste_w.jpg"
    assert evs[0]["venue_address"] == "1 Place du Châtelet"
    assert evs[0]["tags_raw"] == []  # "No Information" performer dropped


def test_lacigale_default_venue_and_price():
    v = VENUES_BY_KEY["lacigale"]
    (ev,) = parse_jsonld_page(load_fixture("venue_lacigale_detail.html"),
                              "https://lacigale.fr/evenements/zed/", v, now=NOW)
    assert ev["title"] == "ZED"
    assert ev["start_date"] == "2026-10-07T18:00:00+00:00"
    assert ev["venue_name"] == "La Cigale" and ev["venue_zip"] == "75018"
    assert ev["price_min"] == 3200


def test_maisondelaradio_hall_and_midnight_end():
    v = VENUES_BY_KEY["maisondelaradio"]
    (ev,) = parse_jsonld_page(load_fixture("venue_maisondelaradio_detail.html"), v.urls[0], v, now=NOW)
    assert ev["venue_name"] == "Maison de la Radio et de la Musique - Auditorium"
    assert ev["start_date"] == "2026-10-08T18:00:00+00:00"
    assert ev["end_date"] is None  # "2026-10-09T00:00+02:00" is not a real end time
    assert (ev["price_min"], ev["price_max"]) == (1200, 6900)
    assert "?" not in ev["source_url"]


def test_orangerie_malformed_date_list_address_and_exclusion():
    v = VENUES_BY_KEY["orangerie"]
    (ev,) = parse_jsonld_page(load_fixture("venue_orangerie_detail.html"), v.urls[0], v, now=NOW)
    assert ev["start_date"] == "2026-10-07T07:00:00+00:00"
    assert ev["venue_address"] == "Jardin des Tuileries, Place de la Concorde (côté Seine) 75001 Paris"
    assert ev["category_slug"] == "visites"
    # a TV documentary listed in the agenda is not an on-site event
    assert parse_jsonld_page(load_fixture("venue_orangerie_detail_documentaire.html"), v.urls[0], v, now=NOW) == []


def test_sunset_drops_bogus_year_long_range():
    v = VENUES_BY_KEY["sunsetsunside"]
    text = load_fixture("venue_sunsetsunside.ics")
    assert "Concert des élèves de piano" in text
    evs = parse_ics_feed(text, v, now=NOW)
    assert all("élèves de piano" not in e["title"] for e in evs)
    ev = next(e for e in evs if e["title"] == "Quinteto Libertad !")
    assert ev["start_date"] == "2026-10-07T17:00:00+00:00"
    assert ev["category_slug"] == "concerts"


def test_comedyclub_ics():
    v = VENUES_BY_KEY["comedyclub"]
    evs = parse_ics_feed(load_fixture("venue_comedyclub.ics"), v, now=NOW)
    ev = next(e for e in evs if e["title"] == "La Random Family au JCC")
    assert ev["start_date"] == "2026-10-07T18:00:00+00:00"
    assert ev["end_date"] == "2026-10-07T20:00:00+00:00"
    assert ev["category_slug"] == "spectacles"
    assert ev["source_id"].endswith("#20261007T200000")


# ───────────────────────── helpers ─────────────────────────

@pytest.mark.parametrize("raw,local,expected", [
    ("2026-10-11T17:50:00+0200T00:00-00:00", False, "2026-10-11T17:50:00+02:00"),
    ("2026-10-09T17:30:00.000Z", False, "2026-10-09T17:30:00+00:00"),
    ("2026-09-27T11:00:00+00:00", True, "2026-09-27T11:00:00"),
    ("2026-09-23", False, "2026-09-23"),
    ("2026-10-17T20:00:00", False, "2026-10-17T20:00:00"),
])
def test_clean_iso(raw, local, expected):
    assert clean_iso(raw, local) == expected


def test_clean_url_strips_tracking():
    u = "https://www.centrepompidou.fr/fr/programme/agenda/evenement/2s1FNB8?utm_source=fb&fbclid=x&id=3#top"
    assert clean_url(u) == "https://www.centrepompidou.fr/fr/programme/agenda/evenement/2s1FNB8?id=3"


def test_past_events_are_dropped():
    v = VENUES_BY_KEY["olympia"]
    later = datetime(2027, 1, 1, tzinfo=timezone.utc)
    assert parse_jsonld_page(load_fixture("venue_olympia_detail_cancelled.html"), v.urls[0], v, now=later) == []


def test_ics_rejects_non_calendar_body():
    assert parse_ics_feed("<html>nope</html>", VENUES_BY_KEY["comedyclub"], now=NOW) == []


def test_room_named_location_is_the_venue_itself():
    """Châtelet events located in "Grande Salle" (no address) belong to the Théâtre du
    Châtelet (75001), never to a shared address-less "Grande Salle" venue."""
    from spiders.venues_structured import is_room_name, parse_jsonld_page

    v = VENUES_BY_KEY["chatelet"]
    html = load_fixture("venue_chatelet_detail.html").replace(
        '"name":"Théâtre du Châtelet"', '"name":"Grande Salle"')
    evs = parse_jsonld_page(html, v.urls[0], v, now=NOW)
    assert evs and all(e["venue_name"] == "Théâtre du Châtelet" and e["venue_zip"] == "75001" for e in evs)
    for name in ("Grande Salle", "La Petite Salle", "Studio 2", "Foyer", "Grand Foyer", "Salle B"):
        assert is_room_name(name), name
    for name in ("Salle Gaveau", "Salle Pleyel", "Studio Hébertot", "La Seine Musicale"):
        assert not is_room_name(name), name


def test_38riv_times_are_right_and_utc_title_suffix_is_dropped():
    """Audit 9 Oct: "Jeanne Lee par Äulne – 09/10/2026 - 17:30" displayed at 19:30.
    The JSON-LD says 19:30+02:00 (Paris Jazz Club agrees: 19:30 and 21:30); the time in
    the site's event NAME is UTC. Times are kept; the misleading suffix is removed."""
    from spiders.venues_config import ALL_VENUES_BY_KEY
    from spiders.venues_structured import parse_jsonld_page
    from utils.dates import paris_local
    from validation import validate

    v = ALL_VENUES_BY_KEY["38riv"]
    evs = parse_jsonld_page(load_fixture("venue_38riv_detail.html"),
                            "https://38riv.com/concerts/jeanne-lee-par-aulne", v, now=NOW)
    assert sorted(paris_local(e["start_date"]).strftime("%H:%M") for e in evs) == ["19:30", "21:30"]
    assert {validate(e, now=NOW)[0].title for e in evs} == {"Jeanne Lee par Äulne"}
