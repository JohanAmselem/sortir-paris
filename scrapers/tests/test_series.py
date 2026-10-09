"""utils/series.py + the post steps that go with it (pipelines/maintenance.py)."""

from datetime import datetime, timedelta, timezone

from pipelines.maintenance import collapsed_session_ids, reclassify_plan
from utils.event import make_event
from utils.series import NO_SERIES_SOURCES, collapse_series, is_series_id


def ev(i, day, hour=20, title="Les Misérables", venue="Théâtre du Châtelet", source="venue_chatelet",
       status="scheduled", minute=0):
    return make_event(source=source, source_id=f"{source}-{i}", title=title,
                      start=f"2026-10-{day:02d}T{hour:02d}:{minute:02d}:00", venue_name=venue,
                      event_status=status)


def test_collapse_same_title_same_venue():
    sessions = [ev(i, 10 + i) for i in range(6)]
    other = [ev(100, 12, title="Concert unique")]
    out = collapse_series(sessions + other, "venue_chatelet")
    assert len(out) == 2
    s = next(e for e in out if is_series_id(e["source_id"]))
    assert s["source_id"].startswith("venue_chatelet-series-")
    assert s["start_date"] == sessions[0]["start_date"] and s["end_date"] == sessions[-1]["start_date"]
    assert s["time_known"] is True  # always 20:00 Paris
    assert s["series_sessions"] == 6
    # stable id across runs, even when the first session has passed
    again = collapse_series(sessions[1:], "venue_chatelet")
    assert next(e for e in again if is_series_id(e["source_id"]))["source_id"] == s["source_id"]


def test_times_differ_or_unknown_means_time_unknown():
    sessions = [ev(i, 10 + i, hour=15 if i % 2 else 20) for i in range(4)]
    s = collapse_series(sessions, "x")[0]
    assert s["time_known"] is False


def test_fewer_than_four_sessions_untouched_and_titles_with_dates_grouped():
    three = [ev(i, 10 + i) for i in range(3)]
    assert collapse_series(three, "x") == three
    dated = [ev(i, 10 + i, title=f"Yoni – {10 + i:02d}/10/2026 - 20:00", venue="Théâtre de Belleville",
                source="venue_theatrebelleville") for i in range(5)]
    assert len(collapse_series(dated, "venue_theatrebelleville")) == 1


def test_cancelled_sessions_do_not_count_and_venue_required():
    sessions = [ev(i, 10 + i) for i in range(3)] + [ev(9, 20, status="cancelled")]
    assert len(collapse_series(sessions, "x")) == 4  # only 3 live sessions
    no_venue = [ev(i, 10 + i, venue=None) for i in range(5)]
    assert len(collapse_series(no_venue, "x")) == 5


def test_cinema_sources_keep_one_row_per_seance():
    seances = [ev(i, 10 + i, source="allocine", venue="MK2 Bibliothèque", title="Dune") for i in range(8)]
    for src in ("allocine", "cinematheque", "forumdesimages"):
        assert src in NO_SERIES_SOURCES
        assert len(collapse_series(seances, src)) == 8


def _row(id, source_id, start, end=None, title="Les Misérables", venue="v1", source="venue_chatelet"):
    return {"id": id, "source": source, "source_id": source_id, "title": title, "venue": venue,
            "start_date": start, "end_date": end}


def test_collapsed_session_ids():
    t0 = datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc)
    rows = [
        _row("s", "venue_chatelet-series-abc", t0, t0 + timedelta(days=30)),
        _row("d1", "venue_chatelet-1", t0),
        _row("d2", "venue_chatelet-2", t0 + timedelta(days=3), title="LES MISÉRABLES – 13/10/2026 - 20:00"),
        _row("late", "venue_chatelet-3", t0 + timedelta(days=60)),  # after the series: kept
        _row("other-venue", "venue_chatelet-4", t0, venue="v2"),
        _row("other-source", "ticketmaster-5", t0, source="ticketmaster"),
        _row("other-title", "venue_chatelet-6", t0, title="Starmania"),
    ]
    assert sorted(collapsed_session_ids(rows)) == ["d1", "d2"]


def test_reclassify_plan():
    rows = [
        {"id": 1, "title": "Yoga au parc", "description": None, "slug": None},
        {"id": 2, "title": "Blind test années 80", "description": None, "slug": "concerts"},
        {"id": 3, "title": "Concert de jazz", "description": None, "slug": "concerts"},
        {"id": 4, "title": "Soirée karaoké", "description": None, "slug": None},
        {"id": 5, "title": "Sans indice", "description": None, "slug": None},
    ]
    known = {"concerts", "sport", "ateliers"}  # 'soirees' not migrated yet
    assert reclassify_plan(rows, known) == {"1": "sport"}
    assert reclassify_plan(rows, known | {"soirees"}) == {"1": "sport", "2": "soirees", "4": "soirees"}
