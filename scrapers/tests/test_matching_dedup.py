from datetime import datetime, timezone

from pipelines.dedup import choose_canonical, find_duplicates, is_duplicate
from utils.matching import (
    dedup_title,
    haversine_m,
    normalize_address,
    normalize_venue_name,
    trigram_similarity,
)


def test_normalize_venue_name():
    assert normalize_venue_name("Le Grand Rex") == "grand rex"
    assert normalize_venue_name("LE GRAND REX - Paris") == "grand rex"
    assert normalize_venue_name("Théâtre de la Ville") == "theatre ville"
    assert normalize_venue_name("La Cigale") == normalize_venue_name("cigale (la)")
    assert normalize_venue_name("Sunset & Sunside") == "sunset sunside"
    assert normalize_venue_name("New Morning Paris 10e") == "new morning"
    assert normalize_venue_name("Paris") == "paris"  # never empty


def test_normalize_address():
    assert normalize_address("12 bd de la Villette, 75019 Paris") == "12 boulevard villette"
    assert normalize_address("12, Boulevard de la Villette") == "12 boulevard villette"
    assert normalize_address("7-9 r. des Petites-Écuries") == normalize_address("7-9 rue des Petites Ecuries")


def test_trigram_similarity_matches_pg_trgm_semantics():
    assert trigram_similarity("word", "word") == 1.0
    assert trigram_similarity("", "word") == 0.0
    # pg_trgm: similarity('word', 'two words') = 0.363636
    assert abs(trigram_similarity("word", "two words") - 4 / 11) < 1e-6


def test_haversine():
    d = haversine_m(48.8584, 2.2945, 48.8606, 2.3376)  # Eiffel → Louvre ≈ 3.2 km
    assert 3000 < d < 3400


def test_dedup_title():
    assert dedup_title("CONCERT : Ibrahim Maalouf (Complet) - Paris 2026") == "ibrahim maalouf"
    assert dedup_title("Ibrahim Maalouf + guest") == "ibrahim maalouf"


def row(id, source, title, start, venue="v1", lat=48.86, lng=2.35, end=None, q=80, status="active",
        created=datetime(2026, 1, 1, tzinfo=timezone.utc)):
    return {"id": id, "source": source, "title": title, "start_date": start, "end_date": end,
            "canonical_venue": venue, "lat": lat, "lng": lng, "quality_score": q,
            "status": status, "created_at": created}


S = datetime(2026, 10, 20, 19, 0, tzinfo=timezone.utc)


def test_is_duplicate_rules():
    a = row("a", "fnacspectacles", "Ibrahim Maalouf", S)
    b = row("b", "infoconcert", "IBRAHIM MAALOUF en concert", datetime(2026, 10, 20, 18, 30, tzinfo=timezone.utc))
    assert is_duplicate(a, b)
    # same source never merged (recurring shows)
    assert not is_duplicate(a, row("c", "fnacspectacles", "Ibrahim Maalouf", S))
    # different Paris day
    assert not is_duplicate(a, row("d", "infoconcert", "Ibrahim Maalouf", datetime(2026, 10, 21, 19, 0, tzinfo=timezone.utc)))
    # different venue far away
    assert not is_duplicate(a, row("e", "infoconcert", "Ibrahim Maalouf", S, venue="v2", lat=48.83, lng=2.38))
    # different venue id but < 150 m
    assert is_duplicate(a, row("f", "infoconcert", "Ibrahim Maalouf", S, venue="v3", lat=48.8605, lng=2.3505))
    # different title
    assert not is_duplicate(a, row("g", "infoconcert", "Thomas Dutronc", S))


def test_paris_day_not_utc_day():
    # 23:30 Paris on the 20th = 21:30 UTC; 00:30 Paris on the 21st = 22:30 UTC on the 20th
    a = row("a", "x", "Soirée électro Concrete", datetime(2026, 10, 20, 21, 30, tzinfo=timezone.utc))
    b = row("b", "y", "Soirée électro Concrete", datetime(2026, 10, 20, 22, 30, tzinfo=timezone.utc))
    assert not is_duplicate(a, b)


def test_overlapping_exhibitions():
    a = row("a", "parismusees", "Exposition Hokusai", datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
            end=datetime(2027, 1, 10, 22, 0, tzinfo=timezone.utc))
    b = row("b", "sortiraparis", "Hokusai", datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc),
            end=datetime(2026, 12, 31, 22, 0, tzinfo=timezone.utc))
    assert is_duplicate(a, b)


