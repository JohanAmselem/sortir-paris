"""Lot D : titres nettoyés à la collecte, jeux concours et articles rejetés."""
from datetime import datetime, timezone

import pytest

from pipelines.ingest import SKIP_INSERT
from utils.titles import (
    clean_display_title,
    is_contest,
    is_editorial_article,
    sortiraparis_title,
    strip_prestation_prefix,
    strip_venue_suffix,
)
from validation import HARD_REASONS, decide_status, validate

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)
OLYMPIA = "L'OLYMPIA"
ZENITH = "Zenith de Paris La Villette"


# ── suffixe de salle redondant ──

@pytest.mark.parametrize("title,venue,expected", [
    ("Peet - l'Olympia", OLYMPIA, "Peet"),
    ("KALIKA - L'Olympia", OLYMPIA, "KALIKA"),  # capitales gardées
    ("JOLAGREEN23 - Zénith Paris - la Villette", ZENITH, "JOLAGREEN23"),
    ("Zelie - le Trianon - Paris", "Le Trianon", "Zelie"),
    ("MONO @ Cabaret Sauvage", "Cabaret Sauvage", "MONO"),
    ("Yanamko @La Boule Noire", "LA BOULE NOIRE", "Yanamko"),
    ("Bardix le Gaulois @ L'Élysée Montmartre - Paris", "ELYSEE MONTMARTRE", "Bardix le Gaulois"),
    ("MPL · Zenith Paris - la Villette", ZENITH, "MPL"),
    ("Jersey — La Cigale", "La Cigale", "Jersey"),
    ("Peter Pan - Le Musical - Théâtre Mogador", "Théâtre Mogador", "Peter Pan - Le Musical"),
    ("Groundation - A Tribute to Bob Marley - Cabaret Sauvage", "Cabaret Sauvage",
     "Groundation - A Tribute to Bob Marley"),
])
def test_venue_suffix_removed(title, venue, expected):
    assert strip_venue_suffix(title, [venue]) == expected


@pytest.mark.parametrize("title,venue", [
    ("Peet - l'Olympia", "Le Trianon"),  # le suffixe n'est pas le lieu de la ligne
    ("Peet - l'Olympia", None),  # lieu inconnu
    ("Concert - Grande Salle", "Philharmonie de Paris - Grande Salle Pierre Boulez"),  # tête générique
    ("Midi musical - Opéra !", "Opéra Garnier"),  # « Opéra » seul ne désigne pas le lieu
    ("Exposition Prix Photo Sociale - Mairie du 10e", "Mairie du 20e arrondissement"),
    ('Conférence "Les Maîtres d’art - Dialogue France - Japon"', "Maison de la culture du Japon"),
    ("Un soir au Zénith", ZENITH),  # « au » n'est pas un séparateur de suffixe
    ("Olympia - Olympia", OLYMPIA),
    ("L'Olympia - Peet", OLYMPIA),  # seul le suffixe est retiré
])
def test_venue_suffix_kept(title, venue):
    assert strip_venue_suffix(title, [venue]) == title


# ── Ticketmaster « Prestation » ──

def test_prestation_prefix():
    assert strip_prestation_prefix("Prestation Tori Kelly") == "Tori Kelly"
    assert strip_prestation_prefix("Prestation Hospitalite Muse") == "Muse"
    assert strip_prestation_prefix("Prestation") == "Prestation"
    assert strip_prestation_prefix("Prestation the Pretty Reckless") == "The Pretty Reckless"
    assert strip_prestation_prefix("thrown") == "thrown"  # sans préfixe : rien ne change
    assert clean_display_title("Prestation Rush", source="ticketmaster") == "Rush"
    # autre source : jamais touché
    assert clean_display_title("Prestation de serment", source="openagenda") == "Prestation de serment"


# ── titres d'article sortiraparis ──

@pytest.mark.parametrize("title,expected", [
    ("The Pogues, le groupe qui a révolutionné le folk irlandais, en concert à l'Olympia en novembre 2026",
     "The Pogues"),
    ("Adèle Castillon en concert au Zénith de Paris en février 2027", "Adèle Castillon"),
    ("Kenshi Yonezu, figure majeure de la scène japonaise contemporaine, en concert à Paris en 2027",
     "Kenshi Yonezu"),
    ("Earth, Wind & Fire en concert à Paris Bercy", "Earth, Wind & Fire"),  # virgule du nom gardée
    ("Muse en concert à La Défense Arena : qui va assurer la première partie ?", "Muse"),
    ("Lio en concert à l’Olympia", "Lio"),
    ("Drogues : l’exposition du musée de l’Homme sur les substances psychoactives", "Drogues"),
    ("Berlin Berlin revient au Théâtre des Nouveautés : notre critique",
     "Berlin Berlin revient au Théâtre des Nouveautés"),
    ("Daft Punk : nos photos de l'exposition \"Around The World\" consacrée au duo électro à Paris", "Daft Punk"),
])
def test_sortiraparis_article_titles(title, expected):
    assert sortiraparis_title(title) == expected
    assert clean_display_title(title, source="sortiraparis") == expected


