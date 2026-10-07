"""
Venue registry for the generic structured-data spider (spiders/venues_structured.py).

Adding a venue = adding ONE VenueSource entry. Each entry becomes its own DB source,
named f"venue_{key}", so per-source stats work.

Kinds:
  - "jsonld"         schema.org Event objects embedded in the listing page(s) themselves.
  - "jsonld_detail"  collect event-detail links on the listing page(s) (regex on the
                     absolute URL), then read the JSON-LD of each detail page (capped).
  - "ics"            public iCalendar feed (e.g. WordPress "The Events Calendar": ?ical=1).
A "{page}" placeholder in a listing URL is expanded 1..max_pages.

Disabled entries document what was tried and why it does not work (for SOURCES.md).
Last live check of every entry: 2026-10-07 with the honest PanameClubBot UA.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class VenueSource:
    key: str
    name: str
    kind: str  # "jsonld" | "jsonld_detail" | "ics"
    urls: List[str] = field(default_factory=list)
    detail_link_regex: Optional[str] = None  # regex searched in absolute detail URLs
    max_pages: int = 1
    max_details: int = 30
    default_venue: Dict[str, object] = field(default_factory=dict)
    category_slug: Optional[str] = None  # forced category for every event
    category_map: Optional[Dict[str, str]] = None  # source label → our slug
    fallback_category: Optional[str] = None  # used only when detection finds nothing
    local_time_offsets: bool = False  # site writes Paris local time with a wrong "+00:00"/"Z"
    midnight_unknown: bool = True  # "T00:00" means "no time given"
    exclude_title_regex: Optional[str] = None
    max_span_days: Optional[int] = None  # drop events spanning longer (bogus ranges at concert venues)
    enabled: bool = True
    notes: str = ""

    @property
    def source(self) -> str:
        return f"venue_{self.key}"


def _venue(name: str, address: Optional[str], zip_code: Optional[str], city: str = "Paris",
           lat: Optional[float] = None, lng: Optional[float] = None) -> Dict[str, object]:
    return {
        "venue_name": name,
        "venue_address": address,
        "venue_zip": zip_code,
        "venue_city": city,
        "venue_lat": lat,
        "venue_lng": lng,
    }


def _off(key: str, name: str, url: str, notes: str, kind: str = "jsonld_detail") -> VenueSource:
    return VenueSource(key=key, name=name, kind=kind, urls=[url], enabled=False, notes=notes)


VENUES: List[VenueSource] = [
    # ───────────────────────────── enabled ─────────────────────────────
    VenueSource(
        key="bataclan", name="Bataclan", kind="jsonld_detail",
        urls=["https://www.bataclan.fr/"],
        detail_link_regex=r"bataclan\.fr/evenement/[^/?#]+/?$",
        default_venue=_venue("Bataclan", "50 Boulevard Voltaire", "75011"),
        fallback_category="concerts",
        max_span_days=2,
        notes="Nuxt site; Event JSON-LD (UTC 'Z' times) on /evenement/ pages. /agenda is 404, "
              "the home page lists the upcoming events.",
    ),
    VenueSource(
        key="olympia", name="L'Olympia", kind="jsonld_detail",
        urls=["https://www.olympiahall.com/"],
        detail_link_regex=r"olympiahall\.com/agenda/(?!page/|categorie/|category/)[^/?#]+/$",
        default_venue=_venue("L'Olympia", "28 Boulevard des Capucines", "75009"),
        fallback_category="concerts",
        max_span_days=2,
        notes="WordPress; Event JSON-LD with price, eventStatus (cancelled shows flagged). "
              "/agenda/ loads its list in JS → the home page is used as listing.",
    ),
    VenueSource(
        key="chatelet", name="Théâtre du Châtelet", kind="jsonld_detail",
        urls=["https://www.chatelet.com/programmation/"],
        detail_link_regex=r"chatelet\.com/programmation/\d\d-\d\d/[^/?#]+/$",
        max_details=25,
        default_venue=_venue("Théâtre du Châtelet", "1 Place du Châtelet", "75001"),
        local_time_offsets=True,
        notes="Event JSON-LD with one subEvent per performance. Times are Paris local time "
              "wrongly suffixed '+00:00' (page shows 11h00 for T11:00:00+00:00) → offset ignored.",
    ),
    VenueSource(
        key="lacigale", name="La Cigale", kind="jsonld_detail",
        urls=["https://lacigale.fr/programmation/"],
        detail_link_regex=r"lacigale\.fr/evenements/[^/?#]+/$",
        default_venue=_venue("La Cigale", "120 Boulevard de Rochechouart", "75018"),
        fallback_category="concerts",
        max_span_days=2,
        notes="WordPress; Event JSON-LD on /evenements/ detail pages (no location → default venue).",
    ),
    VenueSource(
        key="maisondelaradio", name="Maison de la Radio et de la Musique", kind="jsonld_detail",
        urls=["https://www.maisondelaradioetdelamusique.fr/agenda"],
        detail_link_regex=r"maisondelaradioetdelamusique\.fr/evenement/[^/?#]+",
        default_venue=_venue("Maison de la Radio et de la Musique",
                             "116 Avenue du Président Kennedy", "75016"),
        fallback_category="concerts",
        notes="MusicEvent JSON-LD on /evenement/ pages (hall name in location).",
    ),
    VenueSource(
        key="orangerie", name="Musée de l'Orangerie", kind="jsonld_detail",
        urls=["https://www.musee-orangerie.fr/fr/programme/agenda"],
        detail_link_regex=r"musee-orangerie\.fr/fr/programme/agenda/[a-z0-9-]+/[^/?#]+$",
        max_details=20,
        default_venue=_venue("Musée de l'Orangerie", "Jardin des Tuileries", "75001"),
        # TV broadcasts / online content listed in the agenda are not on-site events.
        exclude_title_regex=r"^\s*(documentaire|podcast|en ligne)\b",
        fallback_category="visites",
        notes="Drupal; Event JSON-LD on detail pages, startDate malformed "
              "('2026-10-11T17:50:00+0200T00:00-00:00') → sanitized to its ISO prefix.",
    ),
    VenueSource(
        key="comedyclub", name="Le Comedy Club", kind="ics",
        urls=["https://lecomedyclub.com/evenements/?ical=1"],
        default_venue=_venue("Le Comedy Club", "42 Boulevard de Bonne Nouvelle", "75010"),
        category_slug="spectacles",
        max_span_days=2,
        notes="WordPress The Events Calendar iCal export (also JSON-LD on detail pages).",
    ),
    VenueSource(
        key="theatreatelier", name="Théâtre de l'Atelier", kind="ics",
        urls=["https://www.theatre-atelier.com/events/?ical=1"],
        default_venue=_venue("Théâtre de l'Atelier", "1 Place Charles Dullin", "75018"),
        fallback_category="theatre",
        enabled=False,
        notes="The Events Calendar ?ical=1 returns an empty body (no upcoming events published "
              "there; the only detail page seen dates from 2023).",
    ),
    VenueSource(
        key="sunsetsunside", name="Sunset-Sunside", kind="ics",
        urls=["https://www.sunset-sunside.com/concerts/?ical=1"],
        default_venue=_venue("Sunset-Sunside", "60 Rue des Lombards", "75001"),
        category_slug="concerts",
        max_span_days=2,
        notes="WordPress The Events Calendar iCal export (linked from the site). Slow server.",
    ),

    # ───────────────────────────── disabled ─────────────────────────────
    _off("philharmonie", "Philharmonie de Paris / Cité de la musique",
         "https://philharmoniedeparis.fr/fr/agenda",
         "agenda is JS-rendered (no event links, no JSON-LD in HTML)"),
    _off("pompidou", "Centre Pompidou", "https://www.centrepompidou.fr/fr/programme/agenda",
         "Event JSON-LD on detail pages but location has no name/address; building closed for "
         "works (2025-2030) and events are hosted elsewhere → venue cannot be set reliably"),
    _off("theatredelaville", "Théâtre de la Ville", "https://www.theatredelaville-paris.com/fr",
         "no Event JSON-LD / iCal found (only Article JSON-LD)"),
    _off("villette", "La Villette", "https://lavillette.com/programmation/",
         "robots.txt disallows /programmation/ for our bot"),
    _off("centquatre", "Le Centquatre-Paris (104)", "https://www.104.fr/",
         "Nuxt JS-rendered agenda, no JSON-LD; /fr/programmation refused connection"),
    _off("forumdesimages", "Forum des images", "https://www.forumdesimages.fr/",
         "no JSON-LD / iCal on home or listing"),
    _off("cinematheque", "Cinémathèque française", "https://www.cinematheque.fr/calendrier.html",
         "séance pages (seance/NNN.html) have no JSON-LD; would need an HTML parser"),
    _off("bnf", "Bibliothèque nationale de France", "https://www.bnf.fr/fr/agenda",
         "no JSON-LD on listing or detail pages"),
    _off("ima", "Institut du monde arabe", "https://www.imarabe.org/fr/agenda",
         "only Article/WebPage JSON-LD, no Event"),
    _off("orsay", "Musée d'Orsay", "https://www.musee-orsay.fr/fr/agenda",
         "HTTP 403 + challenge page to the bot UA"),
    _off("palaisdetokyo", "Palais de Tokyo", "https://palaisdetokyo.com/",
         "no JSON-LD; /programmation/ 404"),
    _off("fondationcartier", "Fondation Cartier", "https://www.fondationcartier.com/",
         "no JSON-LD on exhibition pages"),
    _off("gaitelyrique", "La Gaîté Lyrique", "https://www.gaite-lyrique.net/agenda/",
         "no JSON-LD, no per-event links in listing HTML"),
    _off("petitbain", "Petit Bain", "https://petitbain.org/agenda/",
         "WordPress, but detail pages only carry WebPage JSON-LD (no Event, no iCal)"),
    _off("trianon", "Le Trianon", "https://www.letrianon.fr/fr/programmation/",
         "detail pages only carry WebPage JSON-LD"),
    _off("ducdeslombards", "Duc des Lombards", "https://ducdeslombards.com/fr/l-agenda",
         "no Event JSON-LD (only Article)"),
    _off("groundcontrol", "Ground Control", "https://www.groundcontrolparis.com/programmation/",
         "detail pages only carry WebPage JSON-LD"),
    _off("quaibranly", "Musée du quai Branly", "https://www.quaibranly.fr/fr/agenda",
         "no JSON-LD on listing or detail pages"),
    _off("grandpalais", "Grand Palais", "https://www.grandpalais.fr/fr/programme",
         "TLS handshake fails (TLSV1_ALERT_PROTOCOL_VERSION) with our client"),
    _off("opera", "Opéra national de Paris", "https://www.operadeparis.fr/programmation",
         "no Event JSON-LD (only WebPage)"),
    _off("comediefrancaise", "Comédie-Française", "https://www.comedie-francaise.fr/fr/",
         "returns HTTP 404 pages to the bot UA, no JSON-LD"),
    _off("maisondelapoesie", "Maison de la Poésie", "https://maisondelapoesieparis.com/programme/",
         "detail pages only carry WebPage JSON-LD (Yoast)"),
    _off("maroquinerie", "La Maroquinerie", "https://www.lamaroquinerie.fr/fr/agenda",
         "robots.txt disallows the agenda for our bot"),
    _off("pointephemere", "Point Éphémère", "https://www.pointephemere.org/agenda",
         "no JSON-LD on listing or /event/ pages"),
    _off("fgobarbara", "FGO-Barbara", "https://fgo-barbara.fr/",
         "/agenda 404, no Event JSON-LD"),
    _off("hasardludique", "Le Hasard Ludique", "https://www.lehasardludique.paris/agenda",
         "HTTP 500 on agenda"),
    _off("machine", "La Machine du Moulin Rouge", "https://www.lamachinedumoulinrouge.com/agenda/",
         "detail pages only carry WebPage JSON-LD (ticketing via Shotgun → shotgun spider)"),
    _off("cafedeladanse", "Café de la Danse", "https://www.cafedeladanse.com/programmation/",
         "no JSON-LD"),
    _off("panpiper", "Le Pan Piper", "https://www.lepanpiper.com/agenda",
         "domain does not resolve"),
    _off("rondpoint", "Théâtre du Rond-Point", "https://www.theatredurondpoint.fr/",
         "Nuxt JS-rendered, no JSON-LD"),
    _off("bouffesdunord", "Théâtre des Bouffes du Nord", "https://www.bouffesdunord.com/fr/la-saison",
         "JS-rendered (14 KB shell), no JSON-LD"),
    _off("odeon", "Odéon-Théâtre de l'Europe", "https://www.theatre-odeon.eu/fr",
         "only Organization JSON-LD; /fr/saison timed out"),
    _off("colline", "La Colline – théâtre national", "https://www.colline.fr/spectacles",
         "no JSON-LD on listing or detail pages"),
    _off("mad", "Musée des Arts Décoratifs", "https://madparis.fr/",
         "no JSON-LD; /agenda 404"),
    _off("flv", "Fondation Louis Vuitton", "https://www.fondationlouisvuitton.fr/fr/programme",
         "HTTP 403 to the bot UA (robots.txt too)"),
    _off("boursedecommerce", "Bourse de Commerce – Pinault Collection",
         "https://www.pinaultcollection.com/fr/boursedecommerce", "no JSON-LD"),
    _off("louvre", "Musée du Louvre", "https://www.louvre.fr/expositions-et-evenements",
         "Next.js, no JSON-LD in HTML"),
    _off("petitpalais", "Petit Palais", "https://www.petitpalais.paris.fr/decouvrir-la-programmation/expositions",
         "no JSON-LD on exhibition pages (Paris Musées → parismusees spider)"),
    _off("picasso", "Musée national Picasso-Paris", "https://www.museepicassoparis.fr/fr/agenda/",
         "detail pages only carry WebPage JSON-LD"),
    _off("citesciences", "Cité des sciences et de l'industrie", "https://www.cite-sciences.fr/fr/au-programme",
         "TYPO3, no JSON-LD"),
    _off("pleyel", "Salle Pleyel", "https://www.sallepleyel.com/concerts-spectacles/",
         "detail pages only carry WebPage JSON-LD"),
    _off("tce", "Théâtre des Champs-Élysées", "https://www.theatrechampselysees.fr/",
         "no JSON-LD on show pages"),
    _off("lascala", "La Scala Paris", "https://lascala-paris.fr/programmation/",
         "detail pages only carry WebPage JSON-LD"),
    _off("balblomet", "Le Bal Blomet", "https://www.balblomet.fr/agenda/",
         "detail pages only carry WebPage JSON-LD (2 MB pages)"),
    # extra venues checked
    _off("elyseemontmartre", "Élysée Montmartre", "https://www.elyseemontmartre.com/fr/",
         "detail pages only carry WebPage JSON-LD"),
    _off("accorarena", "Accor Arena", "https://www.accorarena.com/fr",
         "no JSON-LD on /programmation/ pages"),
    _off("adidasarena", "Adidas Arena", "https://www.adidasarena.com/",
         "no JSON-LD on /programmation/ pages"),
    _off("trabendo", "Le Trabendo", "https://www.letrabendo.net/",
         "detail pages only carry WebPage JSON-LD"),
    _off("bellevilloise", "La Bellevilloise", "https://www.labellevilloise.com/",
         "detail pages only carry WebPage JSON-LD"),
    _off("theatredeparis", "Théâtre de Paris", "https://www.theatredeparis.com/",
         "detail pages only carry WebPage JSON-LD"),
    _off("montparnasse", "Théâtre Montparnasse", "https://www.theatremontparnasse.com/",
         "no Event JSON-LD"),
    _off("marigny", "Théâtre Marigny", "https://www.theatremarigny.fr/",
         "no Event JSON-LD"),
    _off("zenith", "Zénith Paris – La Villette", "https://le-zenith.com/",
         "no JSON-LD on home/listing (not investigated further)"),
    _off("casinodeparis", "Casino de Paris", "https://www.casinodeparis.fr/fr",
         "JS-rendered, no event links / JSON-LD"),
    _off("foliesbergere", "Folies Bergère", "https://www.foliesbergere.com/fr",
         "JS-rendered, no event links / JSON-LD"),
    _off("bobino", "Bobino", "https://bobino.fr/", "JS-rendered, no event links / JSON-LD"),
    _off("seinemusicale", "La Seine Musicale", "https://www.laseinemusicale.com/",
         "JS-rendered, no event links / JSON-LD"),
    _off("gaveau", "Salle Gaveau", "https://sallegaveau.com/", "no event links / JSON-LD"),
    _off("grandrex", "Le Grand Rex", "https://www.legrandrex.com/", "no event links / JSON-LD"),
    _off("mogador", "Théâtre Mogador", "https://www.theatremogador.com/",
         "redirects to stage-entertainment.fr, no JSON-LD"),
    _off("pointvirgule", "Le Point Virgule", "https://www.lepointvirgule.com/", "timed out"),
    _off("cafedelagare", "Café de la Gare", "https://www.cafe-de-la-gare.fr/",
         "no event links / JSON-LD"),
    _off("defensearena", "Paris La Défense Arena", "https://www.parisladefense-arena.com/",
         "TLS handshake fails (TLSV1_ALERT_PROTOCOL_VERSION)"),
    _off("jacquemartandre", "Musée Jacquemart-André", "https://www.musee-jacquemart-andre.com/fr",
         "no event links / JSON-LD"),
    _off("marmottan", "Musée Marmottan Monet", "https://www.marmottan.fr/",
         "no event links / JSON-LD"),
]

VENUES_BY_KEY: Dict[str, VenueSource] = {v.key: v for v in VENUES}
assert len(VENUES_BY_KEY) == len(VENUES), "duplicate venue key"
