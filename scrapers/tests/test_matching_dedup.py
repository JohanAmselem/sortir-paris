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
