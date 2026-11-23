"""Lot D : collecte plus lointaine (Ticketmaster 365 jours, Dice 180 jours), sans appel réel."""
import copy
import json
from datetime import datetime, timedelta, timezone

from tests.conftest import load_fixture

import spiders.dice as dice
import spiders.ticketmaster as tm
from validation import validate

NOW = datetime(2026, 11, 23, 6, 0, tzinfo=timezone.utc)


def _iso(params, key):
    return datetime.strptime(params[key], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


class FakeTM:
    """API Discovery simulée : `total(start, end)` donne totalElements d'une fenêtre ;
    une seule vraie sortie, à J+300, dans la fenêtre qui la contient."""

    def __init__(self, total, event_at=None):
        self.total, self.event_at, self.calls = total, event_at, []
        base = json.loads(load_fixture("ticketmaster_events_synthetic.json"))["_embedded"]["events"][0]
        self.event = copy.deepcopy(base)

    def get_json(self, url, params=None):
        self.calls.append(dict(params))
        start, end = _iso(params, "startDateTime"), _iso(params, "endDateTime")
        n = self.total(start, end)
        events = []
        if self.event_at and start <= self.event_at < end and params["page"] == "0":
            e = copy.deepcopy(self.event)
            e["dates"]["start"].update(dateTime=self.event_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                       localDate=self.event_at.strftime("%Y-%m-%d"), localTime="20:00:00")
            events = [e]
        pages = max(1, -(-min(n, 1000) // tm.PAGE_SIZE))
        return {"_embedded": {"events": events}, "page": {"totalElements": n, "totalPages": pages}}

    def close(self):
        pass


def test_windows_cover_365_days_contiguously():
    w = tm.plan_windows(NOW)
    assert w[0][0] == NOW and w[-1][1] == NOW + timedelta(days=365)
    assert all(a[1] == b[0] for a, b in zip(w, w[1:]))  # sans trou ni chevauchement
    widths = [(e - s).days for s, e in w]
    assert max(widths[:13]) == 7 and max(widths[13:]) == 30
    assert len(w) == 23  # 13 fenêtres jusqu'à J+90, 10 jusqu'à J+365
    assert len(tm.plan_windows(NOW, 90, 7)) == 13  # l'ancien découpage reste possible


def test_fetch_365_days_with_pagination_and_split(monkeypatch):
    monkeypatch.setenv("TICKETMASTER_API_KEY", "test-key")
    dense_until = NOW + timedelta(days=7)

    def total(start, end):
        if start < dense_until:  # première semaine : 1 500 résultats → coupée en deux
            return 1500 if (end - start) > timedelta(days=4) else 600
        return 250  # 2 pages de 200

    far = NOW + timedelta(days=300)
    client = FakeTM(total, event_at=far)
    got = list(tm.fetch_events(client=client, now=NOW))
    # l'API n'est jamais interrogée au-delà de la limite de pagination profonde
    assert all(int(c["size"]) * int(c["page"]) < 1000 for c in client.calls)
    assert max(_iso(c, "endDateTime") for c in client.calls) == NOW + timedelta(days=365)
    # 1 appel coupé + 2 × 3 pages pour la 1re semaine, puis 22 fenêtres × 2 pages
    assert len(client.calls) == 1 + 2 * 3 + 22 * 2
    assert len(client.calls) <= tm.MAX_REQUESTS
    assert [e["source_id"] for e in got] == ["tm-Z698xZ2qZaaaA"]
    assert got[0]["start_date"].startswith(far.strftime("%Y-%m-%d"))
    # une sortie à J+300 passe la validation (limite : 18 mois)
    _, hard, _, _ = validate(got[0], now=NOW)
    assert "too_far_ahead" not in hard


def test_fetch_respects_max_requests(monkeypatch):
    monkeypatch.setenv("TICKETMASTER_API_KEY", "test-key")
    client = FakeTM(lambda s, e: 900)
    list(tm.fetch_events(client=client, now=NOW, max_requests=10))
    assert len(client.calls) == 10


def test_daily_call_budget():
    # deux passages par jour, plafond compris, restent sous le quota de 5 000 appels
    assert 2 * tm.MAX_REQUESTS < 5000
    assert 1 / tm.REQUEST_DELAY < 5  # moins de 5 appels par seconde


class FakeDice:
    def __init__(self, html):
        self.html, self.calls = html, []

    def get_text(self, url, **kw):
        self.calls.append(url)
        return self.html if len(self.calls) == 1 else None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass


def test_dice_keeps_180_days():
    html = load_fixture("dice_browse_paris.html")
    now = datetime(2026, 8, 15, tzinfo=timezone.utc)  # fixture d'octobre à décembre 2026
    kept = list(dice.fetch_events(client=FakeDice(html), now=now))
    old = list(dice.fetch_events(client=FakeDice(html), now=now, days_ahead=60))
    assert dice.DAYS_AHEAD == 180
    limit = now + timedelta(days=180)
    every = dice.parse_browse(html, "concerts")
    assert len(kept) == sum(1 for e in every if datetime.fromisoformat(e["start_date"]) <= limit)
    assert len(old) < len(kept) < len(every)  # 60 j < 180 j < tout
    assert all(datetime.fromisoformat(e["start_date"]) <= limit for e in kept)
    assert any(datetime.fromisoformat(e["start_date"]) > now + timedelta(days=60) for e in kept)
