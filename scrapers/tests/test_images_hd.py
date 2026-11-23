"""Lot D : grande variante des images Offi et Theatreonline (utils/images.hd_image_url)."""
from datetime import datetime, timezone

import pytest

from tests.conftest import load_fixture
from utils.event import make_event
from utils.images import hd_image_url
from validation import validate

OFFI = "https://files.offi.fr/programmation/3126495/images/120/95e241adac4068f70ef3f6409dc7d98f.png"
TO = "https://www.theatreonline.com/BDDPhoto/Medias//spectacle/63657/xs_1_affiche.jpg"


@pytest.mark.parametrize("url,expected", [
    (OFFI, "https://files.offi.fr/programmation/3126495/images/1000/95e241adac4068f70ef3f6409dc7d98f.png"),
    ("https://files.offi.fr/programmation/3255974/images/200/e88d6ecb798d4bf863ac35ef17b040bc.jpg",
     "https://files.offi.fr/programmation/3255974/images/1000/e88d6ecb798d4bf863ac35ef17b040bc.jpg"),
    # types vérifiés le 23/11/2026 : evenement, lieu, festival
    ("https://files.offi.fr/evenement/58452/images/120/105ae37db94f6fd3d1b7f01b5e392005.jpg",
     "https://files.offi.fr/evenement/58452/images/1000/105ae37db94f6fd3d1b7f01b5e392005.jpg"),
    ("https://files.offi.fr/lieu/1638/images/120/769c7dbc590aec9a0f599c9ce151acdd.jpg",
     "https://files.offi.fr/lieu/1638/images/1000/769c7dbc590aec9a0f599c9ce151acdd.jpg"),
    ("https://files.offi.fr/festival/9269/images/120/c3b865753305de2d3e45ca1e53c016eb.jpg",
     "https://files.offi.fr/festival/9269/images/1000/c3b865753305de2d3e45ca1e53c016eb.jpg"),
    (TO, "https://www.theatreonline.com/BDDPhoto/Medias//spectacle/63657/1_affiche.jpg"),
    ("https://www.theatreonline.com/BDDPhoto/Medias//programmation/99866/xs_1_affiche.jpeg",
     "https://www.theatreonline.com/BDDPhoto/Medias//programmation/99866/1_affiche.jpeg"),
    ("https://www.theatreonline.com/BDDPhoto/Medias//spectacle/57756/xs_1_affiche.JPG",
     "https://www.theatreonline.com/BDDPhoto/Medias//spectacle/57756/1_affiche.JPG"),
])
def test_hd_variants(url, expected):
    assert hd_image_url(url) == expected
    assert hd_image_url(expected) == expected  # idempotent


@pytest.mark.parametrize("url", [
    None, "",
    "https://files.offi.fr/programmation/3126495/images/1000/95e241adac4068f70ef3f6409dc7d98f.png",
    "https://files.offi.fr/programmation/3126495/images/600/x.jpg",  # 600 n'existe pas : pas de règle
    "https://www.theatreonline.com/BDDPhoto/Affiche/14953.jpg",  # pas de variante
    "https://www.theatreonline.com/BDDPhoto/Medias/spectacle/51629/2_visuel.jpg",
    "https://cdn.example.com/images/120/abc.jpg",  # autre hôte
    "https://s1.ticketm.net/dam/a/123/abc_RETINA_PORTRAIT_16_9.jpg",
])
def test_other_urls_unchanged(url):
    assert hd_image_url(url) == url


def test_make_event_and_validation_use_the_hd_variant():
    ev = make_event(source="offi", source_id="1", title="Monet", start="2026-12-01T20:00:00+01:00",
                    image_url=OFFI)
    assert "/images/1000/" in ev["image_url"]
    raw = dict(ev, image_url=TO)  # un spider qui contournerait make_event
    out, _, _, _ = validate(raw, now=datetime(2026, 11, 23, tzinfo=timezone.utc))
    assert out.image_url.endswith("/63657/1_affiche.jpg")


def test_spiders_yield_hd_images():
    from spiders.offi import parse_listing as offi_listing
    from spiders.theatreonline import parse_listing as to_listing
    from datetime import date

    offi = offi_listing(load_fixture("offi_listing_expos.html"), "expos")
    imgs = [e["image_url"] for e in offi if e["image_url"] and "files.offi.fr" in e["image_url"]]
    assert imgs and all("/images/1000/" in u for u in imgs)
    to = to_listing(load_fixture("theatreonline_listing.html"), today=date(2026, 10, 7))
    imgs = [e["image_url"] for e in to if e["image_url"] and "theatreonline" in e["image_url"]]
    assert imgs and not any("/xs_" in u for u in imgs)
    assert any(u.endswith("/97583/1_affiche.jpg") for u in imgs)