def test_choose_canonical():
    official = row("a", "venue_philharmonie", "X", S, q=60)
    aggregator = row("b", "billetreduc", "X", S, q=95)
    assert choose_canonical(official, aggregator)[0]["id"] == "a"
    assert choose_canonical(aggregator, official)[0]["id"] == "a"
    # active beats draft whatever the source
    draft_official = row("c", "paris_opendata", "X", S, status="draft")
    assert choose_canonical(draft_official, aggregator)[0]["id"] == "b"
    # same priority → higher quality
    assert choose_canonical(row("d", "dice", "X", S, q=50), row("e", "shotgun", "X", S, q=70))[0]["id"] == "e"


def test_find_duplicates_groups_to_single_canonical():
    rows = [
        row("a", "paris_opendata", "Ibrahim Maalouf", S),
        row("b", "infoconcert", "Ibrahim Maalouf (complet)", S),
        row("c", "fnacspectacles", "IBRAHIM MAALOUF", S, venue="vX", lat=48.8601, lng=2.3502),
        row("d", "infoconcert", "Autre concert", S),
    ]
    assert find_duplicates(rows) == {"b": "a", "c": "a"}


# ── Lot 1: venue rows not linked/geocoded yet, date suffixes, series ──

def vrow(id, source, title, start, venue_id, venue_name, zip_code=None, time_known=True, **kw):
    r = row(id, source, title, start, venue=venue_id, lat=None, lng=None, **kw)
    r.update(venue_name=venue_name, zip_code=zip_code, time_known=time_known)
    return r


def test_dedup_title_strips_dates_and_editorial_tails():
    assert dedup_title("Jeanne Lee par Äulne – 09/10/2026 - 17:30") == dedup_title("Jeanne Lee par Äulne")
    assert dedup_title("09.OCT | PARIS | Fakear") == "fakear"
    assert dedup_title("Fakear en concert à Paris au Bataclan le 9 octobre 2026") == "fakear"


def test_duplicate_through_compatible_venue_names():
    a = vrow("a", "ticketmaster", "Fakear", S, "v1", "La Seine Musicale", "92100")
    b = vrow("b", "sortiraparis", "FAKEAR", S, "v2", "Seine Musicale", None)
    assert is_duplicate(a, b)
    # 2 h apart: another session
    late = vrow("c", "sortiraparis", "Fakear", datetime(2026, 10, 20, 21, 0, tzinfo=timezone.utc),
                "v2", "Seine Musicale")
    assert not is_duplicate(a, late)
    # one time unknown: same day is enough
    unknown = vrow("d", "sortiraparis", "Fakear", datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc),
                   "v2", "Seine Musicale", time_known=False)
    assert is_duplicate(a, unknown)
    # postcodes differ → different places
    assert not is_duplicate(a, vrow("e", "sortiraparis", "Fakear", S, "v3", "Seine Musicale", "75011"))
    # names not compatible (another hall)
    assert not is_duplicate(a, vrow("f", "sortiraparis", "Fakear", S, "v4", "La Seine Musicale - Auditorium"))
    # weaker title similarity is not enough without a shared venue
    assert not is_duplicate(a, vrow("g", "sortiraparis", "Fakear & friends : soirée spéciale", S, "v2",
                                    "Seine Musicale"))


def test_find_duplicates_uses_venue_name_buckets():
    rows = [
        vrow("a", "venue_38riv", "Jeanne Lee par Äulne – 09/10/2026 - 17:30", S, "v1", "38Riv", "75004"),
        vrow("b", "parisjazzclub", "Jeanne Lee Par Äulne", S, "v2", "38 RIV - Jazz Club & Bar", None),
    ]
    assert find_duplicates(rows) == {"b": "a"}


def test_series_row_is_canonical_over_single_sessions():
    run = row("s", "venue_chatelet", "Les Misérables", datetime(2026, 10, 9, 18, 0, tzinfo=timezone.utc),
              end=datetime(2027, 1, 10, 22, 0, tzinfo=timezone.utc), q=60)
    d1 = row("t1", "ticketmaster", "Les Misérables", datetime(2026, 10, 12, 18, 0, tzinfo=timezone.utc), q=90)
    d2 = row("t2", "ticketmaster", "Les Misérables", datetime(2026, 10, 13, 18, 0, tzinfo=timezone.utc), q=90)
    assert find_duplicates([run, d1, d2]) == {"t1": "s", "t2": "s"}
