"""
Probe official venue websites (Paris + petite couronne: 75, 92, 93, 94) for public
structured event data, and propose entries for spiders/venues_config.py.

Formats detected, in order of preference:
  tribe          WordPress "The Events Calendar" REST API (/wp-json/tribe/events/v1/events)
  ics            iCal feed linked from the site (?ical=1, .ics, webcal:, Events Manager /events.ics)
  jsonld         schema.org Event JSON-LD / microdata on the home or agenda page itself
  jsonld_detail  agenda page → detail links (or JSON-LD ItemList URLs) → Event on detail page

Politeness: honest PanameClubBot UA (utils/http.PoliteClient), one client per site with
≥ 1 s between requests to the same host, no retry on 403/429/5xx (a refusal is recorded,
never worked around), robots.txt fetched first and obeyed for every probe URL.
At most 6 requests per site: robots.txt, home page, Tribe REST, then one of iCal feed /
agenda page, and one detail page. Sites are probed concurrently (different hosts).

Every response is cached on disk (--cache): re-runs and fixture extraction cost nothing.

Usage (from scrapers/):
  .venv/bin/python -m tools.discover_venues --cache /tmp/vcache --report /tmp/venues.json
  .venv/bin/python -m tools.discover_venues --report /tmp/venues.json --snippet /tmp/snippet.py
      (--snippet geocodes the fixed venue addresses with BAN and prints VenueSource entries)
  .venv/bin/python -m tools.discover_venues --only petitbain,lucernaire   # a few sites
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bs4 import BeautifulSoup  # noqa: E402

from spiders.venues_config import ALL_VENUES_BY_KEY, VENUES, VenueSource  # noqa: E402
from spiders.venues_structured import (  # noqa: E402
    BOT_NAME, extract_microdata_events, parse_ics_feed, parse_itemlist_links, parse_jsonld_page,
    parse_tribe_page,
)
from utils.http import PoliteClient  # noqa: E402
from utils.jsonld import extract_jsonld, iter_events  # noqa: E402
from utils.normalize import SERVICE_DEPARTMENTS, in_service_zone  # noqa: E402
from utils.wp_events import EM_ICS_PATH, is_tribe_payload, tribe_url  # noqa: E402

# ───────────────────────────── candidates ─────────────────────────────
# (key, name, url, département, fallback_category). The url is the home page or,
# when known, the agenda page. Sources: venues already rejected in venues_config.py
# (re-probed for the new formats), Paris / 92 / 93 / 94 culture venue lists.

C = Tuple[str, str, str, str, Optional[str]]

CANDIDATES: List[C] = [
    # ── concert halls, clubs, bars-concerts (75) ──
    ("hasardludique", "Le Hasard Ludique", "https://www.lehasardludique.paris/", "75", "concerts"),
    ("lastation", "La Station – Gare des Mines", "https://www.lastation.paris/", "75", "concerts"),
    ("supersonic", "Supersonic", "https://www.supersonic-club.fr/", "75", "concerts"),
    ("popupdulabel", "Pop-Up du Label", "https://www.popupdulabel.com/", "75", "concerts"),
    ("leklub", "Le Klub", "https://www.leklub.fr/", "75", "concerts"),
    ("boulenoire", "La Boule Noire", "https://www.laboule-noire.fr/", "75", "concerts"),
    ("lesetoiles", "Les Étoiles", "https://www.lesetoiles.paris/", "75", "concerts"),
    ("panpiper", "Le Pan Piper", "https://www.panpiper.fr/", "75", "concerts"),
    ("badaboum", "Badaboum", "https://www.badaboum.paris/", "75", "concerts"),
    ("buspalladium", "Bus Palladium", "https://www.buspalladium.com/", "75", "concerts"),
    ("divandumonde", "Le Divan du Monde", "https://www.divandumonde.com/", "75", "concerts"),
    ("troisbaudets", "Les Trois Baudets", "https://www.lestroisbaudets.com/", "75", "concerts"),
    ("lajava", "La Java", "https://www.la-java.fr/", "75", "concerts"),
    ("sentierdeshalles", "Le Sentier des Halles", "https://www.lesentierdeshalles.fr/", "75", "concerts"),
    ("linternational", "L'International", "https://www.linternational.paris/", "75", "concerts"),
    ("reservoir", "Le Réservoir", "https://www.reservoirclub.com/", "75", "concerts"),
    ("zebre", "Le Zèbre de Belleville", "https://www.lezebre.com/", "75", "spectacles"),
    ("disquaires", "Les Disquaires", "https://www.lesdisquaires.com/", "75", "concerts"),
    ("alimentationgenerale", "L'Alimentation Générale", "https://www.alimentation-generale.net/", "75", "concerts"),
    ("mecaniqueondulatoire", "La Mécanique Ondulatoire", "https://www.lamecaniqueondulatoire.com/", "75", "concerts"),
    ("rexclub", "Rex Club", "https://www.rexclub.com/", "75", "concerts"),
    ("djoon", "Djoon", "https://www.djoon.com/", "75", "concerts"),
    ("glazart", "Glazart", "https://www.glazart.com/", "75", "concerts"),
    ("damedecanton", "La Dame de Canton", "https://www.damedecanton.com/", "75", "concerts"),
    ("nouveaucasino", "Nouveau Casino", "https://www.nouveaucasino.net/", "75", "concerts"),
    ("cabaretsauvage", "Cabaret Sauvage", "https://www.cabaretsauvage.com/", "75", "concerts"),
    ("flechedor", "La Flèche d'Or", "https://www.flechedor.fr/", "75", "concerts"),
    ("pavillondescanaux", "Pavillon des Canaux", "https://www.pavillondescanaux.com/", "75", None),
    ("le360", "Le 360 Paris Music Factory", "https://www.le360paris.com/", "75", "concerts"),
    ("halldelachanson", "Le Hall de la Chanson", "https://www.lehalldelachanson.com/", "75", "concerts"),
    ("leuropeen", "L'Européen", "https://www.leuropeen.paris/", "75", "concerts"),
    ("alhambra", "L'Alhambra", "https://www.alhambra-paris.com/", "75", "concerts"),
    ("studioermitage", "Studio de l'Ermitage", "https://www.studio-ermitage.com/", "75", "concerts"),
    ("atelierduplateau", "Atelier du Plateau", "https://www.atelierduplateau.org/", "75", "spectacles"),
    ("archipel", "L'Archipel", "https://www.larchipel.net/", "75", "spectacles"),
    ("penicheantipode", "Péniche Antipode", "https://www.penicheantipode.fr/", "75", None),
    ("cirquedhiver", "Cirque d'Hiver Bouglione", "https://www.cirquedhiver.com/", "75", "spectacles"),
    ("lido", "Lido2Paris", "https://www.lido2paris.com/", "75", "spectacles"),
    ("paradislatin", "Paradis Latin", "https://www.paradislatin.com/", "75", "spectacles"),
    ("sallecortot", "Salle Cortot", "https://www.sallecortot.com/", "75", "concerts"),
    ("athenee", "Théâtre de l'Athénée", "https://www.athenee-theatre.com/", "75", "theatre"),
    ("operacomique", "Opéra Comique", "https://www.opera-comique.com/", "75", "concerts"),
    ("cnsmdp", "Conservatoire de Paris (CNSMDP)", "https://www.conservatoiredeparis.fr/fr/agenda", "75", "concerts"),
    ("lepalace", "Le Palace", "https://www.theatrelepalace.fr/", "75", "spectacles"),
    ("comptoirgeneral", "Le Comptoir Général", "https://www.lecomptoirgeneral.com/", "75", None),
    ("larotonde", "La Rotonde Stalingrad", "https://www.larotondestalingrad.com/", "75", None),
    # ── jazz (75) ──
    ("baisersale", "Le Baiser Salé", "https://www.lebaisersale.com/", "75", "concerts"),
    ("caveauhuchette", "Caveau de la Huchette", "https://www.caveaudelahuchette.fr/", "75", "concerts"),
    ("caveauoubliettes", "Caveau des Oubliettes", "https://www.caveaudesoubliettes.fr/", "75", "concerts"),
    ("38riv", "Le 38 Riv'", "https://www.38riv.com/", "75", "concerts"),
    ("jazzclubetoile", "Jazz Club Étoile", "https://www.jazzclubetoile.com/", "75", "concerts"),
    ("lagarejazz", "La Gare – Le Gore", "https://www.lagarejazz.fr/", "75", "concerts"),
    ("petitjournal", "Le Petit Journal Saint-Michel", "https://www.petitjournalsaintmichel.com/", "75", "concerts"),
    ("bizzart", "Le Bizz'Art", "https://www.bizzartclub.com/", "75", "concerts"),
    # ── humour / cafés-théâtres (75) ──
    ("grandpointvirgule", "Le Grand Point Virgule", "https://www.legrandpointvirgule.com/", "75", "spectacles"),
    ("pointvirgule", "Le Point Virgule", "https://www.lepointvirgule.com/", "75", "spectacles"),
    ("nouvelleseine", "La Nouvelle Seine", "https://www.lanouvelleseine.com/", "75", "spectacles"),
    ("panameartcafe", "Paname Art Café", "https://www.panameartcafe.fr/", "75", "spectacles"),
    ("apollotheatre", "Apollo Théâtre", "https://www.apollotheatre.fr/", "75", "spectacles"),
    ("lerepublique", "Le République", "https://www.le-republique.fr/", "75", "spectacles"),
    ("comediedeparis", "La Comédie de Paris", "https://www.comediedeparis.com/", "75", "spectacles"),
    ("theatredixheures", "Théâtre de Dix Heures", "https://www.theatre-dix-heures.fr/", "75", "spectacles"),
    ("feuxdelarampe", "Les Feux de la Rampe", "https://www.feux-de-la-rampe.com/", "75", "spectacles"),
    ("jamelcomedyclub", "Jamel Comedy Club", "https://www.jamelcomedyclub.com/", "75", "spectacles"),
    ("theatretrevise", "Théâtre Trévise", "https://www.theatre-trevise.com/", "75", "spectacles"),
    ("meloamelie", "Le Mélo d'Amélie", "https://www.lemelodamelie.com/", "75", "spectacles"),
    ("petiteloge", "La Petite Loge", "https://www.lapetiteloge.com/", "75", "spectacles"),
    ("blancsmanteaux", "Théâtre des Blancs-Manteaux", "https://www.blancsmanteaux.fr/", "75", "spectacles"),
    ("funambule", "Le Funambule Montmartre", "https://www.funambule-montmartre.com/", "75", "theatre"),
    ("comediecaumartin", "Comédie Caumartin", "https://www.comedie-caumartin.com/", "75", "theatre"),
    ("comediestmichel", "Comédie Saint-Michel", "https://www.comediesaintmichel.fr/", "75", "spectacles"),
    ("splendid", "Le Splendid", "https://www.lesplendid.com/", "75", "spectacles"),
    ("theatrebo", "Théâtre BO Saint-Martin", "https://www.theatrebo.fr/", "75", "spectacles"),
    ("theatrelebout", "Le Bout", "https://www.lebout.fr/", "75", "spectacles"),
    ("barbescomedy", "Barbès Comedy Club", "https://www.barbescomedyclub.com/", "75", "spectacles"),
    ("theatremetropole", "Le Métropole", "https://www.lemetropole.paris/", "75", "spectacles"),
    ("kezaco", "Kezaco Café-Théâtre", "https://www.kezaco-cafe-theatre.com/", "75", "spectacles"),
    ("theatredelatoureiffel", "Théâtre de la Tour Eiffel", "https://www.theatredelatoureiffel.fr/", "75", "theatre"),
    # ── théâtres privés (75) ──
    ("lucernaire", "Le Lucernaire", "https://www.lucernaire.fr/", "75", "theatre"),
    ("theatreoeuvre", "Théâtre de l'Œuvre", "https://www.theatredeloeuvre.fr/", "75", "theatre"),
    ("lapop", "La Pop", "https://www.lapop.fr/", "75", "spectacles"),
    ("dechargeurs", "Les Déchargeurs", "https://www.lesdechargeurs.fr/", "75", "theatre"),
    ("theatrehuchette", "Théâtre de la Huchette", "https://www.theatre-huchette.com/", "75", "theatre"),
    ("mathurins", "Théâtre des Mathurins", "https://www.theatredesmathurins.com/", "75", "theatre"),
    ("gaitemontparnasse", "Théâtre de la Gaîté-Montparnasse", "https://www.gaite.fr/", "75", "theatre"),
    ("tristanbernard", "Théâtre Tristan-Bernard", "https://www.theatre-tristan-bernard.fr/", "75", "theatre"),
    ("hebertot", "Théâtre Hébertot", "https://www.theatrehebertot.com/", "75", "theatre"),
    ("michodiere", "Théâtre de la Michodière", "https://www.michodiere.com/", "75", "theatre"),
    ("edouard7", "Théâtre Édouard VII", "https://www.theatreedouard7.com/", "75", "theatre"),
    ("theatremadeleine", "Théâtre de la Madeleine", "https://www.theatredelamadeleine.com/", "75", "theatre"),
    ("theatreantoine", "Théâtre Antoine", "https://www.theatre-antoine.com/", "75", "theatre"),
    ("portestmartin", "Théâtre de la Porte Saint-Martin", "https://www.portestmartin.com/", "75", "theatre"),
    ("petitstmartin", "Théâtre du Petit Saint-Martin", "https://www.petitstmartin.com/", "75", "theatre"),
    ("renaissance", "Théâtre de la Renaissance", "https://www.theatredelarenaissance.com/", "75", "theatre"),
    ("varietes", "Théâtre des Variétés", "https://www.theatre-des-varietes.fr/", "75", "theatre"),
    ("palaisroyal", "Théâtre du Palais-Royal", "https://www.theatrepalaisroyal.com/", "75", "theatre"),
    ("saintgeorges", "Théâtre Saint-Georges", "https://www.theatresaintgeorges.com/", "75", "theatre"),
    ("theatrefontaine", "Théâtre Fontaine", "https://www.theatrefontaine.com/", "75", "theatre"),
    ("labruyere", "Théâtre La Bruyère", "https://www.theatrelabruyere.com/", "75", "theatre"),
    ("bouffesparisiens", "Théâtre des Bouffes Parisiens", "https://www.bouffesparisiens.com/", "75", "theatre"),
    ("pochemontparnasse", "Théâtre de Poche-Montparnasse", "https://www.theatredepoche-montparnasse.com/", "75", "theatre"),
    ("theatremichel", "Théâtre Michel", "https://www.theatre-michel.fr/", "75", "theatre"),
    ("nouveautes", "Théâtre des Nouveautés", "https://www.theatredesnouveautes.fr/", "75", "theatre"),
    ("daunou", "Théâtre Daunou", "https://www.theatredaunou.fr/", "75", "theatre"),
    ("dejazet", "Théâtre Déjazet", "https://www.dejazet.com/", "75", "theatre"),
    ("ranelagh", "Théâtre le Ranelagh", "https://www.theatre-ranelagh.com/", "75", "theatre"),
    ("gymnase", "Théâtre du Gymnase Marie-Bell", "https://www.theatredugymnase.paris/", "75", "theatre"),
    ("le13emeart", "Le 13e Art", "https://www.le13emeart.com/", "75", "spectacles"),
    ("guichetmontparnasse", "Guichet Montparnasse", "https://www.guichetmontparnasse.com/", "75", "theatre"),
    ("galabru", "Théâtre Montmartre-Galabru", "https://www.theatre-galabru.com/", "75", "theatre"),
    ("essaion", "Essaïon Théâtre", "https://www.essaion-theatre.com/", "75", "theatre"),
    ("theatrelibre", "Théâtre Libre", "https://www.theatrelibre.fr/", "75", "theatre"),
    ("contrescarpe", "Théâtre de la Contrescarpe", "https://www.theatredelacontrescarpe.fr/", "75", "theatre"),
    ("theatrelepic", "Théâtre Lepic", "https://www.theatrelepic.com/", "75", "theatre"),
    ("studiohebertot", "Studio Hébertot", "https://www.studiohebertot.com/", "75", "theatre"),
    ("theatredenesle", "Théâtre de Nesle", "https://www.theatredenesle.com/", "75", "theatre"),
    ("menilmontant", "Théâtre de Ménilmontant", "https://www.menilmontant.info/", "75", "theatre"),
    ("artstudiotheatre", "Art Studio Théâtre", "https://www.artstudiotheatre.fr/", "75", "theatre"),
    ("theatredelopprime", "Théâtre de l'Opprimé", "https://www.theatredelopprime.com/", "75", "theatre"),
    ("akteon", "Akteon Théâtre", "https://www.akteon.fr/", "75", "theatre"),
    ("theatremarais", "Théâtre du Marais", "https://www.theatredumarais.com/", "75", "theatre"),
    ("vingtieme", "Vingtième Théâtre", "https://www.vingtiemetheatre.com/", "75", "theatre"),
    ("theatreconcorde", "Théâtre de la Concorde", "https://www.theatredelaconcorde.paris/", "75", "theatre"),
    # ── théâtres publics / danse (75) ──
    ("theatre13", "Théâtre 13", "https://www.theatre13.com/", "75", "theatre"),
    ("theatrebastille", "Théâtre de la Bastille", "https://www.theatre-bastille.com/", "75", "theatre"),
    ("theatrebelleville", "Théâtre de Belleville", "https://www.theatredebelleville.com/", "75", "theatre"),
    ("aquarium", "Théâtre de l'Aquarium", "https://www.theatredelaquarium.com/", "75", "theatre"),
    ("tempete", "Théâtre de la Tempête", "https://www.la-tempete.fr/", "75", "theatre"),
    ("epeedebois", "Théâtre de l'Épée de Bois", "https://www.epeedebois.com/", "75", "theatre"),
    ("theatredusoleil", "Théâtre du Soleil", "https://www.theatre-du-soleil.fr/", "75", "theatre"),
    ("theatredelacite", "Théâtre de la Cité internationale", "https://www.theatredelacite.com/", "75", "theatre"),
    ("parisvillette", "Théâtre Paris-Villette", "https://www.theatre-paris-villette.fr/", "75", "theatre"),
    ("atalante", "Théâtre de l'Atalante", "https://www.theatre-latalante.com/", "75", "theatre"),
    ("theatreouvert", "Théâtre Ouvert", "https://www.theatre-ouvert.com/", "75", "theatre"),
    ("reineblanche", "Théâtre de la Reine Blanche", "https://www.reineblanche.com/", "75", "theatre"),
    ("monfort", "Le Monfort", "https://www.lemonfort.fr/", "75", "spectacles"),
    ("chaillot", "Chaillot – Théâtre national de la Danse", "https://theatre-chaillot.fr/", "75", "danse"),
    ("metallos", "Maison des Métallos", "https://www.maisondesmetallos.paris/", "75", None),
    ("carreaudutemple", "Le Carreau du Temple", "https://www.carreaudutemple.eu/", "75", None),
    ("plateauxsauvages", "Les Plateaux Sauvages", "https://www.lesplateauxsauvages.fr/", "75", "theatre"),
    ("regardducygne", "Le Regard du Cygne", "https://www.leregarducygne.com/", "75", "danse"),
    ("atelierdeparis", "Atelier de Paris – CDCN", "https://www.atelierdeparis.org/", "75", "danse"),
    ("micadanses", "Micadanses", "https://www.micadanses.com/", "75", "danse"),
    ("mouffetard", "Le Mouffetard – CNMA", "https://www.lemouffetard.com/", "75", "spectacles"),
    ("theatredelaville", "Théâtre de la Ville – Sarah Bernhardt", "https://www.theatredelaville-paris.com/fr/spectacles", "75", "theatre"),
    ("cartoucherie", "Cartoucherie de Vincennes", "https://www.cartoucherie.fr/", "75", "theatre"),
    ("theatreduchaudron", "Théâtre du Chaudron", "https://www.theatreduchaudron.fr/", "75", "theatre"),
    # ── tiers-lieux (75 / 93) ──
    ("recyclerie", "La REcyclerie", "https://www.larecyclerie.com/", "75", None),
    ("cesure", "Césure", "https://www.cesure.paris/", "75", None),
    ("shakirail", "Le Shakirail", "https://www.shakirail.com/", "75", None),
    ("jardinsduruisseau", "Les Jardins du Ruisseau", "https://www.lesjardinsduruisseau.org/", "75", None),
    ("amarres", "Les Amarres", "https://www.lesamarres.paris/", "75", None),
    ("petiterockette", "La Petite Rockette", "https://www.lapetiterockette.org/", "75", None),
    ("citefertile", "La Cité Fertile", "https://www.citefertile.com/", "93", None),
    ("mainsdoeuvres", "Mains d'Œuvres", "https://www.mainsdoeuvres.org/", "93", None),
    ("le6b", "Le 6b", "https://www.le6b.fr/", "93", None),
    ("lesample", "Le Sample", "https://www.lesample.fr/", "93", None),
    ("fermedubonheur", "La Ferme du Bonheur", "https://www.lafermedubonheur.fr/", "92", None),
    ("ateliermedicis", "Atelier Médicis", "https://www.ateliermedicis.fr/", "93", None),
    ("poc", "Pôle culturel d'Alfortville (POC)", "https://www.poc-alfortville.com/", "94", None),
    # ── musées, fondations, centres d'art (75) ──
    ("jeudepaume", "Jeu de Paume", "https://jeudepaume.org/", "75", "expos"),
    ("mep", "Maison européenne de la photographie", "https://www.mep-fr.org/", "75", "expos"),
    ("museeduluxembourg", "Musée du Luxembourg", "https://museeduluxembourg.fr/", "75", "expos"),
    ("museedelhomme", "Musée de l'Homme", "https://www.museedelhomme.fr/", "75", "expos"),
    ("mnhn", "Muséum national d'Histoire naturelle", "https://www.mnhn.fr/fr/agenda", "75", "expos"),
    ("artsetmetiers", "Musée des Arts et Métiers", "https://www.arts-et-metiers.net/", "75", "expos"),
    ("giacometti", "Institut Giacometti", "https://www.fondation-giacometti.fr/", "75", "expos"),
    ("maillol", "Musée Maillol", "https://www.museemaillol.com/", "75", "expos"),
    ("atelierlumieres", "Atelier des Lumières", "https://www.atelier-lumieres.com/", "75", "expos"),
    ("grandpalaisimmersif", "Grand Palais Immersif", "https://grand-palais-immersif.fr/", "75", "expos"),
    ("guimet", "Musée Guimet", "https://www.guimet.fr/", "75", "expos"),
    ("rodin", "Musée Rodin", "https://www.musee-rodin.fr/", "75", "expos"),
    ("delacroix", "Musée Eugène-Delacroix", "https://www.musee-delacroix.fr/", "75", "expos"),
    ("citearchi", "Cité de l'architecture et du patrimoine", "https://www.citedelarchitecture.fr/", "75", "expos"),
    ("museearmee", "Musée de l'Armée", "https://www.musee-armee.fr/", "75", "expos"),
    ("cluny", "Musée de Cluny", "https://www.musee-moyenage.fr/", "75", "expos"),
    ("artsforains", "Musée des Arts forains", "https://arts-forains.com/", "75", "visites"),
    ("hcb", "Fondation Henri Cartier-Bresson", "https://www.henricartierbresson.org/", "75", "expos"),
    ("pernodricard", "Fondation Pernod Ricard", "https://www.fondation-pernod-ricard.com/", "75", "expos"),
    ("lafayetteanticipations", "Lafayette Anticipations", "https://www.lafayetteanticipations.com/", "75", "expos"),
    ("lebal", "Le Bal", "https://www.le-bal.fr/", "75", "expos"),
    ("arsenal", "Pavillon de l'Arsenal", "https://www.pavillon-arsenal.com/", "75", "expos"),
    ("institutsuedois", "Institut suédois", "https://paris.si.se/", "75", None),
    ("ccsuisse", "Centre culturel suisse", "https://www.ccsparis.com/", "75", None),
    ("montmartre", "Musée de Montmartre", "https://museedemontmartre.fr/", "75", "expos"),
    ("ysl", "Musée Yves Saint Laurent Paris", "https://museeyslparis.com/", "75", "expos"),
    ("chassenature", "Musée de la Chasse et de la Nature", "https://www.chassenature.org/", "75", "expos"),
    ("museeposte", "Musée de La Poste", "https://www.museedelaposte.fr/", "75", "expos"),
    ("immigration", "Musée national de l'histoire de l'immigration", "https://www.histoire-immigration.fr/", "75", "expos"),
    ("memorialshoah", "Mémorial de la Shoah", "https://www.memorialdelashoah.org/", "75", "conferences"),
    ("mahj", "Musée d'art et d'histoire du Judaïsme", "https://www.mahj.org/", "75", "expos"),
    ("custodia", "Fondation Custodia", "https://www.fondationcustodia.fr/", "75", "expos"),
    ("museeenherbe", "Musée en Herbe", "https://www.musee-en-herbe.com/", "75", "expos"),
    ("museemarine", "Musée national de la Marine", "https://www.musee-marine.fr/", "75", "expos"),
    ("fraciledefrance", "Frac Île-de-France", "https://www.fraciledefrance.com/", "75", "expos"),
    ("cwb", "Centre Wallonie-Bruxelles", "https://www.cwb.fr/", "75", None),
    ("institutfinlandais", "Institut finlandais", "https://www.institut-finlandais.fr/", "75", None),
    ("mcjp", "Maison de la culture du Japon", "https://www.mcjp.fr/", "75", None),
    ("coreeculture", "Centre culturel coréen", "https://www.coree-culture.org/", "75", None),
    ("ccirlandais", "Centre culturel irlandais", "https://www.centreculturelirlandais.com/", "75", None),
    ("mal217", "Maison de l'Amérique latine", "https://www.mal217.org/", "75", None),
    ("ciup", "Cité internationale universitaire", "https://www.ciup.fr/", "75", None),
    ("bpi", "Bibliothèque publique d'information", "https://www.bpi.fr/", "75", "conferences"),
    ("grevin", "Musée Grévin", "https://www.grevin-paris.com/", "75", "visites"),
    ("institutculturelitalien", "Institut culturel italien", "https://iicparigi.esteri.it/", "75", None),
    ("goethe", "Goethe-Institut Paris", "https://www.goethe.de/ins/fr/fr/sta/par.html", "75", None),
    ("institutpolonais", "Institut polonais", "https://instytutpolski.pl/paris/", "75", None),
    ("maisondelapoesie", "Maison de la Poésie", "https://www.maisondelapoesieparis.com/", "75", "conferences"),
    ("gulbenkian", "Fondation Gulbenkian – Paris", "https://gulbenkian.pt/paris/", "75", None),
    ("mobiliernational", "Galerie des Gobelins", "https://www.mobiliernational.culture.gouv.fr/", "75", "expos"),
    ("espacefondationedf", "Fondation EDF – Espace", "https://www.fondation.edf.com/", "75", "expos"),
    ("hallesaintpierre", "Halle Saint-Pierre", "https://www.hallesaintpierre.org/", "75", "expos"),
    ("maisondoisneau", "Maison de la Photographie Robert Doisneau", "https://www.maisondoisneau.agglo-valdebievre.fr/", "94", "expos"),
    ("lavoirmoderne", "Le Lavoir Moderne Parisien", "https://www.lavoirmoderneparisien.com/", "75", "theatre"),
    ("cafedelagare", "Café de la Gare", "https://www.cafe-de-la-gare.fr/", "75", "spectacles"),
    # ── cinéma-events (not covered by allocine's showtimes: talks, festivals) ──
    ("louxor", "Le Louxor", "https://www.cinemalouxor.fr/", "75", "cinema"),
    ("studio28", "Studio 28", "https://www.cinema-studio28.fr/", "75", "cinema"),
    ("champo", "Le Champo", "https://www.cinema-lechampo.com/", "75", "cinema"),
    ("maxlinder", "Max Linder Panorama", "https://www.maxlinder.com/", "75", "cinema"),
    ("pantheon", "Cinéma du Panthéon", "https://www.cinemadupantheon.fr/", "75", "cinema"),
    ("lafilmotheque", "Filmothèque du Quartier latin", "https://www.lafilmotheque.fr/", "75", "cinema"),
    ("laclefrevival", "La Clef Revival", "https://www.laclefrevival.com/", "75", "cinema"),
    ("pagode", "Cinéma La Pagode", "https://www.lapagode.fr/", "75", "cinema"),
    ("lebalzac", "Le Balzac", "https://www.cinemabalzac.com/", "75", "cinema"),
    ("melies", "Le Méliès Montreuil", "https://www.montreuil.fr/sortir/cinema-le-melies", "93", "cinema"),
    # ── Seine-Saint-Denis (93) ──
    ("mc93", "MC93 – Maison de la Culture de Seine-Saint-Denis", "https://www.mc93.com/", "93", "theatre"),
    ("tgp", "Théâtre Gérard Philipe – Saint-Denis", "https://www.theatregerardphilipe.com/", "93", "theatre"),
    ("lacommune", "La Commune – CDN d'Aubervilliers", "https://www.lacommune-aubervilliers.fr/", "93", "theatre"),
    ("ntm", "Nouveau Théâtre de Montreuil", "https://www.nouveau-theatre-montreuil.com/", "93", "theatre"),
    ("espace1789", "Espace 1789 Saint-Ouen", "https://www.espace-1789.com/", "93", None),
    ("triton", "Le Triton", "https://www.letriton.com/", "93", "concerts"),
    ("gardechasse", "Théâtre du Garde-Chasse", "https://www.theatredugardechasse.fr/", "93", None),
    ("banlieuesbleues", "Banlieues Bleues / La Dynamo", "https://www.banlieuesbleues.org/", "93", "concerts"),
    ("marbrerie", "La Marbrerie", "https://www.lamarbrerie.fr/", "93", "concerts"),
    ("lechinois", "Le Chinois", "https://www.lechinoismontreuil.com/", "93", "concerts"),
    ("instantschavires", "Les Instants Chavirés", "https://www.instantschavires.com/", "93", "concerts"),
    ("louisaragon", "Théâtre Louis Aragon – Tremblay", "https://www.theatrelouisaragon.fr/", "93", "danse"),
    ("echangeur", "L'Échangeur – Bagnolet", "https://www.lechangeur.org/", "93", "theatre"),
    ("michelsimon", "Espace Michel Simon – Noisy-le-Grand", "https://www.espace-michel-simon.fr/", "93", None),
    ("ejp93", "Espace Jacques Prévert – Aulnay", "https://www.ejp93.fr/", "93", None),
    ("canal93", "Canal 93 – Bobigny", "https://www.canal93.net/", "93", "concerts"),
    ("lapeche", "La Pêche – Montreuil", "https://www.lapechecafe.com/", "93", "concerts"),
    ("theatreberthelot", "Théâtre Berthelot – Montreuil", "https://www.theatreberthelot.fr/", "93", None),
    ("studiostains", "Studio Théâtre de Stains", "https://www.studiotheatrestains.fr/", "93", "theatre"),
    ("cnd", "Centre national de la danse", "https://www.cnd.fr/", "93", "danse"),
    ("africolor", "Africolor", "https://www.africolor.com/", "93", "concerts"),
    ("museesaintdenis", "Musée d'art et d'histoire Paul Éluard", "https://www.musee-saint-denis.com/", "93", "expos"),
    ("museeairespace", "Musée de l'Air et de l'Espace", "https://www.museeairespace.fr/", "93", "expos"),
    ("stadefrance", "Stade de France", "https://www.stadefrance.com/", "93", "concerts"),
    ("forumblancmesnil", "Le Forum – Blanc-Mesnil", "https://www.leforumbm.fr/", "93", None),
    ("theatredesbergeries", "Théâtre des Bergeries – Noisy-le-Sec", "https://www.theatredesbergeries.fr/", "93", None),
    ("houdremont", "Houdremont – La Courneuve", "https://www.houdremont.fr/", "93", None),
    ("colombier", "Le Colombier – Bagnolet", "https://www.lecolombier-langaja.com/", "93", "theatre"),
    ("pointfort", "Le Point Fort – Aulnay", "https://www.lepointfort.fr/", "93", "concerts"),
    ("ladynamo", "La Dynamo de Banlieues Bleues – Pantin", "https://www.ladynamo.org/", "93", "concerts"),
    ("cine104", "Ciné 104 – Pantin", "https://www.cine104.com/", "93", "cinema"),
    ("comediamontreuil", "Comédia – Montreuil", "https://www.comedia-montreuil.fr/", "93", None),
    ("magasinsgeneraux", "Les Magasins Généraux", "https://www.magasinsgeneraux.com/", "93", "expos"),
    ("fondationfiminco", "Fondation Fiminco – Romainville", "https://www.fondationfiminco.com/", "93", "expos"),
    ("komunuma", "Komunuma – Romainville", "https://www.komunuma.com/", "93", "expos"),
    # ── Hauts-de-Seine (92) ──
    ("amandiers", "Théâtre Nanterre-Amandiers", "https://www.nanterre-amandiers.com/", "92", "theatre"),
    ("maisonmusiquenanterre", "Maison de la musique de Nanterre", "https://www.maisondelamusique.eu/", "92", "concerts"),
    ("avantseine", "L'Avant Seine – Colombes", "https://www.lavant-seine.com/", "92", None),
    ("suresnes", "Théâtre de Suresnes Jean Vilar", "https://www.theatre-suresnes.fr/", "92", None),
    ("azimut", "L'Azimut – Antony / Châtenay", "https://www.l-azimut.fr/", "92", None),
    ("chatillon", "Théâtre de Châtillon", "https://www.theatreachatillon.com/", "92", None),
    ("malakoff", "Malakoff scène nationale", "https://www.malakoffscenenationale.fr/", "92", None),
    ("vanves", "Théâtre de Vanves", "https://www.theatre-vanves.fr/", "92", None),
    ("theatrearp", "Théâtre Jean Arp – Clamart", "https://www.theatrearp.com/", "92", None),
    ("tam", "Théâtre André Malraux – Rueil", "https://www.tam.fr/", "92", None),
    ("tobb", "Théâtre de l'Ouest Parisien – Boulogne", "https://www.tobb.fr/", "92", None),
    ("sablons", "Théâtre des Sablons – Neuilly", "https://www.theatredessablons.com/", "92", None),
    ("gemeaux", "Les Gémeaux – Sceaux", "https://www.lesgemeaux.com/", "92", None),
    ("t2g", "T2G – Théâtre de Gennevilliers", "https://www.theatredegennevilliers.fr/", "92", "theatre"),
    ("tamanoir", "Le Tamanoir – Gennevilliers", "https://www.tamanoir.fr/", "92", "concerts"),
    ("mjccolombes", "MJC Théâtre de Colombes", "https://www.mjctheatredecolombes.com/", "92", None),
    ("theatreputeaux", "Théâtre de Puteaux", "https://www.theatre-puteaux.fr/", "92", None),
    ("albertkahn", "Musée départemental Albert-Kahn", "https://albert-kahn.hauts-de-seine.fr/", "92", "expos"),
    ("sevres", "Sèvres – Manufacture et Musée nationaux", "https://www.sevresciteceramique.fr/", "92", "expos"),
    ("domainesceaux", "Domaine départemental de Sceaux", "https://domaine-de-sceaux.hauts-de-seine.fr/", "92", None),
    ("carrebellefeuille", "Carré Belle-Feuille – Boulogne", "https://www.carrebellefeuille.fr/", "92", None),
    ("seinemusicale", "La Seine Musicale", "https://www.laseinemusicale.com/programmation/", "92", "concerts"),
    ("tempsdescerises", "Le Temps des Cerises – Issy", "https://www.letempsdescerises.fr/", "92", None),
    ("boulognebillancourt", "Espace Landowski – Boulogne", "https://www.boulognebillancourt.com/", "92", None),
    ("theatreneuilly", "Théâtre de Neuilly", "https://www.theatredeneuilly.com/", "92", None),
    ("levallois", "Salle Ravel – Levallois", "https://www.ville-levallois.fr/", "92", None),
    ("courbevoie", "Espace Carpeaux – Courbevoie", "https://www.ville-courbevoie.fr/", "92", None),
    ("bagneux", "Théâtre Victor Hugo – Bagneux", "https://www.bagneux92.fr/", "92", None),
    ("chatenaymalabry", "La Piscine – Châtenay-Malabry", "https://www.chatenay-malabry.fr/", "92", None),
    ("chateaumalmaison", "Château de Malmaison", "https://musees-nationaux-malmaison.fr/", "92", "visites"),
    ("lehublot", "Le Hublot – Colombes", "https://www.lehublot.org/", "92", "theatre"),
    # ── Val-de-Marne (94) ──
    ("maccreteil", "Maison des Arts de Créteil", "https://www.maccreteil.com/", "94", None),
    ("tqi", "Théâtre des Quartiers d'Ivry", "https://www.theatre-quartiers-ivry.com/", "94", "theatre"),
    ("trr", "Théâtre Romain Rolland – Villejuif", "https://www.trr.fr/", "94", None),
    ("antoinevitez", "Théâtre Antoine Vitez – Ivry", "https://www.theatre-antoinevitez.fr/", "94", None),
    ("jeanvilarvitry", "Théâtre Jean-Vilar – Vitry", "https://www.theatrejeanvilar.com/", "94", None),
    ("choisy", "Théâtre-Cinéma Paul Éluard – Choisy", "https://www.theatrecinemachoisy.fr/", "94", None),
    ("ecam", "ECAM – Le Kremlin-Bicêtre", "https://www.ecam-lekremlinbicetre.fr/", "94", None),
    ("fontenay", "Fontenay-en-Scènes", "https://www.fontenayenscenes.fr/", "94", None),
    ("saintmaur", "Théâtre de Saint-Maur", "https://www.theatresaintmaur.com/", "94", None),
    ("briqueterie", "La Briqueterie – CDCN du Val-de-Marne", "https://www.alabriqueterie.com/", "94", "danse"),
    ("cachan", "Théâtre Jacques Carat – Cachan", "https://www.theatrejacquescarat.fr/", "94", None),
    ("sorano", "Espace Sorano – Vincennes", "https://www.espacesorano.com/", "94", None),
    ("rungis", "Théâtre de Rungis", "https://www.theatre-rungis.fr/", "94", None),
    ("macval", "MAC VAL", "https://www.macval.fr/", "94", "expos"),
    ("exploradome", "Exploradôme", "https://www.exploradome.fr/", "94", "ateliers"),
    ("comptoirfontenay", "Musiques au Comptoir – Fontenay", "https://www.musiquesaucomptoir.fr/", "94", "concerts"),
    ("theatrestudio", "Théâtre-Studio d'Alfortville", "https://www.theatre-studio.com/", "94", "theatre"),
    ("maisonsalfort", "Théâtre Claude Debussy – Maisons-Alfort", "https://www.theatredemaisons-alfort.org/", "94", None),
    ("sudest", "Sud-Est Théâtre – Villeneuve-Saint-Georges", "https://www.sud-est-theatre.fr/", "94", None),
    ("scenewatteau", "La Scène Watteau – Nogent", "https://www.scenewatteau.fr/", "94", None),
    ("sonsdhiver", "Festival Sons d'hiver", "https://www.sonsdhiver.org/", "94", "concerts"),
    ("champigny", "Centre Gérard Philipe – Champigny", "https://www.champigny94.fr/", "94", None),
    ("gentilly", "Le Plateau 31 – Gentilly", "https://www.ville-gentilly.fr/", "94", None),
    ("chateauvincennes", "Château de Vincennes", "https://www.chateau-de-vincennes.fr/", "94", "visites"),
    ("charenton", "Théâtre des 2 Rives – Charenton", "https://www.lesthea.fr/", "94", None),
    ("pavillonbaltard", "Pavillon Baltard – Nogent", "https://www.pavillon-baltard.fr/", "94", None),
    # ── festivals / multi-venue programmers with an own agenda ──
    ("festivalautomne", "Festival d'Automne à Paris", "https://www.festival-automne.com/", "75", None),
    ("festivalidf", "Festival d'Île-de-France", "https://www.festival-idf.fr/", "75", "concerts"),
    ("quartierdete", "Paris l'été", "https://www.parislete.fr/", "75", None),
    ("jazzalavillette", "Jazz à la Villette", "https://jazzalavillette.com/", "75", "concerts"),
    ("villettesonique", "Villette Sonique", "https://www.villettesonique.com/", "75", "concerts"),
    ("welovegreen", "We Love Green", "https://www.welovegreen.fr/", "75", "festivals"),
    ("parisjazzfestival", "Paris Jazz Festival", "https://www.parisjazzfestival.fr/", "75", "concerts"),
    ("chopinparis", "Festival Chopin à Paris", "https://www.frederic-chopin.com/", "75", "concerts"),
    ("inrocksfestival", "Festival Les Inrocks", "https://www.lesinrocks.com/festival/", "75", "concerts"),
    ("jazzsurseine", "Jazz sur Seine", "https://www.jazzsurseine.paris/", "75", "concerts"),
    ("lfsm", "Festival Les Femmes s'en mêlent", "https://www.lfsm.net/", "75", "concerts"),
    ("parispodcastfestival", "Paris Podcast Festival", "https://www.parispodcastfestival.com/", "75", None),
    ("marchepoesie", "Marché de la Poésie", "https://www.marche-poesie.com/", "75", "conferences"),
    ("concertsdepoche", "Concerts de poche", "https://www.concertsdepoche.com/", "93", "concerts"),
    ("parcfloral", "Parc floral de Paris", "https://www.parcfloraldeparis.com/", "75", "concerts"),
    ("saintechapelle", "Sainte-Chapelle", "https://www.sainte-chapelle.fr/", "75", "concerts"),
    ("orchestredeparis", "Orchestre de Paris", "https://www.orchestredeparis.com/", "75", "concerts"),
    ("ondif", "Orchestre national d'Île-de-France", "https://www.orchestre-ile.com/", "75", "concerts"),
    ("ensembleintercontemporain", "Ensemble intercontemporain", "https://www.ensembleintercontemporain.com/", "75", "concerts"),
    ("orchestrechambre", "Orchestre de chambre de Paris", "https://www.orchestredechambredeparis.com/", "75", "concerts"),
    ("insula", "Insula orchestra", "https://www.insulaorchestra.fr/", "92", "concerts"),
    ("ircam", "Ircam", "https://www.ircam.fr/", "75", "concerts"),
    ("rondpoint", "Théâtre du Rond-Point", "https://www.theatredurondpoint.fr/saison/", "75", "theatre"),
    ("bouffesdunord", "Théâtre des Bouffes du Nord", "https://www.bouffesdunord.com/fr/", "75", "theatre"),
]


def _with_rejected() -> List[C]:
    """Venues already rejected in venues_config.py, re-probed for the new formats
    (a CANDIDATES entry with the same key overrides the URL)."""
    known = {c[0] for c in CANDIDATES}
    curated_enabled = {v.key for v in VENUES if v.enabled}
    out = []
    for v in ALL_VENUES_BY_KEY.values():
        if v.key in curated_enabled or v.key in known or not v.urls:
            continue
        zip_code = str((v.default_venue or {}).get("venue_zip") or "75")
        out.append((v.key, v.name, v.urls[0], zip_code[:2], v.fallback_category))
    return out


def all_candidates() -> List[C]:
    seen, out = set(), []
    for c in CANDIDATES + _with_rejected():
        if c[0] in seen:
            continue
        seen.add(c[0])
        out.append(c)
    return out


def host_of(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def by_host(cands: List[C]) -> List[List[C]]:
    """Candidates sharing a host are probed one after the other (≤ 1 req/s per host)."""
    groups: Dict[str, List[C]] = {}
    for c in cands:
        groups.setdefault(host_of(c[2]), []).append(c)
    return list(groups.values())


# ───────────────────────────── detection helpers ─────────────────────────────

CHALLENGE_MARKERS = re.compile(
    r"just a moment|cf-browser-verification|challenge-platform|cf_chl_|captcha|"
    r"vercel security checkpoint|ddos-guard|sgcaptcha|attention required|_incapsula_resource|"
    r"datadome|access denied|request blocked|bot protection|are you a robot|"
    r"checking your browser|perimeterx|px-captcha",
    re.I,
)
JS_SHELL = re.compile(r"__NUXT__|id=\"__next\"|id=\"__nuxt\"|ng-version=|id=\"app\"|id=\"root\"|data-reactroot", re.I)
AGENDA_WORDS = re.compile(
    r"agenda|programm|program|evenement|événement|events?\b|spectacles?|concerts?|calendrier|"
    r"saison|expositions?|billetterie|a-l-affiche|à l'affiche|sorties?|shows?",
    re.I,
)
DETAIL_PREFIX = re.compile(
    r"/(evenements?|événements?|events?|spectacles?|concerts?|agenda|programmation|programme|"
    r"shows?|expos?|expositions?|saison[^/]*|pieces?|seances?|billetterie|activites?|"
    r"rendez-vous|manifestations?|artistes?|production|projects?|projets?|fr/[a-z-]+)/",
    re.I,
)
ICS_HREF = re.compile(r"(\.ics(\?|$)|^webcal:|[?&]ical=1|[?&]ical=true|outlook-ical=1|mec-ical-feed)", re.I)
ADDRESS_RE = re.compile(
    r"(\d{1,4}(?:\s?(?:bis|ter|b))?,?\s+(?:rue|avenue|av\.|boulevard|bd|place|quai|passage|impasse|allée|"
    r"allee|cours|square|villa|chemin|route|cité|cite|parvis|esplanade|port|promenade|sentier|rond-point)"
    r"\s[^,<>\n]{2,60}?)[,\s–-]+\s*((?:75|92|93|94)\d{3})\s+([A-Za-zÀ-ÿ'’]+(?:-[A-Za-zÀ-ÿ'’]+)*)",
    re.I,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _probe_venue(key: str, name: str, kind: str, fallback: Optional[str]) -> VenueSource:
    return VenueSource(key=key, name=name, kind=kind, urls=["https://example.invalid/"],
                       fallback_category=fallback, enabled=False, notes="probe")


def in_zone_event(ev: dict) -> Optional[bool]:
    """True/False when the event says where it is, None when it does not."""
    z = (ev.get("venue_zip") or "").strip()
    if re.fullmatch(r"\d{5}", z):
        return z[:2] in SERVICE_DEPARTMENTS
    if ev.get("venue_lat") is not None and ev.get("venue_lng") is not None:
        return in_service_zone(ev["venue_lat"], ev["venue_lng"])
    return None


def summarize_events(evs: List[dict]) -> dict:
    places = Counter()
    zone = Counter()
    for ev in evs:
        zone[str(in_zone_event(ev))] += 1
        if ev.get("venue_name") or ev.get("venue_address"):
            places[(ev.get("venue_name"), ev.get("venue_address"), ev.get("venue_zip"),
                    ev.get("venue_city"), ev.get("venue_lat"), ev.get("venue_lng"))] += 1
    return {
        "upcoming": len(evs),
        "in_zone": zone.get("True", 0),
        "out_zone": zone.get("False", 0),
        "unlocated": zone.get("None", 0),
        "timed": sum(1 for e in evs if e.get("time_known")),
        "priced": sum(1 for e in evs if e.get("price_status") != "unknown"),
        "with_image": sum(1 for e in evs if e.get("image_url")),
        "places": [list(k) + [n] for k, n in places.most_common(5)],
        "sample": [f"{e['start_date']} | {e['title'][:60]}" for e in evs[:4]],
    }


def site_address(html: str) -> Optional[dict]:
    """The venue's own postal address as published on its page (JSON-LD, else text)."""
    for obj in extract_jsonld(html):
        addr = obj.get("address")
        if isinstance(addr, list):
            addr = addr[0] if addr else None
        if isinstance(addr, dict):
            z = str(addr.get("postalCode") or "").strip()
            street = addr.get("streetAddress")
            if isinstance(street, list):
                street = ", ".join(str(s) for s in street)
            if re.fullmatch(r"(75|92|93|94)\d{3}", z) and street:
                return {"address": str(street).strip(), "zip": z,
                        "city": str(addr.get("addressLocality") or "").strip() or None, "from": "jsonld"}
    text = BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True)
    m = ADDRESS_RE.search(text)
    if m:
        return {"address": m.group(1).strip(" ,–-"), "zip": m.group(2),
                "city": m.group(3).strip()[:40], "from": "text"}
    return None


