"""Artist alerts: artist_key, title parsing, source line-ups, ingestion and backfill."""

from datetime import datetime, timedelta, timezone

import pytest

from pipelines.artists_backfill import plan_rows
from pipelines.ingest import ARTISTS_UPSERT_SQL, INSERT_SQL, UPDATE_SQL, artists_params, run_pipeline
from utils.artists import artist_key, extract_artists
from utils.event import make_event
from utils.jsonld import event_from_jsonld
from utils.series import collapse_series


def names(title, category="concerts", **kw):
    return [n for n, _ in extract_artists(title, category, **kw)]


# ── artist_key: same rule as apps/web/src/lib/artists.ts ──

@pytest.mark.parametrize("name,key", [
    ("Beyoncé", "beyonce"),
    ("AC/DC", "ac dc"),
    ("  Dimmu   Borgir ", "dimmu borgir"),
    ("Laÿla", "layla"),
    ("Mikhaïl Pletnev", "mikhail pletnev"),
    ("(Hed) P.E.", "hed p e"),
    ("Blink-182", "blink 182"),
    ("Fontaines D.C.", "fontaines d c"),
    ("Œdipe", "oedipe"),
])
def test_artist_key(name, key):
    assert artist_key(name) == key


def test_artist_key_bounds():
    assert artist_key("A") is None
    assert artist_key("!!") is None
    assert artist_key(None) is None
    assert artist_key("x" * 81) is None
    assert artist_key("x" * 80) == "x" * 80


# ── title parsing (music only) ──

@pytest.mark.parametrize("title,expected", [
    ("WUCAN + Holystone, en concert à Paris", ["WUCAN", "Holystone"]),
    ("Deathchant + special guests : Fangus", ["Deathchant", "Fangus"]),
    ("Behemoth x Dimmu Borgir", ["Behemoth", "Dimmu Borgir"]),
    ("Gavin DeGraw en concert à Paris au Bataclan le 9 octobre 2026", ["Gavin DeGraw"]),
    ("Kanaan, en concert à Paris + guests : Caduta", ["Kanaan", "Caduta"]),
    ("Concert de Metal Symphonique", []),
    ("Jam session", []),
    ("Eagles of Death Metal", ["Eagles of Death Metal"]),
    # more real titles seen in production
    ("Acid Guru + Eclipse + Sour Patch Boyz - Metaxu", ["Acid Guru", "Eclipse", "Sour Patch Boyz"]),
    ("Récital de chant - Matthias Goerne / Mikhaïl Pletnev", ["Matthias Goerne", "Mikhaïl Pletnev"]),
    ("Jam session jazz — Mailo Rakotonanahary", ["Mailo Rakotonanahary"]),
    ("[nouvelle date] - Aloïse Sauvage - La Cigale - Paris", ["Aloïse Sauvage"]),
    ("Dorothée en concert à Paris : nouvelle date en décembre 2026", ["Dorothée"]),
    ("Wobo #48 : Onigow, Bleak, Owvr & Manventail", ["Onigow", "Bleak", "Owvr", "Manventail"]),
    ("Concert: Eluveitie + Pain + Wolfheart", ["Eluveitie", "Pain", "Wolfheart"]),
    ("Nemzzz @ la Cigale", ["Nemzzz"]),
    ("Stanislas à la Cigale", ["Stanislas"]),
    ("Macklemore & Friends", ["Macklemore"]),
    ("Sortie d'album BenArt Ensemble ft. Baptiste Herbin", ["BenArt Ensemble", "Baptiste Herbin"]),
    ("Concert de Maria del Mar Bonet à L'Olympia", ["Maria del Mar Bonet"]),
    ("Frank Braley, piano : Beethoven, Dvorak & Korngold", ["Frank Braley"]),
    ("Laÿla — Release Party douces nuits", ["Laÿla"]),
    ("Wajdi Riahi Trio #Marathonjazz", ["Wajdi Riahi Trio"]),
    ("Les Quatre Saisons de Vivaldi", []),
    ("Verdi : Requiem", []),
    ("Concert du Nouvel An", []),
    ("Lil Peep 30TH Birthday Celebration", []),
    ("Grand concert choral international à l'Église de la Madeleine. Entrée libre", []),
    ("Dans le sillage de l'orient - Syrie", []),
    ("Orchestre de chambre de Paris / Thomas Hengelbrock / Eva Zaïcik", ["Thomas Hengelbrock", "Eva Zaïcik"]),
    # "et": two artists when both sides are full names, one duo name otherwise
    ("Kayhan Kalhor et Kiya Tabassian", ["Kayhan Kalhor", "Kiya Tabassian"]),
    ("Mike et Riké, Manu et Guizmo, HK et Vanupié", ["Mike et Riké", "Manu et Guizmo", "HK et Vanupié"]),
    ("Scala and Kolacny Brothers - Scala 30", ["Scala and Kolacny Brothers"]),
    ("Leslie Odom, JR.", ["Leslie Odom JR."]),
    ("Baile Brasil Spécial Festa Na Favela (Samba+DJS)", []),
    ("Igor Levit piano", ["Igor Levit"]),
    ("Muse en concert à La Défense Arena : qui va assurer la première partie ?", ["Muse"]),
    ("Kiosque en fête au Square Monseigneur Maillet", []),
])
def test_title_parsing(title, expected):
    assert names(title) == expected


