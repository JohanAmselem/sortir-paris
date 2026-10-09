import io
import json
import zipfile
from datetime import datetime, timezone

import pytest

from tests.conftest import FIXTURES
from tests.helpers import assert_valid_event

import spiders.datatourisme as dt
from spiders.datatourisme import parse_object, parse_zip
from validation import decide_status, validate

NOW = datetime(2026, 10, 9, 10, 0, tzinfo=timezone.utc)
FLUX = FIXTURES / "datatourisme_flux"


def load(name):
    for p in FLUX.glob("objects/*/*.json"):
        if p.stem == name:
            return json.loads(p.read_text(encoding="utf-8"))
    raise KeyError(name)


def zip_bytes() -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for p in sorted(FLUX.rglob("*.json")):
            zf.write(p, p.relative_to(FLUX).as_posix())
    buf.seek(0)
    return buf


@pytest.fixture(scope="module")
def events():
    return {ev["source_id"]: ev for ev in parse_zip(zip_bytes(), now=NOW)}


def by_title(events, title):
    return [e for e in events.values() if e["title"] == title]


# ── whole archive ──

def test_archive_keeps_only_dated_cultural_events_in_zone(events):
    titles = {e["title"] for e in events.values()}
    assert titles == {
        "Événement - Octobre médiéval 2026",
        "Brassaï – L’œil de Paris",
        "Gianni Versace Retrospective",
        "Les Rencontres du Ciel et de l’Espace",
    }
    for ev in events.values():
        assert_valid_event(ev)
        assert ev["source"] == "datatourisme"
        assert ev["venue_zip"][:2] in ("75", "92", "93", "94")
        _, hard, _, _ = validate(ev, now=NOW)
        assert hard == [], (ev["title"], hard)


def test_one_event_per_future_period(events):
    evs = sorted(by_title(events, "Événement - Octobre médiéval 2026"), key=lambda e: e["start_date"])
    # periods on 3 and 6 October are past on 9 October
    assert [e["start_date"][:10] for e in evs] == ["2026-10-10", "2026-10-13", "2026-10-16", "2026-10-24"]
    # date-only periods: the repo's "unknown time" convention (noon Paris), time_known False
    assert evs[0]["start_date"] == "2026-10-10T10:00:00+00:00"
    assert all(e["time_known"] is False for e in evs)
    uri = "https://data.datatourisme.fr/13/895f8f4c-7f76-306a-82d9-7c6d509b9fb4"
    assert evs[0]["source_id"] == f"{uri}#2026-10-10"
    assert len({e["source_id"] for e in evs}) == 4
    assert evs[0]["source_url"] == uri
    assert evs[0]["category_slug"] == "concerts"
    assert evs[0]["venue_name"] == "Basilique cathédrale de Saint-Denis"
    assert evs[0]["venue_address"] == "1 rue de la Légion d'honneur"
    assert evs[0]["booking_url"] == "https://www.saint-denis-basilique.fr/agenda/octobre-medieval-2026"


def test_exhibition_single_period_uses_uri_as_id(events):
    ev = events["https://data.datatourisme.fr/13/46c479e8-2132-384e-a3cf-c84e8a67ec10"]
    assert ev["title"] == "Gianni Versace Retrospective"  # {"@value", "@language"} literals
    assert ev["category_slug"] == "expos"
    assert ev["start_date"] == "2026-06-05T10:00:00+00:00"
    assert ev["end_date"].startswith("2026-10-31T")
    assert ev["venue_name"] == "Musée Maillol"
    assert ev["venue_zip"] == "75007" and ev["venue_arrondissement"] == "7e"
    assert ev["venue_lat"] == pytest.approx(48.854795) and ev["venue_lng"] == pytest.approx(2.324924)
    assert ev["price_status"] == "unknown"  # no offers in the data: never guessed
    assert ev["image_url"] is None


def test_end_before_start_keeps_start_only(events):
    (ev,) = by_title(events, "Brassaï – L’œil de Paris")
    assert ev["start_date"] == "2026-10-17T10:00:00+00:00"
    assert ev["end_date"] is None
    assert ev["venue_city"] == "Meudon" and ev["venue_name"] == "Hangar Y"


def test_conference_category_and_multi_day(events):
    (ev,) = by_title(events, "Les Rencontres du Ciel et de l’Espace")
    assert ev["category_slug"] == "conferences"
    assert ev["venue_name"] == "Cité des sciences et de l'industrie"
    assert ev["end_date"].startswith("2026-11-15T")


# ── single objects (fields absent from the real data are added inline) ──

def test_start_time_gives_known_paris_time():
    o = load("rencontres-ciel")
    o["takesPlaceAt"] = [{"startDate": "2026-11-13", "endDate": "2026-11-13",
                          "startTime": "20:30:00", "endTime": "22:00:00"}]
    (ev,) = parse_object(o, now=NOW)
    assert ev["start_date"] == "2026-11-13T19:30:00+00:00"  # 20:30 Paris (CET)
    assert ev["end_date"] == "2026-11-13T21:00:00+00:00"
    assert ev["time_known"] is True