def agenda_links(html: str, base: str) -> List[str]:
    soup = BeautifulSoup(html or "", "html.parser")
    host = urlparse(base).netloc
    scored = Counter()
    for a in soup.find_all("a", href=True):
        url = urljoin(base, a["href"]).split("#", 1)[0]
        p = urlparse(url)
        if p.netloc != host or p.scheme not in ("http", "https"):
            continue
        path = p.path.rstrip("/")
        if not path or path.count("/") > 3:
            continue
        text = a.get_text(" ", strip=True)[:60]
        if re.search(r"billetterie|location|boutique|shop|organiser|privatis|affiliation|mentions|"
                     r"contact|presse|recrutement|newsletter|\.pdf$|\.html?$.*loc\d", path + " " + text, re.I) \
                and not re.search(r"agenda|programm|calendrier", path, re.I):
            continue
        s = 0
        if AGENDA_WORDS.search(path):
            s += 2
        if AGENDA_WORDS.search(text):
            s += 2
        if re.search(r"agenda|programm|calendrier|a-venir|events/?$", path, re.I):
            s += 2
        if path.count("/") <= 2:
            s += 1
        if s >= 3:
            scored[url] = max(scored[url], s)
    return [u for u, _ in scored.most_common(4)]


def detail_candidates(html: str, base: str) -> Tuple[Optional[str], List[str]]:
    """(path prefix, urls) of the most frequent detail-looking link family on a listing."""
    soup = BeautifulSoup(html or "", "html.parser")
    host = urlparse(base).netloc
    fam: Dict[str, List[str]] = {}
    for a in soup.find_all("a", href=True):
        url = urljoin(base, a["href"]).split("#", 1)[0].split("?", 1)[0]
        p = urlparse(url)
        if p.netloc != host:
            continue
        path = p.path
        segs = [s for s in path.split("/") if s]
        if len(segs) < 2 or not re.search(r"[a-z]-[a-z0-9]", segs[-1], re.I):
            continue
        prefix = "/" + "/".join(segs[:-1]) + "/"
        if re.search(r"/(page|category|categorie|categories|tag|tags|author|auteur|actualites?|news|blog|"
                     r"presse|wp-content|mentions|boutique|shop|product|produit)/", path, re.I):
            continue
        fam.setdefault(prefix, [])
        if url not in fam[prefix]:
            fam[prefix].append(url)
    for u in parse_itemlist_links(html, base):
        p = urlparse(u)
        segs = [s for s in p.path.split("/") if s]
        if p.netloc == host and len(segs) >= 2:
            prefix = "/" + "/".join(segs[:-1]) + "/"
            fam.setdefault(prefix, [])
            if u not in fam[prefix]:
                fam[prefix].append(u)
    if not fam:
        return None, []
    def rank(kv):
        prefix, urls = kv
        return (bool(DETAIL_PREFIX.search(prefix)) and len(urls) >= 2, len(urls) >= 3, len(urls), -len(prefix))

    prefix, urls = max(fam.items(), key=rank)
    return (prefix, urls) if len(urls) >= 2 else (None, [])


