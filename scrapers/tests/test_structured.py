"""Generic JSON-LD / ICS readers (utils/jsonld.py, utils/ics.py) on inline samples."""

from tests.helpers import assert_valid_event
from utils.ics import events_from_ics
from utils.jsonld import events_from_html

HTML = """
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"MusicEvent","name":"Orchestre de Paris &amp; Klaus M&auml;kel&auml;",
  "startDate":"2026-11-05T20:00:00+01:00","endDate":"2026-11-05T22:00:00+01:00",
  "url":"/concerts/omp-2026-11-05",
  "image":[{"@type":"ImageObject","url":"https://cdn.example.org/omp.jpg"}],
  "description":"<p>Mahler, Symphonie n°5</p>",
  "eventStatus":"https://schema.org/EventScheduled",
  "location":{"@type":"Place","name":"Philharmonie de Paris","address":{"@type":"PostalAddress",
    "streetAddress":"221 avenue Jean-Jaurès","postalCode":"75019","addressLocality":"Paris"},
    "geo":{"latitude":48.8919,"longitude":2.3936}},
  "offers":{"@type":"AggregateOffer","lowPrice":"10","highPrice":"80","priceCurrency":"EUR",
    "url":"https://billetterie.example.org/omp"}},
 {"@type":"TheaterEvent","name":"Annulé : Hamlet","startDate":"2026-11-06",
  "eventStatus":"https://schema.org/EventCancelled","location":{"@type":"Place","name":"Odéon"}},
 {"@type":"Event","name":"Webinar","startDate":"2026-11-07T18:00",
  "eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode",
  "location":{"@type":"VirtualLocation","url":"https://zoom.us/x"}},
 {"@type":"Organization","name":"Not an event"}
]}
</script></head><body></body></html>
"""


def test_jsonld_events():
    evs = events_from_html(HTML, source="venue_test", base_url="https://www.example.org/agenda")
    assert len(evs) == 3
    for ev in evs:
        assert_valid_event(ev)
    omp, hamlet, webinar = evs
    assert omp["title"] == "Orchestre de Paris & Klaus Mäkelä"
    assert omp["start_date"] == "2026-11-05T19:00:00+00:00" and omp["time_known"]
    assert omp["price_min"] == 1000 and omp["price_max"] == 8000 and omp["price_status"] == "paid"
    assert omp["source_url"] == "https://www.example.org/concerts/omp-2026-11-05"
    assert omp["booking_url"] == "https://billetterie.example.org/omp"
    assert omp["venue_zip"] == "75019" and omp["venue_arrondissement"] == "19e"
    assert omp["category_slug"] == "concerts"
    assert omp["description"] == "Mahler, Symphonie n°5"
    assert hamlet["event_status"] == "cancelled" and hamlet["time_known"] is False
    assert hamlet["category_slug"] == "theatre"
    assert webinar["is_online"] is True


ICS = """BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:abc-123@example.org\r
DTSTART;TZID=Europe/Paris:20261112T203000\r
DTEND;TZID=Europe/Paris:20261112T223000\r
SUMMARY:Lecture : po\\, ésie\\; et musique\r
DESCRIPTION:Une soirée de lecture avec des poètes contemporains\\nEntrée libre\r
LOCATION:Maison de la Poésie\\, 157 rue Saint-Martin\\, 75003 Paris\r
URL:https://example.org/e/abc\r
BEGIN:VALARM\r
DESCRIPTION:ignored\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:allday@example.org\r
DTSTART;VALUE=DATE:20261201\r
DTEND;VALUE=DATE:20261224\r
SUMMARY:Marché de Noël des créateurs\r
STATUS:CANCELLED\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:utc@example.org\r
DTSTART:20261113T190000Z\r
SUMMARY:Rencontre avec une auteure très attendue\r
DESCRIPTION:Long\r
 ue description pliée\r
END:VEVENT\r
END:VCALENDAR\r
"""


def test_ics_events():
    evs = events_from_ics(ICS, source="venue_test", default_venue={"venue_zip": "75003"})
    assert len(evs) == 3
    for ev in evs:
        assert_valid_event(ev)
    lecture, marche, rencontre = evs
    assert lecture["title"] == "Lecture : po, ésie; et musique"
    assert lecture["start_date"] == "2026-11-12T19:30:00+00:00"
    assert lecture["venue_name"] == "Maison de la Poésie"
    assert lecture["price_status"] == "unknown"  # never guessed from free text
    assert marche["time_known"] is False and marche["event_status"] == "cancelled"
    assert marche["end_date"].startswith("2026-12-23")  # exclusive DTEND
    assert rencontre["start_date"] == "2026-11-13T19:00:00+00:00"
    assert rencontre["description"] == "Longue description pliée"