def test_title_origin_and_music_only():
    assert extract_artists("Behemoth x Dimmu Borgir", "soirees") == [
        ("Behemoth", "title"), ("Dimmu Borgir", "title")]
    assert extract_artists("Behemoth x Dimmu Borgir", "festivals")
    assert extract_artists("Behemoth x Dimmu Borgir", "theatre") == []
    assert extract_artists("Behemoth x Dimmu Borgir", None) == []


def test_venue_name_is_not_an_artist():
    assert names("Lost + Badaboum", venue_name="Badaboum") == ["Lost"]


# ── source line-ups ──

def test_source_artists_first_and_cleaned():
    got = extract_artists("Clash Pop - les Classiques", "concerts",
                          artists=["Charlie Winston", "charlie winston", "No Information", "TBA", "Olympia"],
                          venue_name="Olympia")
    assert got == [("Charlie Winston", "source")]  # deduplicated by key; title not parsed


def test_source_artists_any_category():
    assert extract_artists("Maître Mô", "theatre", artists=["Hilaire Besse"]) == [("Hilaire Besse", "source")]


def test_source_placeholders_only_fall_back_to_title():
    assert extract_artists("Behemoth x Dimmu Borgir", "concerts", artists=["No Information"]) == [
        ("Behemoth", "title"), ("Dimmu Borgir", "title")]


def test_make_event_artists_and_on_sale():
    ev = make_event(source="t", source_id="1", title="X", start="2026-11-20T20:00:00",
                    artists=["Behemoth", " Behemoth ", "", None], on_sale_at="2026-10-15T08:00:00Z")
    assert ev["artists"] == ["Behemoth"]
    assert ev["on_sale_at"] == "2026-10-15T08:00:00+00:00"
    plain = make_event(source="t", source_id="2", title="X", start="2026-11-20T20:00:00")
    assert plain["artists"] == [] and plain["on_sale_at"] is None


def test_jsonld_performers_nested_lists():
    obj = {"@type": "Event", "name": "Laure Briard", "startDate": "2026-10-20T20:00",
           "location": {"@type": "Place", "name": "Les Trois Baudets"},
           "performer": [[{"@type": "PerformingGroup", "name": "Laure Briard"}], {"name": "Boogarins"}]}
    ev = event_from_jsonld(obj, source="venue_x")
    assert ev["artists"] == ["Laure Briard", "Boogarins"]


def test_series_keeps_artists_and_earliest_future_on_sale():
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=3)).isoformat()
    later = (now + timedelta(days=9)).isoformat()
    past = (now - timedelta(days=2)).isoformat()

    def ev(i, on_sale, artists):
        start = (now + timedelta(days=20 + i)).replace(microsecond=0).isoformat()
        return {"source": "s", "source_id": str(i), "title": "Show", "venue_name": "V",
                "start_date": start, "end_date": None, "time_known": True,
                "on_sale_at": on_sale, "artists": artists}

    (row,) = collapse_series([ev(0, past, ["A"]), ev(1, later, ["A"]), ev(2, soon, ["B"]), ev(3, None, [])], "s")
    assert row["artists"] == ["A", "B"]
    assert row["on_sale_at"] == soon
    (row,) = collapse_series([ev(i, past, []) for i in range(4)], "s")
    assert row["on_sale_at"] == past and row["artists"] == []


# ── Ticketmaster ──

def test_ticketmaster_attractions_are_artists_not_genres():
    import spiders.ticketmaster as tm

    e = {
        "id": "X1", "name": "Behemoth & Dimmu Borgir",
        "dates": {"start": {"dateTime": "2026-11-20T19:00:00Z"}, "status": {"code": "onsale"}},
        "classifications": [{"primary": True, "segment": {"name": "Music"}, "genre": {"name": "Metal"}}],
        "sales": {"public": {"startDateTime": "2099-01-10T09:00:00Z", "startTBD": False}},
        "_embedded": {
            "venues": [{"name": "Zénith Paris", "postalCode": "75019",
                        "location": {"latitude": "48.8944", "longitude": "2.3933"}}],
            "attractions": [{"name": "Behemoth"}, {"name": "Dimmu Borgir"}],
        },
    }
    ev = tm.event_from_tm(e)
    assert ev["artists"] == ["Behemoth", "Dimmu Borgir"]
    assert "Metal" in ev["tags_raw"] and "Metal" not in ev["artists"]
    assert ev["on_sale_at"] == "2099-01-10T09:00:00+00:00"


