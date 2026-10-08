"""Discovered venues (spiders/venues_config.DISCOVERED_VENUES) and the generic-spider
features added for them: microdata, ItemList links, location tidying, require_location,
noon placeholder, iCal with LOCATION, sharding.

Fixtures are trimmed real pages fetched on 2026-10-09 (JSON-LD blocks / links only).
"""
from datetime import datetime, timezone

import pytest

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event

from spiders.venues_config import ALL_VENUES, ALL_VENUES_BY_KEY, DISCOVERED_VENUES, VENUES, VenueSource
from spiders.venues_structured import (
    estimate_requests, extract_microdata_events, parse_ics_feed, parse_itemlist_links, parse_jsonld_page,
    parse_listing_links, plan_shards, runtime_report, select_venues,
)
from utils.normalize import SERVICE_DEPARTMENTS
from validation import decide_status, validate

NOW = datetime(2026, 10, 9, tzinfo=timezone.utc)
KINDS = ("jsonld", "jsonld_detail", "ics", "tribe")


def _v(key):
    return ALL_VENUES_BY_KEY[key]


# ───────────────────────────── registry ─────────────────────────────

def test_registry_is_consistent():
    assert len(ALL_VENUES) == len(VENUES) + len(DISCOVERED_VENUES) == len(ALL_VENUES_BY_KEY)
    for v in ALL_VENUES:
        assert v.kind in KINDS, v.key
        assert v.urls and v.urls[0].startswith("http"), v.key
        assert v.source == f"venue_{v.key}"
        assert v.key.isascii() and v.key == v.key.lower(), v.key
        if not v.enabled:
            assert v.notes, f"disabled venue {v.key} must say why"
            continue
        if v.kind == "jsonld_detail":
            assert v.detail_link_regex, v.key
        dv = v.default_venue
        if dv:
            assert dv.get("venue_name") and str(dv.get("venue_zip"))[:2] in SERVICE_DEPARTMENTS, v.key
        else:  # multi-venue source: every event must carry its own in-zone place
            assert v.require_location, v.key
    for v in DISCOVERED_VENUES:  # discovered fixed venues are BAN-geocoded
        if v.enabled and v.default_venue:
            assert v.default_venue.get("venue_lat") is not None and v.default_venue.get("venue_lng") is not None


def test_discovered_enabled_count():
    enabled = [v for v in DISCOVERED_VENUES if v.enabled]
    assert len(enabled) >= 30
    assert {v.kind for v in enabled} == set(KINDS)


# ───────────────────────────── sharding / runtime ─────────────────────────────

def test_shards_partition_enabled_venues():
    enabled = [v for v in ALL_VENUES if v.enabled]
    for n in (1, 2, 3):
        shards = plan_shards(enabled, n)
        keys = [v.key for s in shards for v in s]
        assert sorted(keys) == sorted(v.key for v in enabled)
        loads = [sum(estimate_requests(v) for v in s) for s in shards]
        assert max(loads) - min(loads) <= max(estimate_requests(v) for v in enabled)
    assert [v.key for v in select_venues(shard=1, shards=2)] == [v.key for v in plan_shards(enabled, 2)[1]]
    with pytest.raises(ValueError):
        select_venues(shard=2, shards=2)


def test_runtime_fits_budget_with_two_shards():
    for shard in runtime_report(2):
        assert shard["minutes"] < 25  # SourceSpec budget is 30 min


def test_estimate_requests():
    assert estimate_requests(VenueSource("a", "A", "ics", urls=["https://a/x.ics"])) == 2
    assert estimate_requests(VenueSource("a", "A", "tribe", urls=["https://a/"], max_pages=3)) == 4
    assert estimate_requests(VenueSource("a", "A", "jsonld_detail", urls=["https://a/{page}"],
                                         max_pages=2, max_details=10)) == 13


# ───────────────────────────── iCal with LOCATION (Events Manager) ─────────────────────────────

def test_tam_ics_locations_and_unlocated_dropped():
    v = _v("tam")
    evs = parse_ics_feed(load_fixture("venue_tam.ics"), v, now=NOW)
    assert len(evs) == 6  # 3 VEVENTs without LOCATION are dropped (place never guessed)
    for ev in evs:
        assert_valid_event(ev)
        assert ev["venue_zip"] == "92500"
        assert ev["venue_lat"] and ev["venue_lng"]
        assert ev["price_status"] == "unknown"
    first = evs[0]
    assert first["title"] == "Pierre Christophe et Hugo Lippi"
    assert first["venue_name"] == "Cabaret Ariel Centre-Ville"
    assert first["start_date"] == "2026-10-09T18:15:00+00:00"  # TZID=Europe/Paris 20:15
    assert {e["venue_name"] for e in evs} == {"Cabaret Ariel Centre-Ville", "Théâtre André Malraux"}


# ───────────────────────────── JSON-LD detail pages ─────────────────────────────

