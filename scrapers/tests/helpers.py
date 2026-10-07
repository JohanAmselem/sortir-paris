"""Shared assertions for spider parser tests."""
from datetime import datetime

REQUIRED_KEYS = {
    "source", "source_id", "title", "start_date", "end_date", "time_known",
    "price_min", "price_max", "is_free", "price_status", "slug", "event_status", "is_online",
}


def assert_valid_event(ev: dict) -> None:
    missing = REQUIRED_KEYS - set(ev)
    assert not missing, f"missing keys: {missing}"
    assert ev["title"], "empty title"
    assert ev["source_id"], "empty source_id"
    assert ev["start_date"], "no start_date"
    start = datetime.fromisoformat(ev["start_date"])
    assert start.tzinfo is not None, "start_date must be timezone-aware (UTC)"
    if ev["end_date"]:
        assert datetime.fromisoformat(ev["end_date"]) >= start
    assert ev["price_status"] in ("free", "paid", "unknown")
    assert 0 <= ev["price_min"] <= ev["price_max"] or ev["price_max"] == 0
    if ev["is_free"]:
        assert ev["price_status"] == "free" and ev["price_max"] == 0
