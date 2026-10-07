from datetime import datetime, timedelta, timezone

from utils.event import make_event
from validation import decide_status, validate

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


def good(**over):
    base = dict(
        source="test",
        source_id="1",
        title="Concert de Jazz manouche au Sunside",
        start="2026-10-20T21:00:00",
        description="Une soirée de jazz manouche avec le quartet de Paulo, entre swing et ballades, dans le club historique.",
        image_url="https://example.org/a.jpg",
        price_raw="15 €",
        venue_name="Sunset-Sunside",
        venue_zip="75001",
        venue_lat=48.8597,
        venue_lng=2.3477,
        category_slug="concerts",
    )
    base.update(over)
    return make_event(**base)


def test_good_event_published():
    ev, hard, soft, score = validate(good(), now=NOW)
    assert hard == [] and soft == [] and score == 100
    assert decide_status(hard, score) == "active"
    assert ev.start_date == datetime(2026, 10, 20, 19, 0, tzinfo=timezone.utc)


def test_hard_rejections():
    cases = {
        "no_title": good(title=""),
        "junk_title": good(title="Concert"),
        "no_start_date": good(start=None),
        "ended": good(start="2026-09-01T20:00:00"),
        "too_far_ahead": good(start="2028-10-01T20:00:00"),
        "span_too_long": good(start="2026-10-08", end="2027-12-31"),
        "price_outlier": good(price_raw="650 €"),
        "out_of_zone": good(venue_lat=49.44, venue_lng=1.09),  # Rouen
        "online": good(is_online=True),
        "cancelled": good(event_status="cancelled"),
    }
    for reason, event in cases.items():
        _, hard, _, _ = validate(event, now=NOW)
        assert reason in hard, (reason, hard)


def test_out_of_zone_postcode_and_free_with_price():
    ev = good(venue_lat=None, venue_lng=None, venue_zip="76000")
    assert "out_of_zone" in validate(ev, now=NOW)[1]
    ev = good()
    ev["is_free"] = True
    assert "free_with_price" in validate(ev, now=NOW)[1]
    ev = good(start="2026-10-20T21:00:00")
    ev["end_date"] = "2026-10-19T21:00:00+00:00"
    assert "end_before_start" in validate(ev, now=NOW)[1]


def test_ongoing_exhibition_is_not_ended():
    ev = good(start="2026-09-01", end="2027-01-10", category_slug="expos")
    _, hard, soft, score = validate(ev, now=NOW)
    assert hard == [] and "time_unknown" in soft


def test_soft_penalties_and_draft():
    ev = good(image_url=None, description=None, start="2026-10-20", price_raw=None,
              venue_lat=None, venue_lng=None)
    _, hard, soft, score = validate(ev, now=NOW)
    assert hard == []
    assert set(soft) == {"no_image", "short_description", "time_unknown", "price_unknown", "venue_not_geocoded"}
    assert score == 30
    assert decide_status(hard, score) == "draft"


def test_status_decisions():
    assert decide_status(["cancelled", "online"], 100) == "cancelled"
    assert decide_status(["ended"], 100) == "rejected"
    assert decide_status([], 50) == "active"
    assert decide_status([], 49) == "draft"


def test_unknown_category_becomes_null_with_penalty():
    ev = good(category_slug="sport")
    out, hard, soft, _ = validate(ev, now=NOW)
    assert out.category_slug is None and "no_category" in soft and hard == []


def test_malformed_dict_rejected_not_crashing():
    _, hard, _, score = validate({"source": "x", "source_id": "1", "start_date": "nope"}, now=NOW)
    assert hard and score == 0
