from datetime import date, datetime, timezone

import pytest

from utils.dates import PARIS, normalize_when, parse_date_fr, parse_time_fr, to_utc_paris

TODAY = date(2026, 10, 7)


def utc(*args):
    return datetime(*args, tzinfo=timezone.utc)


# ── to_utc_paris ──

def test_naive_is_paris_local_summer():
    assert to_utc_paris("2026-07-14T20:00:00") == utc(2026, 7, 14, 18, 0)


def test_naive_is_paris_local_winter():
    assert to_utc_paris(datetime(2026, 12, 24, 20, 0)) == utc(2026, 12, 24, 19, 0)


def test_dst_change_2026_10_25():
    # 25 Oct 2026: clocks go back at 03:00 CEST → 02:00 CET
    assert to_utc_paris("2026-10-24T20:00:00") == utc(2026, 10, 24, 18, 0)  # CEST, UTC+2
    assert to_utc_paris("2026-10-25T20:00:00") == utc(2026, 10, 25, 19, 0)  # CET, UTC+1
    # ambiguous 02:30 → first occurrence (CEST)
    assert to_utc_paris("2026-10-25T02:30:00") == utc(2026, 10, 25, 0, 30)


def test_aware_values_are_converted_not_shifted():
    assert to_utc_paris("2026-10-25T20:00:00+02:00") == utc(2026, 10, 25, 18, 0)
    assert to_utc_paris("2026-10-25T18:00:00Z") == utc(2026, 10, 25, 18, 0)
    aware = datetime(2026, 10, 25, 20, 0, tzinfo=PARIS)
    assert to_utc_paris(aware) == utc(2026, 10, 25, 19, 0)


def test_date_only_is_noon_paris_and_time_unknown():
    assert to_utc_paris("2026-10-25") == utc(2026, 10, 25, 11, 0)
    iso, known = normalize_when("2026-10-25")
    assert known is False and iso.startswith("2026-10-25T11:00")
    assert normalize_when(date(2026, 7, 1)) == ("2026-07-01T10:00:00+00:00", False)


def test_end_date_only_is_end_of_day():
    iso, _ = normalize_when("2026-10-25", is_end=True)
    assert iso == "2026-10-25T22:59:00+00:00"


def test_midnight_unknown_option():
    assert normalize_when("2026-10-25T00:00:00", midnight_unknown=True)[1] is False
    assert normalize_when("2026-10-25T00:00:00")[1] is True
    assert normalize_when(None) == (None, False)
    assert normalize_when("pas une date") == (None, False)


# ── parse_date_fr ──

def test_range_across_months_and_year():
    r = parse_date_fr("du 15 oct. au 10 janv.", today=TODAY)
    assert r.start == datetime(2026, 10, 15) and r.end == datetime(2027, 1, 10)
    assert r.time_known is False


def test_range_explicit_years():
    r = parse_date_fr("Du 15 octobre 2026 au 10 janvier 2027", today=TODAY)
    assert (r.start.date(), r.end.date()) == (date(2026, 10, 15), date(2027, 1, 10))


def test_range_only_end_year():
    r = parse_date_fr("du 15 oct au 10 janv 2027", today=TODAY)
    assert r.start.date() == date(2026, 10, 15)


def test_two_days_same_month():
    r = parse_date_fr("Le 25 et 26 octobre", today=TODAY)
    assert (r.start.date(), r.end.date()) == (date(2026, 10, 25), date(2026, 10, 26))


def test_year_rollover_for_past_month():
    r = parse_date_fr("mercredi 9 avril", today=TODAY)
    assert r.start.date() == date(2027, 4, 9)


def test_recent_past_date_stays_this_year():
    r = parse_date_fr("1er octobre", today=TODAY)
    assert r.start.date() == date(2026, 10, 1)


def test_duration_is_not_a_time():
    assert parse_date_fr("Spectacle 1h30", today=TODAY) is None
    r = parse_date_fr("Durée 1h30 - le 12/11 à 20h", today=TODAY)
    assert r.start == datetime(2026, 11, 12, 20, 0) and r.time_known
    r = parse_date_fr("12 novembre (1h30)", today=TODAY)
    assert r.time_known is False
    assert parse_time_fr("durée : 2h") is None
    assert parse_time_fr("à 20h30") == datetime(2000, 1, 1, 20, 30).time()


def test_time_and_overnight_end():
    r = parse_date_fr("Samedi 1er novembre, de 22h à 2h", today=TODAY)
    assert r.start == datetime(2026, 11, 1, 22, 0)
    assert r.end == datetime(2026, 11, 2, 2, 0)


def test_numeric_and_iso_formats():
    assert parse_date_fr("12/11/2026 20:00", today=TODAY).start == datetime(2026, 11, 12, 20, 0)
    assert parse_date_fr("2026-10-20", today=TODAY).start == datetime(2026, 10, 20)


def test_until_only_has_no_start():
    r = parse_date_fr("jusqu'au 12 janvier", today=TODAY)
    assert r.start is None and r.end == datetime(2027, 1, 12)


def test_no_date():
    assert parse_date_fr("Tous les jours", today=TODAY) is None
    assert parse_date_fr(None) is None


def test_to_fields_utc():
    f = parse_date_fr("le 25 octobre 2026 à 20h30", today=TODAY).to_fields()
    assert f == {"start_date": "2026-10-25T19:30:00+00:00", "end_date": None, "time_known": True}