def test_theatrebelleville_listing_and_noon_placeholder():
    v = _v("theatrebelleville")
    links = parse_listing_links(load_fixture("venue_theatrebelleville_listing.html"),
                                "https://www.theatredebelleville.com/", v.detail_link_regex)
    assert "https://www.theatredebelleville.com/programmation/a-venir/yoni" in links
    assert len(links) >= 3
    evs = parse_jsonld_page(load_fixture("venue_theatrebelleville_detail.html"),
                            "https://www.theatredebelleville.com/programmation/a-venir/yoni", v, now=NOW)
    assert len(evs) >= 2 and {e["title"] for e in evs} == {"Yoni"}
    for ev in evs:
        assert_valid_event(ev)
        assert ev["venue_zip"] == "75011"
        assert ev["time_known"] is False  # "T12:00:00+02:00" while the page says 21h15 / 15h
        assert ev["end_date"] is None
    assert evs[0]["start_date"] == "2026-10-10T10:00:00+00:00"  # the day is kept


def test_troisbaudets_address_equal_to_name_is_ignored():
    v = _v("troisbaudets")
    (ev,) = parse_jsonld_page(load_fixture("venue_troisbaudets_detail.html"),
                              "https://lestroisbaudets.com/l-agenda/loc-laure-briard", v, now=NOW)
    assert ev["title"] == "Laure Briard"
    assert ev["venue_name"] == "Les Trois Baudets"
    assert ev["venue_address"] == "64 Boulevard de Clichy"  # not "Les Trois Baudets"
    assert ev["start_date"] == "2026-10-09T18:00:00+00:00"
    assert (ev["price_status"], ev["price_min"]) == ("paid", 1000)


def test_damedecanton_city_as_place_name():
    v = _v("damedecanton")
    (ev,) = parse_jsonld_page(load_fixture("venue_damedecanton_detail.html"),
                              "https://www.damedecanton.com/event-details/kndns-x-sicklips", v, now=NOW)
    assert ev["venue_name"] == "La Dame de Canton"  # location name was just "Paris"
    assert ev["venue_zip"] == "75013" and ev["venue_lat"] is not None
    assert ev["start_date"] == "2026-10-09T18:30:00+00:00"


def test_operacomique_one_event_per_performance():
    v = _v("operacomique")
    evs = parse_jsonld_page(load_fixture("venue_operacomique_detail.html"),
                            "https://www.opera-comique.com/fr/spectacles/l-histoire-du-soldat-little-hill", v, now=NOW)
    assert len(evs) >= 4
    assert len({e["source_id"] for e in evs}) == len(evs)
    for ev in evs:
        assert_valid_event(ev)
        assert ev["venue_zip"] == "75002"
        assert (ev["price_status"], ev["price_min"]) == ("paid", 4000)
    assert evs[0]["start_date"] == "2026-11-08T15:00:00+00:00"


# ───────────────────────────── microdata ─────────────────────────────

def test_gaitelyrique_microdata_rooms_single_site():
    v = _v("gaitelyrique")
    html = load_fixture("venue_gaitelyrique_agenda.html")
    assert "ld+json" not in html
    items = extract_microdata_events(html)
    assert len(items) == 8
    assert items[0]["name"] == "Finally, Something Good." and not items[0].get("startDate")
    evs = parse_jsonld_page(html, v.urls[0], v, now=NOW)
    # undated exhibition skipped, duplicate item merged, food-aid sessions excluded
    assert sorted(e["title"] for e in evs) == [
        "(Im)posture féministe", "Rallye culturel", "Rester (vraiment) libres, se réapproprier nos imaginaires",
        "Votre attention svp !", "Yadu yoga"]  # clean_text turns the narrow nbsp into a space
    for ev in evs:
        assert_valid_event(ev)
        assert ev["venue_name"] == "La Gaîté Lyrique" and ev["venue_zip"] == "75003"
        assert ev["source_url"].startswith("https://www.gaite-lyrique.net/agenda/")
    by_title = {e["title"]: e for e in evs}
    assert by_title["Rallye culturel"]["start_date"] == "2026-10-10T12:00:00+00:00"


MICRODATA = """
<div itemscope itemtype="https://schema.org/MusicEvent">
  <h2 itemprop="name">Trio Test</h2>
  <time itemprop="startDate" datetime="2026-11-20T20:30">20 nov. 20h30</time>
  <a itemprop="url" href="/agenda/trio-test">Détails</a>
  <img itemprop="image" src="/img/trio.jpg">
  <div itemprop="location" itemscope itemtype="https://schema.org/Place">
    <span itemprop="name">Salle Test</span>
    <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
      <span itemprop="streetAddress">1 rue de Test</span>
      <span itemprop="postalCode">93100</span> <span itemprop="addressLocality">Montreuil</span>
    </div>
  </div>
  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
    <meta itemprop="price" content="12"><meta itemprop="priceCurrency" content="EUR">
  </div>
</div>
<div itemscope itemtype="https://schema.org/Event"><span itemprop="name">Sans date</span></div>
"""


