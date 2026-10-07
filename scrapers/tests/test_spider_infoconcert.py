"""InfoConcert is behind a Cloudflare challenge (2026-10-07): the only real fixture is the
challenge page. The JSON-LD tests use minimal schema.org shapes built inline to pin the
parsing RULES (own date, offer-scoped price, IDF filter, placeholder images)."""
from __future__ import annotations

import json

from tests.conftest import load_fixture
from tests.helpers import assert_valid_event
from spiders.infoconcert import drop_shared_images, is_challenge, parse_detail

URL = "https://www.infoconcert.com/concerts/concert-x-paris-1.html"


def _page(objs, body=""):
    s = "".join(f'<script type="application/ld+json">{json.dumps(o)}</script>' for o in objs)
    return f"<html><head>{s}</head><body>{body}</body></html>"


def _music_event(name, start, zip_code="75011", price="35", lat=None, lng=None, image=None):
    place = {"@type": "Place", "name": "Le Bataclan",
             "address": {"@type": "PostalAddress", "postalCode": zip_code, "addressLocality": "Paris"}}
    if lat is not None:
        place["geo"] = {"@type": "GeoCoordinates", "latitude": lat, "longitude": lng}
    ev = {"@type": "MusicEvent", "name": name, "startDate": start, "url": URL, "location": place,
          "offers": {"@type": "Offer", "price": price, "priceCurrency": "EUR"}}
    if image:
        ev["image"] = image
    return ev


def test_challenge_page_detected_and_skipped():
    html = load_fixture("infoconcert_cloudflare_challenge.html")
    assert is_challenge(html)
    assert parse_detail(html, URL) == []


def test_own_date_and_offer_price_not_page_text():
    # The page body mentions another date and "gratuit": must not leak into the event.
    body = "<p>Prochain concert le 3 juin 2026. Entrée gratuite pour le pass VIP.</p>"
    html = _page([_music_event("Artiste X", "2026-10-24T20:00:00+02:00")], body)
    evs = parse_detail(html, URL)
    assert len(evs) == 1
    ev = evs[0]
    assert_valid_event(ev)
    assert ev["start_date"] == "2026-10-24T18:00:00+00:00"
    assert ev["time_known"] is True
    assert (ev["price_min"], ev["is_free"], ev["price_status"]) == (3500, False, "paid")
    assert ev["category_slug"] == "concerts"


def test_outside_idf_dropped():
    html = _page([
        _music_event("Artiste X", "2026-10-24T20:00:00+02:00"),
        _music_event("Artiste X", "2026-11-02T20:00:00+01:00", zip_code="69002", lat=45.76, lng=4.83),
    ])
    evs = parse_detail(html, URL)
    assert [e["venue_zip"] for e in evs] == ["75011"]


def test_drop_shared_images():
    shared = "https://statics.infoconcert.com/images/artist/muse.jpg"
    evs = [{"title": t, "image_url": shared} for t in ("A", "B", "C")]
    evs.append({"title": "D", "image_url": "https://statics.infoconcert.com/images/artist/d.jpg"})
    evs.append({"title": "E", "image_url": "https://statics.infoconcert.com/img/default-concert.jpg"})
    # same artist, two dates sharing its own picture: kept
    two = "https://statics.infoconcert.com/images/artist/f.jpg"
    evs += [{"title": "F", "image_url": two}, {"title": "F", "image_url": two}]
    out = drop_shared_images(evs, max_titles=2)
    assert [e["image_url"] for e in out[:3]] == [None, None, None]
    assert out[3]["image_url"].endswith("/d.jpg")
    assert out[4]["image_url"] is None  # generic/default path
    assert out[5]["image_url"] == two and out[6]["image_url"] == two
    assert evs[0]["image_url"] == shared  # input not mutated