@pytest.mark.parametrize("title,venue", [
    ("Qui est Sofiane Pamart, le premier pianiste en concert au Stade de France ?", None),
    ("Disney en Concert : Suivez vos rêves à Paris", None),  # titre de spectacle (majuscule)
    ("Institut Giacometti : l'expo Sortir du bois avec Olivia Rosenthal", "Institut Giacometti"),
    ("Palais Galliera : l’exposition mode sur la révolution du vestiaire", "Palais Galliera - musée de la mode"),
    ("Le Large sur l'île Seguin : l'expo Moteur Imaginaire à découvrir", None),
    ("J'ai vu : l'exposition lumineuse de Jenny Holzer", None),  # article : rejeté, jamais renommé
    ("Les Premiers Romantiques : des concerts sur pianos d’époque au château de Malmaison", None),
])
def test_sortiraparis_titles_left_alone(title, venue):
    assert sortiraparis_title(title, [venue]) == title


def test_validation_cleans_after_title_case():
    base = dict(source="openagenda", source_id="1", start_date="2026-12-16T19:00:00+00:00",
                venue_name="L'Olympia", venue_zip="75009", category_slug="concerts")
    ev, hard, _, _ = validate(dict(base, title="KALIKA - L'Olympia"), now=NOW)
    assert ev.title == "KALIKA" and not hard
    ev, _, _, _ = validate(dict(base, title="Peet - l'Olympia"), now=NOW)
    assert ev.title == "Peet"
    ev, _, _, _ = validate(dict(base, source="ticketmaster", title="PRESTATION TORI KELLY"), now=NOW)
    assert ev.title == "Tori Kelly"
    ev, _, _, _ = validate(dict(base, source="sortiraparis", venue_name="L'Olympia",
                                title="Camille en concert à l'Olympia à Paris en février 2027"), now=NOW)
    assert ev.title == "Camille"


# ── jeux concours ──

@pytest.mark.parametrize("title", [
    "Gagnez des places pour le concert d'Erella au Sunside",
    "Gagnez 2 invitations pour assister à « Cabarets », à Chaillot",
    "Remportez des entrées pour l'expo « Simone Fattal »",
    "Jeu-concours : 10 places pour Muse",
    "Jeu concours Noël",
    "Des places à gagner pour Muse",
    "À gagner : le coffret du festival",
    "Concours de dessins : Imagine ton affiche de film d'animation",
    "Concours « Louvre Photo »",
])
def test_contests(title):
    assert is_contest(title)


@pytest.mark.parametrize("title", [
    "Finale du concours Long-Thibaud",
    "Concours Long-Thibaud (violon) Soirée de gala",
    "Rien à perdre, tout à gagner",
    "1839. La photographie offerte par les Académies",
    "Exposition de photographies du Grand Concours",
    "Cérémonie de remise du Prix Hors Concours 2026",
    "Le Concours d'éloquence des lycéens",  # « concours » pas en tête
])
def test_not_contests(title):
    assert not is_contest(title)


def test_contest_rejected_and_not_inserted():
    raw = dict(source="paris_opendata", source_id="9", title="Gagnez des places pour le film « Shaun le mouton »",
               start_date="2026-12-01T19:00:00+00:00", venue_name="Le Grand Rex", venue_zip="75002",
               category_slug="concerts")
    _, hard, _, score = validate(raw, now=NOW)
    assert "contest" in hard and decide_status(hard, score) == "rejected"
    assert "contest" in HARD_REASONS and "contest" in SKIP_INSERT


# ── articles éditoriaux ──

@pytest.mark.parametrize("title,expected", [
    ("On a vu, on a (plus qu’) aimé l’expo « Paris à l’arraché »", True),
    ("On a aimé… le seul en scène d’Alex Lutz au Cirque d’hiver", True),
    ("J'ai vu : l'exposition lumineuse de Jenny Holzer", True),
    ("Nos coups de cœur de la semaine", True),
    ("Que faire à Paris ce week-end ?", True),
    ("Top 10 des expos de l'hiver", True),
    ("On a kidnappé le Père-Noël", False),
    ("Notre humble avis", False),
    ("Nos cœurs invincibles", False),
    ("Jenny Holzer. J’ai vu", False),
    ("Café coups de cœur : les animaux et nous", False),
])
def test_editorial_articles(title, expected):
    assert is_editorial_article(title) is expected


def test_articles_rejected_only_for_editorial_sources():
    base = dict(source_id="7", title="On a vu, on a aimé « La Claque » au théâtre",
                start_date="2026-12-01T19:00:00+00:00", venue_name="Théâtre", venue_zip="75011",
                category_slug="theatre")
    _, hard, _, _ = validate(dict(base, source="paris_opendata"), now=NOW)
    assert "editorial_article" in hard
    _, hard, _, _ = validate(dict(base, source="billetreduc", title="On a kidnappé le Père-Noël"), now=NOW)
    assert "editorial_article" not in hard
    _, hard, _, _ = validate(dict(base, source="venue_theatre"), now=NOW)
    assert "editorial_article" not in hard  # le site d'un lieu ne publie pas de critiques
    assert "editorial_article" in SKIP_INSERT