def test_microdata_nested_items():
    v = VenueSource("t", "Salle Test", "jsonld", urls=["https://test.fr/agenda"])
    (ev,) = parse_jsonld_page(MICRODATA, "https://test.fr/agenda", v, now=NOW)
    assert ev["title"] == "Trio Test"
    assert ev["start_date"] == "2026-11-20T19:30:00+00:00"
    assert ev["source_url"] == "https://test.fr/agenda/trio-test"
    assert ev["image_url"] == "https://test.fr/img/trio.jpg"
    assert (ev["venue_name"], ev["venue_address"], ev["venue_zip"]) == ("Salle Test", "1 rue de Test", "93100")
    assert (ev["price_status"], ev["price_min"]) == ("paid", 1200)
    assert ev["category_slug"] == "concerts"


def test_jsonld_wins_over_microdata():
    html = MICRODATA + """<script type="application/ld+json">{"@type": "Event", "name": "LD",
        "startDate": "2026-12-01T20:00", "location": {"name": "Salle Test"}}</script>"""
    v = VenueSource("t", "Salle Test", "jsonld", urls=["https://test.fr/"])
    assert [e["title"] for e in parse_jsonld_page(html, "https://test.fr/", v, now=NOW)] == ["LD"]


# ───────────────────────────── ItemList → detail pages ─────────────────────────────

ITEMLIST = """<script type="application/ld+json">{"@context": "https://schema.org", "@type": "ItemList",
 "itemListElement": [
   {"@type": "ListItem", "position": 1, "url": "https://salle.fr/evenement/a"},
   {"@type": "ListItem", "position": 2, "item": {"@id": "https://salle.fr/evenement/b"}},
   {"@type": "ListItem", "position": 3, "url": "/evenement/c#billets"},
   {"@type": "ListItem", "position": 4, "url": "https://salle.fr/actualites/x"}
 ]}</script>"""


def test_itemlist_links():
    assert parse_itemlist_links(ITEMLIST, "https://salle.fr/agenda") == [
        "https://salle.fr/evenement/a", "https://salle.fr/evenement/b",
        "https://salle.fr/evenement/c", "https://salle.fr/actualites/x"]
    assert parse_itemlist_links(ITEMLIST, "https://salle.fr/agenda", r"/evenement/") == [
        "https://salle.fr/evenement/a", "https://salle.fr/evenement/b", "https://salle.fr/evenement/c"]


# ───────────────────────────── location rules ─────────────────────────────

def _ld(location, start="2026-12-01T20:00:00+01:00"):
    import json

    return ('<script type="application/ld+json">'
            + json.dumps({"@type": "Event", "name": "Concert test", "startDate": start, "location": location})
            + "</script>")


def test_require_location_drops_unknown_and_out_of_zone():
    v = VenueSource("t", "Multi", "jsonld", urls=["https://m.fr/"], require_location=True)
    assert parse_jsonld_page(_ld({"name": "Salle sans adresse"}), v.urls[0], v, now=NOW) == []
    out = {"name": "Opéra de Rouen", "address": {"streetAddress": "7 rue du Dr Rambert", "postalCode": "76000"}}
    assert parse_jsonld_page(_ld(out), v.urls[0], v, now=NOW) == []
    inz = {"name": "Salle", "address": "12 rue de la Paix 93100 Montreuil"}
    (ev,) = parse_jsonld_page(_ld(inz), v.urls[0], v, now=NOW)
    assert ev["venue_zip"] == "93100"  # postcode read from the address string


def test_location_name_list_is_joined():
    v = _v("chaillot")
    loc = {"name": ["Chaillot", "Salle Jean Vilar"], "address": {"streetAddress": "1 place du Trocadéro",
                                                                 "postalCode": "75116"}}
    (ev,) = parse_jsonld_page(_ld(loc), v.urls[0], v, now=NOW)
    assert ev["venue_name"] == "Chaillot – Salle Jean Vilar"


def test_discovered_events_pass_validation():
    """Every fixture-backed discovered event is publishable (no hard reason)."""
    import json

    from spiders.venues_structured import parse_tribe_page

    evs = parse_ics_feed(load_fixture("venue_tam.ics"), _v("tam"), now=NOW)
    for key in ("nouvelleseine", "bizzart", "exploradome", "regardducygne"):
        evs += parse_tribe_page(json.loads(load_fixture(f"venue_{key}_tribe.json")), _v(key), now=NOW)
    evs += parse_jsonld_page(load_fixture("venue_operacomique_detail.html"), _v("operacomique").urls[0],
                             _v("operacomique"), now=NOW)
    for ev in evs:
        _, hard, _, score = validate(ev, now=NOW)
        assert not hard, (ev["title"], hard)
        assert decide_status(hard, score) in ("active", "draft")
