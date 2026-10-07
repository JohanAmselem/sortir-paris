import pytest

from utils.normalize import (
    arrondissement_from_zip,
    clean_text,
    detect_category,
    parse_price_fr,
    price_from_numbers,
    price_from_offers,
    to_centimes,
)


def P(status, lo=0, hi=0):
    return {"price_min": lo, "price_max": hi, "is_free": status == "free", "price_status": status}


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Gratuit", P("free")),
        ("Entrée libre", P("free")),
        ("entrée libre dans la limite des places disponibles", P("free")),
        ("10€", P("paid", 1000, 1000)),
        ("0 €", P("free")),
        ("Free Jazz 15€", P("paid", 1500, 1500)),  # "free" inside a name is not "free"
        ("Free Jazz", P("unknown")),
        ("gratuit pour les -26 ans, 12€", P("paid", 0, 1200)),
        ("à partir de 15€", P("paid", 1500, 1500)),
        ("Plein 25€ / réduit 18€", P("paid", 1800, 2500)),
        ("de 3 à 12 ans", P("unknown")),  # ages are not prices
        ("Le 25 et 26 octobre", P("unknown")),  # dates are not prices
        ("19,99 €", P("paid", 1999, 1999)),  # no float rounding (was 1998)
        ("12 à 25 euros", P("paid", 1200, 2500)),
        ("€15", P("paid", 1500, 1500)),
        ("", P("unknown")),
        (None, P("unknown")),  # missing price is unknown, never free
    ],
)
def test_parse_price_fr(raw, expected):
    assert parse_price_fr(raw) == expected


def test_ten_euros_is_not_free():
    assert parse_price_fr("Tarif unique 10 €")["is_free"] is False


def test_to_centimes_exact():
    assert to_centimes("19,99") == 1999
    assert to_centimes(19.99) == 1999
    assert to_centimes("0.1") == 10
    assert to_centimes(None) is None


def test_price_from_numbers_and_offers():
    assert price_from_numbers(25) == P("paid", 2500, 2500)  # integer euros → centimes
    assert price_from_numbers(0) == P("free")
    assert price_from_numbers(None) == P("unknown")
    assert price_from_numbers(30, 12) == P("paid", 1200, 3000)
    agg = {"@type": "AggregateOffer", "lowPrice": "22.5", "highPrice": "48", "priceCurrency": "EUR"}
    assert price_from_offers(agg) == P("paid", 2250, 4800)
    assert price_from_offers([{"price": "0", "priceCurrency": "EUR"}]) == P("free")
    assert price_from_offers([{"price": "30", "priceCurrency": "USD"}]) == P("unknown")
    assert price_from_offers(None) == P("unknown")


def test_clean_text_no_glued_words():
    assert clean_text("<p>Hello</p><p>World</p>") == "Hello World"
    assert clean_text("line1<br>line2") == "line1 line2"
    assert clean_text("Caf&eacute; &amp; concert") == "Café & concert"


@pytest.mark.parametrize(
    "raw",
    [
        "&lt;script&gt;alert(1)&lt;/script&gt;Texte",
        "&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;Texte",
        "<script>alert(1)</script>Texte",
        "&lt;img src=x onerror=alert(1)&gt;Texte",
    ],
)
def test_clean_text_no_xss_survivors(raw):
    out = clean_text(raw)
    assert "<script" not in out.lower()
    assert "&lt;" not in out and "&gt;" not in out
    assert "<img" not in out.lower()
    assert "Texte" in out


@pytest.mark.parametrize(
    "title,desc,raw,expected",
    [
        ("Manifestation pour le climat", None, None, None),  # not "festival"
        ("Un exposé sur les abeilles", None, None, None),  # not "expo"
        ("Parcours sportif au parc", None, None, None),  # not "visite"
        ("Duo gourmand : sablés", "Atelier art de la table", None, "ateliers"),
        ("Concert de jazz au Sunside", None, None, "concerts"),
        ("Festival du film court", None, None, "festivals"),
        ("Le Lac des cygnes", "Un ballet en quatre actes", None, "danse"),
        ("Soirée", None, "Concerts / Jazz", "concerts"),  # explicit label wins
        ("Visite guidée du Marais", "Concert final", None, "visites"),  # title beats description
        ("Yoga au parc", None, "sport", "ateliers"),  # no 'sport' category
    ],
)
def test_detect_category(title, desc, raw, expected):
    assert detect_category(raw, title, desc) == expected


def test_detect_category_source_map():
    assert detect_category("Musique classique", "X", None, source_map={"musique classique": "concerts"}) == "concerts"


@pytest.mark.parametrize(
    "zip_code,expected",
    [("75001", "1er"), ("75011", "11e"), ("75116", "16e"), ("75020", "20e"), ("92100", None), (None, None), ("75021", None)],
)
def test_arrondissement_from_zip(zip_code, expected):
    assert arrondissement_from_zip(zip_code) == expected