def test_ticketmaster_on_sale_window():
    import spiders.ticketmaster as tm

    now = datetime(2026, 10, 11, tzinfo=timezone.utc)

    def sale(raw, **kw):
        return {"sales": {"public": {"startDateTime": raw, **kw}}}

    assert tm.on_sale_at(sale("2026-10-15T08:00:00Z"), now) == "2026-10-15T08:00:00+00:00"
    assert tm.on_sale_at(sale("2026-10-08T08:00:00Z"), now) == "2026-10-08T08:00:00+00:00"  # recent
    assert tm.on_sale_at(sale("2026-06-01T08:00:00Z"), now) is None  # long open
    assert tm.on_sale_at(sale("2026-10-15T08:00:00Z", startTBD=True), now) is None
    assert tm.on_sale_at({}, now) is None
    assert tm.on_sale_at(sale("bogus"), now) is None


# ── ingestion ──

def test_sql_carries_on_sale_at():
    assert "on_sale_at" in INSERT_SQL and "%(on_sale_at)s" in INSERT_SQL
    assert "on_sale_at = COALESCE(%(on_sale_at)s::timestamptz, on_sale_at)" in UPDATE_SQL
    assert "ON CONFLICT (event_id, artist_key)" in ARTISTS_UPSERT_SQL


def test_artists_params_replace_updates_insert_new():
    planned = [
        {"id": "u1", "source": "s", "source_id": "1", "artists": [("Behemoth", "source"), ("BEHEMOTH", "title")]},
        {"id": "u2", "source": "s", "source_id": "2", "artists": []},  # artists removed → all deleted
        {"source": "s", "source_id": "3", "artists": [("Kanaan", "title")]},  # new row
        {"id": "pending", "source": "s", "source_id": "1", "artists": [("X", "title")]},
    ]
    delete_p, up = artists_params(planned)
    assert delete_p == {"ids": ["u1", "u2"], "keep_ids": ["u1"], "keep_keys": ["behemoth"]}
    assert up["source_ids"] == ["1", "3"] and up["keys"] == ["behemoth", "kanaan"]
    assert up["origins"] == ["source", "title"]
    assert artists_params([{"source": "s", "source_id": "9", "artists": []}]) is None


def test_run_pipeline_writes_artists_in_one_batch():
    from tests.test_pipeline_units import FakeConn

    soon = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%dT20:00:00")

    def ev(sid, title, **kw):
        return make_event(source="test", source_id=sid, title=title, start=soon, venue_name="Le Bal",
                          venue_zip="75018", price_raw="10 €", category_slug="concerts", **kw)

    conn = FakeConn()
    stats = run_pipeline([
        ev("a", "WUCAN + Holystone, en concert à Paris"),
        ev("b", "Behemoth x Dimmu Borgir", artists=["Behemoth"], on_sale_at="2026-12-01T09:00:00Z"),
        ev("exists", "Jam session"),
    ], "test", conn=conn)
    assert stats["errors"] == 0
    artist_statements = [s for s in conn.log if "event_artists" in s]
    assert len(artist_statements) == 2  # one DELETE (updated rows) + one INSERT for the whole batch
    inserted = {p["source_id"]: p for p in conn.inserted}
    assert inserted["b"]["on_sale_at"] == datetime(2026, 12, 1, 9, tzinfo=timezone.utc)
    assert inserted["a"]["artists"] == [("WUCAN", "title"), ("Holystone", "title")]
    assert inserted["b"]["artists"] == [("Behemoth", "source")]


# ── backfill ──

def test_backfill_plan_rows():
    rows = plan_rows([
        ("e1", "Behemoth x Dimmu Borgir", "concerts", "Zénith Paris"),
        ("e2", "Jam session", "concerts", None),
        ("e3", "Kanaan, en concert à Paris + guests : Caduta", "soirees", None),
    ])
    assert rows == {"ids": ["e1", "e1", "e3", "e3"],
                    "keys": ["behemoth", "dimmu borgir", "kanaan", "caduta"],
                    "names": ["Behemoth", "Dimmu Borgir", "Kanaan", "Caduta"]}