# ───────────────────────────── the probe ─────────────────────────────

class Prober:
    """max_new: cap on uncached requests per site for this run (robots.txt included)."""

    def __init__(self, cache: Optional[Path], max_new: int = 4):
        self.cache = cache
        self.max_new = max_new

    def _get(self, client: PoliteClient, url: str, log: list):
        """GET with on-disk cache. Returns (status, final_url, text, content_type) or (err, …)."""
        h = hashlib.sha1(url.encode()).hexdigest()[:16]
        if self.cache:
            f = self.cache / f"{h}.json"
            if f.exists():
                d = json.loads(f.read_text())
                log.append(f"{d['status']} {url} (cached)")
                return d["status"], d["final_url"], d["text"], d["ctype"]
        new = sum(1 for line in log if not line.endswith("(cached)") and not line.startswith("cap "))
        if new >= self.max_new:
            log.append(f"cap {url}")
            return "cap", url, "request cap reached for this site", ""
        try:
            r = client.get(url)
            d = {"status": r.status_code, "final_url": str(r.url), "text": r.text[:3_000_000],
                 "ctype": r.headers.get("content-type", ""), "url": url}
        except Exception as e:
            msg = str(e) or type(e).__name__
            kind = ("dns" if "nodename" in msg or "Name or service" in msg or "getaddrinfo" in msg
                    else "tls" if "SSL" in msg or "TLS" in msg or "certificate" in msg
                    else "timeout" if "timed out" in msg.lower() or "Timeout" in type(e).__name__
                    else "network")
            d = {"status": kind, "final_url": url, "text": msg[:300], "ctype": "", "url": url}
        if self.cache:
            (self.cache / f"{h}.json").write_text(json.dumps(d))
        log.append(f"{d['status']} {url}")
        return d["status"], d["final_url"], d["text"], d["ctype"]

    def probe(self, cand: C) -> dict:
        key, name, url, dept, fallback = cand
        res = {"key": key, "name": name, "url": url, "dept": dept, "fallback_category": fallback,
               "status": None, "format": None, "listing": None, "detail_regex": None,
               "events": None, "address": None, "notes": "", "log": [], "wp": False, "plugins": []}
        log = res["log"]
        client = PoliteClient(delay=1.1, retries=0, timeout=20)
        try:
            self._probe(client, res, key, name, url, fallback, log)
        except Exception as e:  # never let one site kill the run
            res["status"] = res["status"] or "error"
            res["notes"] = f"probe error: {type(e).__name__}: {e}"[:300]
        finally:
            client.close()
        return res

    def _probe(self, client, res, key, name, url, fallback, log):
        p = urlparse(url)
        root = f"{p.scheme}://{p.netloc}"

        # 1. robots.txt (bare domain ↔ www. when the first one fails at DNS/TLS level)
        st, final, text, _ = self._get(client, root + "/robots.txt", log)
        if st in ("dns", "tls", "network"):
            host = p.netloc
            alt = host[4:] if host.startswith("www.") else "www." + host
            st2, final2, text2, _ = self._get(client, f"{p.scheme}://{alt}/robots.txt", log)
            if not isinstance(st2, str):
                url = url.replace(f"//{host}", f"//{alt}", 1)
                p = urlparse(url)
                root = f"{p.scheme}://{p.netloc}"
                res["url_used"] = url
                st, final, text = st2, final2, text2
        if isinstance(st, str):
            res["status"], res["notes"] = st, f"{st} error: {text[:120]}"
            return
        if st in (401, 403, 429) or (st == 503 and CHALLENGE_MARKERS.search(text or "")):
            res["status"], res["notes"] = "blocked", f"robots.txt → HTTP {st}" + (
                " (challenge)" if CHALLENGE_MARKERS.search(text or "") else "")
            return
        rp = None
        if st == 200 and "<html" not in (text or "")[:500].lower():
            rp = RobotFileParser()
            rp.parse((text or "").splitlines())
        final_root = f"{urlparse(final).scheme}://{urlparse(final).netloc}"
        if urlparse(final).netloc != p.netloc:
            root = final_root  # www / https redirect

        def allowed(u):
            return rp is None or rp.can_fetch(BOT_NAME, u)

        # 2. home / given page
        if not allowed(url):
            res["status"], res["notes"] = "robots", f"robots.txt disallows {url}"
            return
        st, final, home, ctype = self._get(client, url, log)
        if isinstance(st, str):
            res["status"], res["notes"] = st, f"{st} on page: {home[:120]}"
            return
        if st in (401, 403, 429) or (st >= 500 and CHALLENGE_MARKERS.search(home or "")):
            res["status"] = "blocked"
            res["notes"] = f"HTTP {st}" + (" + challenge page" if CHALLENGE_MARKERS.search(home or "") else "")
            return
        if st != 200:
            res["status"], res["notes"] = f"http_{st}", f"page → HTTP {st}"
            return
        fhost = urlparse(final).netloc
        if fhost != p.netloc and fhost.removeprefix("www.") != p.netloc.removeprefix("www."):
            res["notes"] = f"redirects to {fhost}. "
            root = f"{urlparse(final).scheme}://{fhost}"
        if CHALLENGE_MARKERS.search(home[:5000]) and len(home) < 20000:
            res["status"], res["notes"] = "blocked", "challenge page served with HTTP 200"
            return
        low = home.lower()
        res["wp"] = "wp-content" in low or "api.w.org" in low or "wp-json" in low
        plugins = []
        if "the-events-calendar" in low or "tribe-events" in low or "tribe_events" in low:
            plugins.append("tribe")
        if "events-manager" in low or "em-events" in low:
            plugins.append("events-manager")
        if "modern-events-calendar" in low or "mec-wrap" in low or "/mec-" in low:
            plugins.append("mec")
        res["plugins"] = plugins
        res["address"] = site_address(home)
        now = _now()

        def evaluate(kind, evs, listing, regex=None):
            s = summarize_events(evs)
            res["events"] = s
            res["format"], res["listing"], res["detail_regex"] = kind, listing, regex
            res["status"] = "ok" if s["upcoming"] else "empty"
            return bool(s["upcoming"])

        # 3. The Events Calendar REST (WordPress sites only)
        if res["wp"]:
            api = tribe_url(root, per_page=50)
            if allowed(api):
                st, _, body, ctype = self._get(client, api, log)
                data = None
                if st == 200 and "json" in (ctype or "") or (isinstance(body, str) and body[:1] == "{"):
                    try:
                        data = json.loads(body)
                    except ValueError:
                        data = None
                if is_tribe_payload(data):
                    v = _probe_venue(key, name, "tribe", fallback)
                    evs = parse_tribe_page(data, v, now=now)
                    if "tribe" not in plugins:
                        plugins.append("tribe")
                    total = data.get("total")
                    if evaluate("tribe", evs, api):
                        res["events"]["total"] = total
                        res["events"]["total_pages"] = data.get("total_pages")
                        return
                    res["notes"] += f"Tribe REST present, {total} upcoming. "
                elif st in (401, 403) and "tribe" in plugins:
                    res["notes"] += f"Tribe REST → HTTP {st}. "
            else:
                res["notes"] += "robots.txt disallows /wp-json/. "

        # 4. iCal feed linked from the page (Tribe ?ical=1, Events Manager, MEC, others)
        soup = BeautifulSoup(home, "html.parser")
        ics = []
        for a in soup.find_all(["a", "link"], href=True):
            if ICS_HREF.search(a["href"]):
                u = urljoin(final, a["href"].replace("webcal://", "https://"))
                if urlparse(u).netloc.removeprefix("www.") == urlparse(final).netloc.removeprefix("www.") \
                        and u not in ics:
                    ics.append(u)
        if not ics and "events-manager" in plugins:
            ics.append(root + EM_ICS_PATH)
        # 5. JSON-LD / microdata on the page itself
        v = _probe_venue(key, name, "jsonld", fallback)
        evs = parse_jsonld_page(home, final, v, now=now)
        if evs:
            # Event objects on the page: prefer an iCal feed only when it is richer.
            evaluate("jsonld", evs, final)
            if len(evs) >= 3 or not ics:
                return
        if ics and allowed(ics[0]):
            st, _, body, _ = self._get(client, ics[0], log)
            if st == 200 and "BEGIN:VCALENDAR" in (body or "")[:2000]:
                ev2 = parse_ics_feed(body, _probe_venue(key, name, "ics", fallback), now=now)
                if ev2 or not evs:
                    if evaluate("ics", ev2, ics[0]):
                        return
                    res["notes"] += "iCal feed has no upcoming event. "
            else:
                res["notes"] += f"iCal link {ics[0]} → {st}. "
        if evs:
            return

        # 6. agenda page → JSON-LD on it, or detail links → one detail page
        listing_html, listing_url = home, final
        links = [u for u in agenda_links(home, final) if u.rstrip("/") != final.rstrip("/")]
        prefix, details = detail_candidates(home, final)
        if not details and links:
            target = next((u for u in links if allowed(u)), None)
            if target:
                st, f2, body, _ = self._get(client, target, log)
                if st == 200 and body:
                    evs = parse_jsonld_page(body, f2, v, now=now)
                    if evs:
                        evaluate("jsonld", evs, f2)
                        return
                    listing_html, listing_url = body, f2
                    prefix, details = detail_candidates(body, f2)
                    if not details and JS_SHELL.search(body) and len(
                            BeautifulSoup(body, "html.parser").get_text(" ", strip=True)) < 800:
                        res["status"], res["notes"] = "js", res["notes"] + "agenda is JS-rendered. "
                        return
                elif st in (401, 403, 429):
                    res["status"], res["notes"] = "blocked", f"agenda → HTTP {st}"
                    return
        if details:
            targets = [u for u in details if allowed(u)]
            target = targets[0] if targets else None
            if target:
                st, f3, body, _ = self._get(client, target, log)
                if st == 200 and body and len(targets) > 2 and not parse_jsonld_page(
                        body, f3, _probe_venue(key, name, "jsonld_detail", fallback), now=now):
                    alt = targets[len(targets) // 2]
                    st_b, f3_b, body_b, _ = self._get(client, alt, log)
                    if st_b == 200 and body_b and (extract_jsonld(body_b) or "itemtype" in body_b):
                        target, st, f3, body = alt, st_b, f3_b, body_b
                if st == 200 and body:
                    vd = _probe_venue(key, name, "jsonld_detail", fallback)
                    evs = parse_jsonld_page(body, f3, vd, now=now)
                    host = re.escape(urlparse(listing_url).netloc)
                    regex = host + re.escape(prefix).replace("\\/", "/") + r"[^/?#]+/?$"
                    if evs:
                        evaluate("jsonld_detail", evs, listing_url, regex)
                        res["events"]["detail_links"] = len(details)
                        if not res["address"]:
                            res["address"] = site_address(body)
                        return
                    objs = extract_jsonld(body)
                    types = sorted({str(o.get("@type")) for o in objs if o.get("@type")})[:5]
                    has_past = any(True for _ in iter_events(objs)) or extract_microdata_events(body)
                    res["status"] = "empty" if has_past else "no_structured"
                    res["notes"] += (f"detail page {target} has "
                                     + ("only past or undated Events" if has_past else f"no Event (JSON-LD types: {types or 'none'})")
                                     + ". ")
                    return
        text_len = len(BeautifulSoup(listing_html, "html.parser").get_text(" ", strip=True))
        if JS_SHELL.search(listing_html) and text_len < 800:
            res["status"], res["notes"] = "js", res["notes"] + "JS-rendered page (no server-side events). "
            return
        objs = extract_jsonld(listing_html)
        types = sorted({str(o.get("@type")) for o in objs if o.get("@type")})[:5]
        res["status"] = res["status"] or "no_structured"
        res["notes"] += f"no Event data on {listing_url} (JSON-LD types: {types or 'none'}). "


# ───────────────────────────── config snippet ─────────────────────────────

def decide(res: dict) -> dict:
    """Enable decision + default venue for one probe result (no network)."""
    out = {"enabled": False, "default": None, "multi": False, "reason": ""}
    s = res.get("events") or {}
    if res.get("status") != "ok" or not s.get("upcoming"):
        out["reason"] = res.get("notes") or res.get("status")
        return out
    places = s.get("places") or []
    located = s.get("in_zone", 0)
    if s.get("out_zone", 0) and not located:
        out["reason"] = "events located outside 75/92/93/94"
        return out
    distinct = [p for p in places if p[2] and str(p[2])[:2] in SERVICE_DEPARTMENTS]
    if len({(p[0] or "").lower() for p in distinct}) > 1:
        out["multi"] = True  # several in-zone places: no fixed venue, events carry their own
    if distinct and not out["multi"]:
        n, a, z, c = distinct[0][:4]
        out["default"] = {"name": n or res["name"], "address": a, "zip": z, "city": c or "",
                          "lat": distinct[0][4], "lng": distinct[0][5], "from": "events"}
    elif not out["multi"] and res.get("address"):
        a = res["address"]
        out["default"] = {"name": res["name"], "address": a["address"], "zip": a["zip"],
                          "city": a.get("city") or "", "lat": None, "lng": None, "from": "site " + a["from"]}
    if out["default"] or (out["multi"] and located):
        out["enabled"] = True
    else:
        out["reason"] = "events have no usable location and no venue address found on the site"
    return out


def py(v) -> str:
    return repr(v)


def snippet(results: List[dict], geocode: bool = True) -> str:
    from utils.geocode import geocode_address

    lines = []
    for res in sorted(results, key=lambda r: r["key"]):
        d = decide(res)
        url = res.get("listing") or res["url"]
        kind = res.get("format") or "jsonld_detail"
        dv = "{}"
        if d["default"]:
            g = d["default"]
            lat, lng = g.get("lat"), g.get("lng")
            if geocode and (lat is None or lng is None) and g.get("address"):
                hit = geocode_address(g["address"], g["zip"], g.get("city"))
                if hit:
                    lat, lng = round(hit["lat"], 6), round(hit["lng"], 6)
                    g["city"] = hit.get("city") or g.get("city") or ""
            city = (g.get("city") or "Paris").strip()
            if city.lower().startswith("paris"):
                city = "Paris"
            dv = (f"_venue({py(g['name'])}, {py(g['address'])}, {py(g['zip'])}, {py(city)}, "
                  f"{py(lat)}, {py(lng)})")
            if lat is None:
                d["enabled"] = False
                d["reason"] = "venue address could not be geocoded (BAN)"
        s = res.get("events") or {}
        if d["enabled"]:
            note = (f"{kind}: {s.get('upcoming')} upcoming in probe "
                    f"({s.get('timed')} timed, {s.get('priced')} priced); "
                    + ("events carry their own venue" if d["multi"] else f"venue from {d['default']['from']}"))
        else:
            note = d["reason"].strip()
        args = [f"key={py(res['key'])}", f"name={py(res['name'])}", f"kind={py(kind)}", f"urls=[{py(url)}]"]
        if kind == "jsonld_detail" and res.get("detail_regex"):
            args.append(f"detail_link_regex=r{py(res['detail_regex'])}")
            args.append("max_details=20")
        if kind == "tribe":
            tp = s.get("total_pages") or 1
            args.append(f"max_pages={min(4, max(1, int(tp)))}")
        if dv != "{}":
            args.append(f"default_venue={dv}")
        if res.get("fallback_category"):
            args.append(f"fallback_category={py(res['fallback_category'])}")
        if res.get("fallback_category") == "concerts":
            args.append("max_span_days=2")
        args.append(f"enabled={d['enabled']}")
        args.append(f"notes={py(note[:300])}")
        lines.append(f"    VenueSource({', '.join(args)}),  # dept {res['dept']}")
    return "\n".join(lines)


# ───────────────────────────── CLI ─────────────────────────────

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, help="directory caching every HTTP response")
    ap.add_argument("--report", type=Path, required=True, help="JSON report (written, or read with --snippet)")
    ap.add_argument("--snippet", type=Path, help="write VenueSource entries from an existing report")
    ap.add_argument("--only", help="comma-separated candidate keys")
    ap.add_argument("--workers", type=int, default=12, help="sites probed in parallel (different hosts)")
    ap.add_argument("--max-new", type=int, default=4,
                    help="max uncached requests per site in this run (robots.txt + 3 probes)")
    ap.add_argument("--retry-from", type=Path,
                    help="previous report: only re-probe its sites that were not 'ok'")
    ap.add_argument("--list", action="store_true", help="print the candidate list and exit")
    args = ap.parse_args(argv)

    cands = all_candidates()
    if args.only:
        wanted = {k.strip() for k in args.only.split(",")}
        cands = [c for c in cands if c[0] in wanted]
    if args.list:
        for c in cands:
            print("\t".join(str(x) for x in c))
        print(f"{len(cands)} candidates")
        return 0

    if args.snippet:
        results = json.loads(args.report.read_text())
        args.snippet.write_text(snippet(results) + "\n")
        print(f"wrote {args.snippet}")
        return 0

    if args.cache:
        args.cache.mkdir(parents=True, exist_ok=True)
    prober = Prober(args.cache, max_new=args.max_new)
    previous = {}
    if args.retry_from:
        previous = {r["key"]: r for r in json.loads(args.retry_from.read_text())}
        cands = [c for c in cands if previous.get(c[0], {}).get("status") != "ok"]

    def run_group(group: List[C]) -> List[dict]:
        out = []
        for i, c in enumerate(group):
            if i:
                time.sleep(1.5)  # next probe on the same host: keep ≤ 1 req/s
            out.append(prober.probe(c))
        return out

    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = [pool.submit(run_group, g) for g in by_host(cands)]
        for f in as_completed(futs):
            for r in f.result():
                results.append(r)
                ev = r.get("events") or {}
                print(f"{r['key']:<24} {str(r['status']):<14} {str(r['format']):<14} "
                      f"{ev.get('upcoming', '-')!s:>4} {r['notes'][:90]}", flush=True)
    if previous:  # merge: keep the earlier 'ok' results
        done = {r["key"] for r in results}
        results += [r for k, r in previous.items() if k not in done]
    results.sort(key=lambda r: r["key"])
    args.report.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    by = Counter(r["status"] for r in results)
    print(f"\n{len(results)} sites probed: {dict(by)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