def test_prices_free_and_image():
    o = load("rencontres-ciel")
    o["schema:offers"] = [{"schema:priceSpecification": [
        {"schema:minPrice": 8, "schema:maxPrice": "12.50", "schema:priceCurrency": "EUR"}]}]
    o["hasMainRepresentation"] = [{"ebucore:hasRelatedResource": [
        {"ebucore:locator": ["https://example.org/test-image.jpg"]}]}]
    o["hasBookingContact"] = [{"foaf:homepage": "https://example.org/billetterie"}]
    (ev,) = parse_object(o, now=NOW)
    assert ev["price_status"] == "paid" and (ev["price_min"], ev["price_max"]) == (800, 1250)
    assert ev["image_url"] == "https://example.org/test-image.jpg"
    assert ev["booking_url"] == "https://example.org/billetterie"

    o["schema:offers"] = [{"schema:priceSpecification": [{"hasEligiblePolicy": {"@id": "kb:Free"}}]}]
    (ev,) = parse_object(o, now=NOW)
    assert ev["is_free"] and ev["price_status"] == "free"


def test_many_periods_collapse_into_one_run():
    o = load("versace")
    o["takesPlaceAt"] = [{"startDate": f"2026-10-{d:02d}", "endDate": f"2026-10-{d:02d}",
                          "startTime": "11:00"} for d in range(10, 31)]
    evs = parse_object(o, now=NOW)
    assert len(evs) == 1
    assert evs[0]["start_date"] == "2026-10-10T09:00:00+00:00"
    assert evs[0]["end_date"].startswith("2026-10-30T")


@pytest.mark.parametrize("name", ["rugby", "marche-cachan", "moulin-rouge", "coupes-linas", "hotel"])
def test_skipped_objects(name):
    assert parse_object(load(name), now=NOW) == []


def test_past_event_skipped():
    o = load("brassai")
    o["takesPlaceAt"] = [{"startDate": "2026-09-01", "endDate": "2026-09-30"}]
    assert parse_object(o, now=NOW) == []


def test_postcode_missing_falls_back_to_insee_department():
    o = load("brassai")
    addr = o["isLocatedAt"][0]["schema:address"][0]
    del addr["schema:postalCode"]
    assert len(parse_object(o, now=NOW)) == 1
    addr["hasAddressCity"]["isPartOfDepartment"]["insee"] = "78"
    assert parse_object(o, now=NOW) == []


def test_api_style_unprefixed_object():
    """The v1 API returns the same ontology with plain keys (label, takesPlaceAt…)."""
    o = {
        "uuid": "5802f421-b8c1-3f16-bcf7-8ce30b4416e8",
        "uri": "https://data.datatourisme.fr/13/5802f421-b8c1-3f16-bcf7-8ce30b4416e8",
        "type": ["Conference", "CulturalEvent", "EntertainmentAndEvent", "PointOfInterest"],
        "label": {"fr": "Les Rencontres du Ciel et de l’Espace"},
        "hasDescription": [{"shortDescription": {"fr": "Conférences d'astronomie."}}],
        "takesPlaceAt": [{"startDate": "2026-11-13", "endDate": "2026-11-15"}],
        "isLocatedAt": [{"address": [{"postalCode": "75019", "addressLocality": "Paris",
                                       "streetAddress": ["30 avenue Corentin Cariou"]}],
                         "geo": {"latitude": 48.895602, "longitude": 2.388069}}],
        "hasContact": [{"homepage": ["https://www.cite-sciences.fr/fr/accueil"]}],
    }
    (ev,) = parse_object(o, now=NOW)
    assert ev["source_id"] == o["uri"]
    assert ev["short_desc"] == "Conférences d'astronomie."
    assert ev["category_slug"] == "conferences"
    _, hard, _, score = validate(ev, now=NOW)
    assert decide_status(hard, score) in ("active", "draft")


def test_bad_member_does_not_stop_archive():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("objects/0/broken.json", "{not json")
        zf.writestr("objects/0/ok.json", json.dumps(load("versace")))
    buf.seek(0)
    assert [e["title"] for e in parse_zip(buf, now=NOW)] == ["Gianni Versace Retrospective"]


def test_no_env_yields_nothing(monkeypatch):
    monkeypatch.delenv("DATATOURISME_FLUX_URL", raising=False)
    monkeypatch.delenv("DATATOURISME_API_KEY", raising=False)
    assert list(dt.fetch_events()) == []


def test_flux_url_keys_are_masked():
    assert dt._mask("https://diffuseur.datatourisme.fr/webservice/abc123/def456") == \
        "https://diffuseur.datatourisme.fr/webservice/***"


def test_api_filter_targets_zone_and_future():
    p = dt.api_params(datetime(2026, 10, 9).date())
    assert "isPartOfDepartment.insee[in]=75,92,93,94" in p["filters"]
    assert "takesPlaceAt.endDate[gte]=2026-10-09" in p["filters"]
    assert int(p["page_size"]) <= 100


def test_texts_api_v1_language_keys():
    from spiders.datatourisme import _text
    assert _text({"@fr": "Concert de Noël", "@en": "Christmas concert"}) == "Concert de Noël"
    assert _text([{"@en": "Only English"}]) == "Only English"
