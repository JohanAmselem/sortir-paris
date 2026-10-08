"""Pipeline units that do not need a database (fake cursor for the SQL flow)."""

from datetime import datetime, timezone

from pipelines.ingest import compute_status, drop_placeholder_images, run_pipeline
from pipelines.meili import SETTINGS, build_document
from utils.event import make_event
from utils.geocode import pick_feature


def test_drop_placeholder_images():
    evs = [
        {"title": "Muse", "image_url": "muse.jpg"},
        {"title": "Muse", "image_url": "muse.jpg"},
        {"title": "Daft Punk", "image_url": "muse.jpg"},
        {"title": "Justice", "image_url": "muse.jpg"},
        {"title": "Air", "image_url": "air.jpg"},
    ]
    assert drop_placeholder_images(evs) == 4
    assert [e["image_url"] for e in evs] == [None, None, None, None, "air.jpg"]


def test_compute_status():
    assert compute_status({"found": 0}, False) == "failed"
    assert compute_status({"found": 10, "new": 0, "updated": 0}, False) == "failed"
    assert compute_status({"found": 10, "new": 3, "updated": 2, "errors": 1}, False) == "partial"
    assert compute_status({"found": 10, "new": 3, "updated": 7, "errors": 0}, False) == "success"


def test_build_document_shape():
    row = {
        "id": "u1", "title": "T", "slug": "t", "short_desc": None, "description": "x" * 900,
        "image_url": None, "start_date": datetime(2026, 10, 20, 19, tzinfo=timezone.utc),
        "end_date": None, "time_known": False, "price_min": 0, "price_max": 0,
        "price_status": "unknown", "is_free": False, "keywords": "jazz", "quality_score": 70,
        "category_slug": "concerts", "category_name": "Concerts", "venue_name": "V",
        "venue_slug": "v", "arrondissement": "1er", "lat": 48.86, "lng": 2.35, "tags": ["jazz"],
    }
    doc = build_document(row)
    assert set(doc) == {
        "id", "title", "slug", "shortDesc", "description", "imageUrl", "startDate", "endDate",
        "timeKnown", "priceMin", "priceMax", "priceStatus", "isFree", "categorySlug", "categoryName",
        "venueName", "venueSlug", "arrondissement", "lat", "lng", "_geo", "keywords", "tags",
        "qualityScore",
    }
    assert len(doc["description"]) == 500
    assert doc["startDate"] == 1792522800 and doc["endDate"] is None
    assert doc["_geo"] == {"lat": 48.86, "lng": 2.35}
    assert set(SETTINGS["filterableAttributes"]) >= {
        "categorySlug", "arrondissement", "isFree", "priceStatus", "startDate", "endDate", "_geo"}


def test_pick_feature_rejects_municipality_and_low_score():
    def feat(t, score, lat=48.87, lng=2.35, pc="75010", city="Paris"):
        return {"geometry": {"coordinates": [lng, lat]},
                "properties": {"type": t, "score": score, "postcode": pc, "city": city}}

    assert pick_feature({"features": [feat("municipality", 0.95)]}) is None
    assert pick_feature({"features": [feat("housenumber", 0.4)]}) is None
    assert pick_feature({"features": [feat("housenumber", 0.9, lat=49.44, lng=1.09, pc="76000", city="Rouen")]}) is None
    res = pick_feature({"features": [feat("municipality", 0.99), feat("housenumber", 0.8, pc="75010")]})
    assert res["arrondissement"] == "10e" and res["city"] == "Paris"
    res = pick_feature({"features": [feat("street", 0.7, lat=48.90, lng=2.26, pc="92400", city="Courbevoie")]})
    assert res["city"] == "Courbevoie" and res["arrondissement"] is None


# ── fake DB: exercises run_pipeline's SAVEPOINT flow without Postgres ──

class FakeCursor:
    def __init__(self, db):
        self.db = db
        self._result = []

    def execute(self, sql, params=None):
        s = " ".join(sql.split())
        self.db.log.append(s[:40])
        if s.startswith("SELECT slug, id FROM categories"):
            self._result = [("concerts", "cat-1")]
        elif s.startswith("SELECT id FROM events WHERE source"):
            self._result = [("ev-existing",)] if params[1] == "exists" else []
        elif s.startswith("SELECT id, canonical_venue_id, lat FROM venues"):
            self._result = []
        elif s.startswith("INSERT INTO venues"):
            self._result = [("venue-1",)]
        elif s.startswith("SELECT 1 FROM events WHERE slug"):
            self._result = []
        elif s.startswith("INSERT INTO events"):
            if "boom" in params["title"].lower():
                raise RuntimeError("simulated constraint violation")
            self.db.inserted.append(params)
            self._result = [("new-id",)]
        elif s.startswith("UPDATE events SET"):
            self.db.updated.append(params)
            self._result = []
        else:
            self._result = []

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return list(self._result)

    def close(self):
        pass


class FakeConn:
    def __init__(self):
        self.log, self.inserted, self.updated = [], [], []
        self.autocommit = True
        self.commits = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1


def test_run_pipeline_isolates_failures(monkeypatch):
    def ev(sid, title, start):
        return make_event(source="test", source_id=sid, title=title, start=start,
                          venue_name="Le Bal", venue_zip="75018", price_raw="10 €",
                          category_slug="concerts")

    from datetime import timedelta

    soon = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%dT20:00:00")
    events = [
        ev("a", "Premier concert du soir", soon),
        ev("b", "Boom concert qui casse", soon),
        ev("exists", "Concert déjà connu", soon),
        ev("c", "Concert passé depuis longtemps", "2020-01-01T20:00:00"),
        {"source": "test", "source_id": "d", "title": ""},
    ]
    conn = FakeConn()
    stats = run_pipeline(events, "test", conn=conn)
    assert stats["new"] == 1 and stats["updated"] == 1 and stats["errors"] == 1
    assert stats["skipped"] == 1 and stats["rejected"] == 1
    assert "simulated" in stats["error_list"][0]
    assert any(s.startswith("ROLLBACK TO SAVEPOINT") for s in conn.log)
    new = conn.inserted[0]
    assert new["price_min"] == 1000 and new["price_status"] == "paid"
    assert new["category_id"] == "cat-1" and new["venue_id"] == "venue-1"
    assert new["status"] in ("active", "draft")
    assert conn.updated[0]["id"] == "ev-existing"


class StrictConn(FakeConn):
    """Behaves like psycopg2: autocommit cannot change inside a transaction."""

    def __init__(self):
        super().__init__()
        self._autocommit = False
        self.in_tx = True  # e.g. a SELECT was just run by the caller

    @property
    def autocommit(self):
        return self._autocommit

    @autocommit.setter
    def autocommit(self, value):
        if getattr(self, "in_tx", False):
            raise RuntimeError("set_session cannot be used inside a transaction")
        self._autocommit = value

    def rollback(self):
        self.in_tx = False


def test_run_pipeline_accepts_connection_with_open_transaction():
    from datetime import timedelta

    soon = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%dT20:00:00")
    ev = make_event(source="test", source_id="tx1", title="Concert sous transaction", start=soon,
                    venue_name="Le Bal", venue_zip="75018", price_raw="10 €", category_slug="concerts")
    conn = StrictConn()
    stats = run_pipeline([ev], "test", conn=conn)  # used to raise / store 0 events
    assert stats["errors"] == 0
