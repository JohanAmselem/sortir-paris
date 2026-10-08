"""
Venue registry for the generic structured-data spider (spiders/venues_structured.py).

Adding a venue = adding ONE VenueSource entry. Each entry becomes its own DB source,
named f"venue_{key}", so per-source stats work.

Kinds:
  - "jsonld"         schema.org Event objects embedded in the listing page(s) themselves.
  - "jsonld_detail"  collect event-detail links on the listing page(s) (regex on the
                     absolute URL), then read the JSON-LD of each detail page (capped).
  - "ics"            public iCalendar feed (e.g. WordPress "The Events Calendar": ?ical=1).
  - "tribe"          WordPress "The Events Calendar" REST API (utils/wp_events.py):
                     urls[0] = {root}/wp-json/tribe/events/v1/events?start_date=now&per_page=50,
                     follows next_rest_url up to max_pages.
JSON-LD kinds fall back to schema.org microdata when a page has no JSON-LD Event;
"jsonld_detail" also follows the URLs of a JSON-LD ItemList on the listing.
A "{page}" placeholder in a listing URL is expanded 1..max_pages.

Two lists:
  VENUES             hand-curated entries (checked 2026-10-07; each enabled one has fixtures).
  DISCOVERED_VENUES  written from the probe report of tools/discover_venues.py (2026-10-09).
ALL_VENUES = VENUES + DISCOVERED_VENUES is what the spider runs.

Disabled entries document what was tried and why it does not work (for SOURCES.md).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class VenueSource:
    key: str
    name: str
    kind: str  # "jsonld" | "jsonld_detail" | "ics" | "tribe"
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
    noon_unknown: bool = False  # "12:00" local is the site's placeholder for "no time given"
    exclude_title_regex: Optional[str] = None
    max_span_days: Optional[int] = None  # drop events spanning longer (bogus ranges at concert venues)
    single_site: bool = False  # a location without address is a room of default_venue
    require_location: bool = False  # drop events whose place is unknown or outside 75/92/93/94
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
    _off("petitbain", "Petit Bain", "https://petitbain.org/agenda/",
         "WordPress, but detail pages only carry WebPage JSON-LD (no Event, no iCal)"),
    _off("trianon", "Le Trianon", "https://www.letrianon.fr/fr/programmation/",
         "detail pages only carry WebPage JSON-LD"),
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
    _off("casinodeparis", "Casino de Paris", "https://www.casinodeparis.fr/fr",
         "JS-rendered, no event links / JSON-LD"),
    _off("foliesbergere", "Folies Bergère", "https://www.foliesbergere.com/fr",
         "JS-rendered, no event links / JSON-LD"),
    _off("bobino", "Bobino", "https://bobino.fr/",
         "JS-rendered agenda; the only Event JSON-LD (/event-pro/) is a gift card dated 2030 (re-probed 2026-10-09)"),
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

# ───────────────────── discovered (tools/discover_venues.py) ─────────────────────
DISCOVERED_VENUES: List[VenueSource] = [
    # ───────────── enabled (probe 2026-10-09 + verified with a full spider run) ─────────────
    # The Events Calendar REST API
    VenueSource(
        key="nouvelleseine", name="La Nouvelle Seine", kind="tribe",
        urls=["https://lanouvelleseine.com/wp-json/tribe/events/v1/events?start_date=now&per_page=50"],
        max_pages=4,
        default_venue=_venue("Théâtre La Nouvelle Seine", "3 Quai de Montebello", "75005", "Paris",
                             48.851482, 2.349954),
        fallback_category="spectacles", max_span_days=2,
        notes="Tribe REST: venue + geo on every event, ~190 upcoming (4 pages of 50).",
    ),
    VenueSource(
        key="bizzart", name="Le Bizz'Art", kind="tribe",
        urls=["https://www.bizzartclub.com/wp-json/tribe/events/v1/events?start_date=now&per_page=50"],
        default_venue=_venue("Le Bizz'Art", "167 Quai de Valmy", "75010", "Paris", 48.879071, 2.366468),
        fallback_category="concerts", max_span_days=2,
        notes="Tribe REST; events have no venue → fixed address from the site footer.",
    ),
    VenueSource(
        key="exploradome", name="Exploradôme", kind="tribe",
        urls=["https://www.exploradome.fr/wp-json/tribe/events/v1/events?start_date=now&per_page=50"],
        max_pages=2,
        default_venue=_venue("Exploradôme", "18 avenue Henri Barbusse", "94400", "Vitry-sur-Seine",
                             48.793026, 2.393151),
        fallback_category="ateliers", max_span_days=2,
        notes="Tribe REST with prices; one entry per workshop slot. Fixed address from the site.",
    ),
    VenueSource(
        key="regardducygne", name="Le Regard du Cygne", kind="tribe",
        urls=["https://www.leregarducygne.com/wp-json/tribe/events/v1/events?start_date=now&per_page=50"],
        max_pages=2,
        default_venue=_venue("Le Regard du Cygne", "210 rue de Belleville", "75020", "Paris",
                             48.875163, 2.395132),
        single_site=True,
        exclude_title_regex=r"^\s*(cours|stage)\b|r[ée]gie|r[ée]sidence",
        fallback_category="danse",
        notes="Tribe REST; weekly classes / technical residencies excluded, venue = rooms of the studio.",
    ),
    # iCal
    VenueSource(
        key="tam", name="Théâtre André Malraux – Rueil-Malmaison", kind="ics",
        urls=["https://www.tam.fr/events.ics"],
        require_location=True,
        notes="Events Manager iCal feed (/events.ics) with LOCATION + GEO for the city's halls "
              "(TAM, Cabaret Ariel…); events without a location are dropped. robots.txt "
              "disallows /wp-json/.",
    ),
    # JSON-LD on the listing page itself
    VenueSource(
        key="amandiers", name="Théâtre Nanterre-Amandiers", kind="jsonld",
        urls=["https://www.nanterre-amandiers.com/"],
        default_venue=_venue("Théâtre Nanterre-Amandiers", "7 avenue Pablo Picasso", "92000", "Nanterre",
                             48.893057, 2.214021),
        fallback_category="theatre",
        notes="Event JSON-LD (with address) on the home page.",
    ),
    VenueSource(
        key="leuropeen", name="L'Européen", kind="jsonld",
        urls=["https://welcome.leuropeen.paris/"],
        default_venue=_venue("L'Européen", "5 rue Biot", "75017", "Paris", 48.883969, 2.326383),
        fallback_category="spectacles", max_span_days=2,
        local_time_offsets=True,
        notes="Event JSON-LD on the home page (no location → fixed address from the site). "
              "Times are Paris local time wrongly suffixed '+00:00' (page: 'LE 9 Oct 2026 à 19h30' "
              "for T19:30:00+00:00) → offset ignored.",
    ),
    VenueSource(
        key="gaitelyrique", name="La Gaîté Lyrique", kind="jsonld",
        urls=["https://www.gaite-lyrique.net/agenda/"],
        default_venue=_venue("La Gaîté Lyrique", "3 bis rue Papin", "75003", "Paris", 48.866831, 2.353591),
        single_site=True,
        exclude_title_regex=r"distributions? alimentaires?",
        notes="Event JSON-LD on /agenda/ (location = room name: Audito, Forum…). The pages fetched "
              "do not print the street address: public address of the venue, BAN-geocoded. "
              "Rejected on 2026-10-07 (only the home page had been checked).",
    ),
    VenueSource(
        key="varietes", name="Théâtre des Variétés", kind="jsonld",
        urls=["https://www.theatredesvarietes.fr/"],
        default_venue=_venue("Théâtre des Variétés", "7 Boulevard Montmartre", "75002", "Paris",
                             48.871471, 2.342142),
        fallback_category="theatre",
        notes="Event JSON-LD (run dates) on the home page; fixed address from the site.",
    ),
    # JSON-LD on detail pages
    VenueSource(
        key="38riv", name="Le 38 Riv'", kind="jsonld_detail",
        urls=["https://38riv.com/concerts"],
        detail_link_regex=r"38riv\.com/concerts/[^/?#]+$",
        default_venue=_venue("38Riv", "38 Rue de Rivoli", "75004", "Paris", 48.856427, 2.356483),
        fallback_category="concerts", max_span_days=2,
        notes="Drupal; Event JSON-LD with address and price on /concerts/ pages.",
    ),
    VenueSource(
        key="alimentationgenerale", name="L'Alimentation Générale", kind="jsonld_detail",
        urls=["https://www.alimentation-generale.net/"],
        detail_link_regex=r"alimentation-generale\.net/events/[^/?#]+/?$",
        max_details=20,
        default_venue=_venue("L'Alimentation Générale", "64 Rue Jean-Pierre Timbaud", "75011", "Paris",
                             48.866835, 2.374395),
        fallback_category="concerts", max_span_days=2,
        notes="Wix events; Event JSON-LD on /events/ pages (location name 'Paris' → fixed venue).",
    ),
    VenueSource(
        key="carreaudutemple", name="Le Carreau du Temple", kind="jsonld_detail",
        urls=["https://www.lecarreaudutemple.eu/"],
        detail_link_regex=r"lecarreaudutemple\.eu/evenements/[^/?#]+/?$",
        default_venue=_venue("Le Carreau du Temple", "2 Rue Perrée", "75003", "Paris", 48.864085, 2.362635),
        notes="Event JSON-LD with address on /evenements/ pages.",
    ),
    VenueSource(
        key="centquatre", name="Le Centquatre-Paris (104)", kind="jsonld_detail",
        urls=["https://www.104.fr/"],
        detail_link_regex=r"104\.fr/fr/programmation/saison-[^/]+/[^/]+/[^/?#]+/?$",
        default_venue=_venue("Le CENTQUATRE-PARIS", "5 Rue Curial", "75019", "Paris", 48.889983, 2.371506),
        notes="Event JSON-LD on season detail pages linked from the home page (the agenda "
              "itself is JS-rendered). Address from the site's Organization JSON-LD.",
    ),
    VenueSource(
        key="chaillot", name="Chaillot – Théâtre national de la Danse", kind="jsonld_detail",
        urls=["https://theatre-chaillot.fr/fr"],
        detail_link_regex=r"theatre-chaillot\.fr/fr/programmation/\d{4}-\d{4}/[^/?#]+/?$",
        default_venue=_venue("Chaillot – Théâtre national de la Danse", "1 place du Trocadéro", "75116",
                             "Paris", 48.862412, 2.282002),
        fallback_category="danse",
        notes="Event JSON-LD with address + geo on season pages.",
    ),
    VenueSource(
        key="damedecanton", name="La Dame de Canton", kind="jsonld_detail",
        urls=["https://www.damedecanton.com/event-list"],
        detail_link_regex=r"damedecanton\.com/event-details/[^/?#]+/?$",
        max_details=20,
        default_venue=_venue("La Dame de Canton", "5 Port de la Gare", "75013", "Paris", 48.834914, 2.377237),
        fallback_category="concerts", max_span_days=2,
        notes="Wix events; Event JSON-LD on /event-details/ pages (address string, name 'Paris').",
    ),
    VenueSource(
        key="ducdeslombards", name="Duc des Lombards", kind="jsonld_detail",
        urls=["https://ducdeslombards.com/fr/l-agenda"],
        detail_link_regex=r"ducdeslombards\.com/fr/l-agenda/[^/?#]+$",
        default_venue=_venue("Le Duc des Lombards", "42 rue des Lombards", "75001", "Paris", 48.85968, 2.348567),
        category_slug="concerts", max_span_days=2,
        notes="Event JSON-LD on agenda detail pages (rejected on 2026-10-07: only the listing was checked).",
    ),
    VenueSource(
        key="fgobarbara", name="FGO-Barbara", kind="jsonld_detail",
        urls=["https://fgo-barbara.fr/"],
        detail_link_regex=r"fgo-barbara\.fr/programmation/[^/?#]+/?$",
        default_venue=_venue("FGO-Barbara", "1 rue Fleury", "75018", "Paris", 48.884338, 2.354046),
        category_slug="concerts", max_span_days=2,
        notes="Event JSON-LD on /programmation/ detail pages.",
    ),
    VenueSource(
        key="gemeaux", name="Les Gémeaux – Sceaux", kind="jsonld_detail",
        urls=["https://www.lesgemeaux.com/"],
        detail_link_regex=r"lesgemeaux\.com/spectacles/[^/?#]+/?$",
        default_venue=_venue("Théâtre Les Gémeaux", "49 avenue Georges Clemenceau", "92330", "Sceaux",
                             48.7839, 2.306475),
        notes="Event JSON-LD with address on /spectacles/ pages (many pages are past shows).",
    ),
    VenueSource(
        key="lafayetteanticipations", name="Lafayette Anticipations", kind="jsonld_detail",
        urls=["https://www.lafayetteanticipations.com/fr"],
        detail_link_regex=r"lafayetteanticipations\.com/fr/exposition/[^/?#]+/?$",
        default_venue=_venue("Lafayette Anticipations", "9 rue du Plâtre", "75004", "Paris",
                             48.859198, 2.354842),
        fallback_category="expos",
        notes="Event JSON-LD on exhibition pages.",
    ),
    VenueSource(
        key="le360", name="Le 360 Paris Music Factory", kind="jsonld_detail",
        urls=["https://le360paris.com/"],
        detail_link_regex=r"le360paris\.com/evenement/[^/?#]+/?$",
        default_venue=_venue("Le 360 Paris Music Factory", "32 rue Myrha", "75018", "Paris", 48.88719, 2.353712),
        fallback_category="concerts", max_span_days=2,
        notes="Event JSON-LD with address on /evenement/ pages.",
    ),
    VenueSource(
        key="mahj", name="Musée d'art et d'histoire du Judaïsme", kind="jsonld_detail",
        urls=["https://www.mahj.org/fr"],
        detail_link_regex=r"mahj\.org/fr/programme/[^/?#]+/?$",
        default_venue=_venue("Musée d'Art et d'Histoire du Judaïsme", "71 rue du Temple", "75003", "Paris",
                             48.860956, 2.355617),
        fallback_category="expos",
        notes="Event JSON-LD with address on /programme/ pages.",
    ),
    VenueSource(
        key="nouveautes", name="Théâtre des Nouveautés", kind="jsonld_detail",
        urls=["https://www.theatredesnouveautes.fr/"],
        detail_link_regex=r"theatredesnouveautes\.fr/spectacles/[^/?#]+/?$",
        default_venue=_venue("Théâtre des Nouveautés", "24 boulevard Poissonnière", "75009", "Paris",
                             48.871361, 2.344899),
        fallback_category="theatre",
        notes="Event JSON-LD (run dates, no time) on /spectacles/ pages.",
    ),
    VenueSource(
        key="odeon", name="Odéon-Théâtre de l'Europe", kind="jsonld_detail",
        urls=["https://www.theatre-odeon.eu/fr"],
        detail_link_regex=r"theatre-odeon\.eu/fr/saison-\d{4}-\d{4}/spectacles-\d{4}-\d{4}/[^/?#]+/?$",
        default_venue=_venue("Odéon-Théâtre de l'Europe", "2 rue Corneille", "75006", "Paris",
                             48.849507, 2.338952),
        require_location=True,
        fallback_category="theatre",
        notes="Event JSON-LD on season pages; shows at the Ateliers Berthier (17e, location "
              "without address) are dropped rather than placed at the Odéon.",
    ),
    VenueSource(
        key="operacomique", name="Opéra Comique", kind="jsonld_detail",
        urls=["https://www.opera-comique.com/fr"],
        detail_link_regex=r"opera-comique\.com/fr/spectacles/[^/?#]+/?$",
        default_venue=_venue("Théâtre National de l'Opéra Comique", "1 place Boieldieu", "75002", "Paris",
                             48.870671, 2.337655),
        fallback_category="concerts",
        notes="Event JSON-LD with one Event per performance and address.",
    ),
    VenueSource(
        key="pleyel", name="Salle Pleyel", kind="jsonld_detail",
        urls=["https://www.sallepleyel.com/concerts-spectacles/"],
        detail_link_regex=r"sallepleyel\.com/evenement/[^/?#]+/?$",
        max_details=12,
        default_venue=_venue("Salle Pleyel", "252 Rue du Faubourg Saint-Honoré", "75008", "Paris",
                             48.87695, 2.30101),
        fallback_category="concerts", max_span_days=2,
        notes="Event JSON-LD (no location) on some /evenement/ pages; fixed address.",
    ),
    VenueSource(
        key="seinemusicale", name="La Seine Musicale", kind="jsonld_detail",
        urls=["https://www.laseinemusicale.com/programmation/"],
        detail_link_regex=r"laseinemusicale\.com/spectacles-concerts/[^/?#]+/?$",
        default_venue=_venue("La Seine Musicale", "Île Seguin", "92100", "Boulogne-Billancourt",
                             48.827913, 2.234963),
        fallback_category="concerts",
        notes="Event JSON-LD with address on /spectacles-concerts/ pages linked from /programmation/.",
    ),
    VenueSource(
        key="studiohebertot", name="Studio Hébertot", kind="jsonld_detail",
        urls=["https://studiohebertot.com/"],
        detail_link_regex=r"studiohebertot\.com/spectacles/[^/?#]+/?$",
        default_venue=_venue("Studio Hébertot", "78 bis Boulevard des Batignolles", "75017", "Paris",
                             48.882013, 2.318984),
        fallback_category="theatre",
        notes="Event JSON-LD (run dates) on /spectacles/ pages.",
    ),
    VenueSource(
        key="theatrebelleville", name="Théâtre de Belleville", kind="jsonld_detail",
        urls=["https://www.theatredebelleville.com/"],
        detail_link_regex=r"theatredebelleville\.com/programmation/(a-venir/|a-laffiche/)?[^/?#]+$",
        max_details=20,
        default_venue=_venue("Théâtre de Belleville", "16 passage Piver", "75011", "Paris", 48.8709, 2.374281),
        fallback_category="theatre",
        noon_unknown=True,
        notes="One Event JSON-LD per performance (address + geo) on /programmation/ pages. Most "
              "performances are written T12:00+02:00 while the page shows 19h / 21h15 / 15h → 12:00 "
              "is a placeholder: date kept, time unknown.",
    ),
    VenueSource(
        key="theatredelopprime", name="Théâtre de l'Opprimé", kind="jsonld_detail",
        urls=["https://www.theatredelopprime.com/"],
        detail_link_regex=r"theatredelopprime\.com/d-tails-et-inscription/[^/?#]+/?$",
        default_venue=_venue("Théâtre de l'Opprimé", "78 Rue du Charolais", "75012", "Paris",
                             48.843084, 2.38305),
        fallback_category="theatre",
        notes="Wix events; Event JSON-LD with address string.",
    ),
    VenueSource(
        key="theatrefontaine", name="Théâtre Fontaine", kind="jsonld_detail",
        urls=["https://www.theatrefontaine.com/"],
        detail_link_regex=r"theatrefontaine\.com/spectacles/[^/?#]+/?$",
        default_venue=_venue("Théâtre Fontaine", "10 rue Pierre Fontaine", "75009", "Paris",
                             48.880994, 2.334749),
        fallback_category="theatre",
        notes="Event JSON-LD (run dates) on /spectacles/ pages.",
    ),
    VenueSource(
        key="troisbaudets", name="Les Trois Baudets", kind="jsonld_detail",
        urls=["https://lestroisbaudets.com/l-agenda"],
        detail_link_regex=r"lestroisbaudets\.com/l-agenda/[^/?#]+$",
        default_venue=_venue("Les Trois Baudets", "64 Boulevard de Clichy", "75018", "Paris",
                             48.883457, 2.334465),
        fallback_category="concerts", max_span_days=2,
        notes="Event JSON-LD on agenda detail pages (location address = name → fixed address).",
    ),
    VenueSource(
        key="zenith", name="Zénith Paris – La Villette", kind="jsonld_detail",
        urls=["https://le-zenith.com/"],
        detail_link_regex=r"le-zenith\.com/shows/[^/?#]+/?$",
        max_details=40,
        default_venue=_venue("Zénith Paris - La Villette", "211 avenue Jean Jaurès", "75019", "Paris",
                             48.888952, 2.392454),
        fallback_category="concerts", max_span_days=2,
        notes="Event JSON-LD with address on /shows/ pages (~110 linked from the home page).",
    ),

    # ───────────── disabled: probed by tools/discover_venues.py on 2026-10-09 ─────────────
    # (robots.txt + at most 3 probe requests per site; regenerate with --snippet)
    _off('africolor', 'Africolor', 'https://www.africolor.com/',
         'probe 2026-10-09: detail page https://www.africolor.com/festival/actions-culturelles/ has no Event (JSON-LD types: none).'),  # 93
    _off('akteon', 'Akteon Théâtre', 'https://www.akteon.fr/',
         'probe 2026-10-09: no Event data on https://www.akteon.fr/ (JSON-LD types: none).'),  # 75
    _off('albertkahn', 'Musée départemental Albert-Kahn', 'https://albert-kahn.hauts-de-seine.fr/',
         'probe 2026-10-09: detail page https://albert-kahn.hauts-de-seine.fr/agenda/detail/visite-saisonniere-automne-au-japon has no Event (JSON-LD types: none).'),  # 92
    _off('alhambra', "L'Alhambra", 'https://www.alhambra-paris.com/',
         'probe 2026-10-09: no Event data on https://www.alhambra-paris.com/spectacle-musical-loc1623.html (JSON-LD types: none).'),  # 75
    _off('amarres', 'Les Amarres', 'https://www.lesamarres.paris/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('antoinevitez', 'Théâtre Antoine Vitez – Ivry', 'https://www.theatre-antoinevitez.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 94
    _off('apollotheatre', 'Apollo Théâtre', 'https://www.apollotheatre.fr/',
         'probe 2026-10-09: no Event data on https://www.apollotheatre.fr/nos-spectacles-l.html (JSON-LD types: none).'),  # 75
    _off('aquarium', "Théâtre de l'Aquarium", 'https://www.theatredelaquarium.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('archipel', "L'Archipel", 'https://www.larchipel.net/',
         'probe 2026-10-09: detail page https://larchipel.net/spectacle/baptiste-w-hamon/ has no Event (JSON-LD types: none).'),  # 75
    _off('arsenal', "Pavillon de l'Arsenal", 'https://www.pavillon-arsenal.com/',
         'probe 2026-10-09: detail page https://www.pavillon-arsenal.com/fr/signe/13419-points-noirs.html has no Event (JSON-LD types: none).'),  # 75
    _off('artsetmetiers', 'Musée des Arts et Métiers', 'https://www.arts-et-metiers.net/',
         "probe 2026-10-09: detail page https://www.arts-et-metiers.net/musee/demande-de-pret-0 has no Event (JSON-LD types: ['Article'])."),  # 75
    _off('artsforains', 'Musée des Arts forains', 'https://arts-forains.com/',
         "probe 2026-10-09: no Event data on https://arts-forains.com/actualites/notre-certification-iso-20121 (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('artstudiotheatre', 'Art Studio Théâtre', 'https://www.artstudiotheatre.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('atalante', "Théâtre de l'Atalante", 'https://www.theatre-latalante.com/',
         'probe 2026-10-09: no Event data on https://www.theatre-latalante.com/saison-nta-2026-2027/ (JSON-LD types: none).'),  # 75
    _off('atelierdeparis', 'Atelier de Paris – CDCN', 'https://www.atelierdeparis.org/',
         "probe 2026-10-09: detail page https://www.atelierdeparis.org/a-l-affiche/masterclass-mette-ingvartsen/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('atelierduplateau', 'Atelier du Plateau', 'https://www.atelierduplateau.org/',
         "probe 2026-10-09: detail page https://atelierduplateau.org/la-prog/temps-forts/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('atelierlumieres', 'Atelier des Lumières', 'https://www.atelier-lumieres.com/',
         "probe 2026-10-09: no Event data on https://www.atelier-lumieres.com/fr (JSON-LD types: ['Organization'])."),  # 75
    _off('ateliermedicis', 'Atelier Médicis', 'https://www.ateliermedicis.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('athenee', "Théâtre de l'Athénée", 'https://www.athenee-theatre.com/',
         'probe 2026-10-09: detail page https://www.athenee-theatre.com/saison/artiste/jean-genet.htm has no Event (JSON-LD types: none).'),  # 75
    _off('avantseine', "L'Avant Seine – Colombes", 'https://www.lavant-seine.com/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://www.lavant-seine.com/evenement/slavas-snowshow/ has only past or undated Events.'),  # 92
    _off('azimut', "L'Azimut – Antony / Châtenay", 'https://www.l-azimut.fr/',
         "probe 2026-10-09: detail page https://l-azimut.fr/evenements/variations-pour-un-parapluie/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 92
    _off('badaboum', 'Badaboum', 'https://www.badaboum.paris/',
         "probe 2026-10-09: detail page https://badaboum.paris/evenement/concert-mateus-asato-sold-out/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('bagneux', 'Théâtre Victor Hugo – Bagneux', 'https://www.bagneux92.fr/',
         'probe 2026-10-09: no Event data on https://www.bagneux92.fr/14/sortir-a-bagneux.htm (JSON-LD types: none).'),  # 92
    _off('baisersale', 'Le Baiser Salé', 'https://www.lebaisersale.com/',
         'probe 2026-10-09: detail page https://www.lebaisersale.com/fr/live-streams has no Event (JSON-LD types: none).'),  # 75
    _off('banlieuesbleues', 'Banlieues Bleues / La Dynamo', 'https://www.banlieuesbleues.org/',
         'probe 2026-10-09: detail page https://www.banlieuesbleues.org/festival/actions-musicales/ has no Event (JSON-LD types: none).'),  # 93
    _off('barbescomedy', 'Barbès Comedy Club', 'https://www.barbescomedyclub.com/',
         "probe 2026-10-09: no Event data on https://barbescomedyclub.com/programme-daffiliation-vodds-conditions-commissions-et-fonctionnement/ (JSON-LD types: ['BlogPosting', 'ImageObject', 'Organization', 'Person', 'WebPage'])."),  # 75
    _off('blancsmanteaux', 'Théâtre des Blancs-Manteaux', 'https://www.blancsmanteaux.fr/',
         'probe 2026-10-09: no Event data on https://www.blancsmanteaux.fr/ (JSON-LD types: none).'),  # 75
    _off('bouffesparisiens', 'Théâtre des Bouffes Parisiens', 'https://www.bouffesparisiens.com/',
         'probe 2026-10-09: redirects to www.portestmartin.com. detail page https://www.portestmartin.com/fr/acces-horaires has no Event (JSON-LD types: none).'),  # 75
    _off('boulenoire', 'La Boule Noire', 'https://www.laboule-noire.fr/',
         "probe 2026-10-09: detail page https://laboule-noire.fr/en/lynx-irl-2/ has no Event (JSON-LD types: ['Article', 'BreadcrumbList', 'ImageObject', 'ListItem', 'Organization'])."),  # 75
    _off('boulognebillancourt', 'Espace Landowski – Boulogne', 'https://www.boulognebillancourt.com/',
         'probe 2026-10-09: no Event data on https://www.boulognebillancourt.com/ (JSON-LD types: none).'),  # 92
    _off('bpi', "Bibliothèque publique d'information", 'https://www.bpi.fr/',
         'probe 2026-10-09: no Event data on https://www.bpi.fr/ (JSON-LD types: none).'),  # 75
    _off('briqueterie', 'La Briqueterie – CDCN du Val-de-Marne', 'https://www.alabriqueterie.com/',
         'probe 2026-10-09: blocked to the bot UA (HTTP 403 + challenge page) — not worked around'),  # 94
    _off('buspalladium', 'Bus Palladium', 'https://www.buspalladium.com/',
         "probe 2026-10-09: no Event data on https://www.buspalladium.com/ (JSON-LD types: ['WebSite'])."),  # 75
    _off('cabaretsauvage', 'Cabaret Sauvage', 'https://www.cabaretsauvage.com/',
         'probe 2026-10-09: robots.txt disallows the agenda for our bot'),  # 75
    _off('cachan', 'Théâtre Jacques Carat – Cachan', 'https://www.theatrejacquescarat.fr/',
         'probe 2026-10-09: detail page https://www.theatrejacquescarat.fr/participez/j-a-m-jeunes-artistes-en-mouvement has no Event (JSON-LD types: none).'),  # 94
    _off('canal93', 'Canal 93 – Bobigny', 'https://www.canal93.net/',
         'probe 2026-10-09: network: network error: [Errno 61] Connection refused'),  # 93
    _off('carrebellefeuille', 'Carré Belle-Feuille – Boulogne', 'https://www.carrebellefeuille.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 92
    _off('cartoucherie', 'Cartoucherie de Vincennes', 'https://www.cartoucherie.fr/',
         'probe 2026-10-09: no Event data on https://cartoucherie.fr/ (JSON-LD types: none).'),  # 75
    _off('caveauhuchette', 'Caveau de la Huchette', 'https://www.caveaudelahuchette.fr/',
         'probe 2026-10-09: no Event data on https://www.caveaudelahuchette.fr/1/concerts_octobre_2026_1483452.html (JSON-LD types: none).'),  # 75
    _off('caveauoubliettes', 'Caveau des Oubliettes', 'https://www.caveaudesoubliettes.fr/',
         'probe 2026-10-09: JS-rendered agenda, no server-side event data'),  # 75
    _off('ccirlandais', 'Centre culturel irlandais', 'https://www.centreculturelirlandais.com/',
         'probe 2026-10-09: detail page https://www.centreculturelirlandais.com/en-ce-moment/expositions-evenements/everyone-should-have-a-home has no Event (JSON-LD types: none).'),  # 75
    _off('ccsuisse', 'Centre culturel suisse', 'https://www.ccsparis.com/',
         'probe 2026-10-09: detail page https://www.ccsparis.com/evenements/hors-les-murs has no Event (JSON-LD types: none).'),  # 75
    _off('cesure', 'Césure', 'https://cesure.paris/',
         "probe 2026-10-09: no Event data on https://cesure.paris/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('champigny', 'Centre Gérard Philipe – Champigny', 'https://www.champigny94.fr/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 94
    _off('champo', 'Le Champo', 'https://www.cinema-lechampo.com/',
         "probe 2026-10-09: detail page https://www.cinema-lechampo.com/evenements/festival-telerama.html has no Event (JSON-LD types: ['Article', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('charenton', 'Théâtre des 2 Rives – Charenton', 'https://www.lesthea.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 94
    _off('chassenature', 'Musée de la Chasse et de la Nature', 'https://www.chassenature.org/',
         'probe 2026-10-09: detail page https://www.chassenature.org/rendez-vous/l-art-et-le-vivant-a-hauteur-d-enfant has no Event (JSON-LD types: none).'),  # 75
    _off('chateaumalmaison', 'Château de Malmaison', 'https://musees-nationaux-malmaison.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_PROTOCOL_VERSION] tlsv1 alert protocol version (_ssl.c:1129)'),  # 92
    _off('chateauvincennes', 'Château de Vincennes', 'https://www.chateau-de-vincennes.fr/',
         'probe 2026-10-09: detail page https://www.chateau-de-vincennes.fr/agenda/tout-public/rencontre-litteraire-je-change-de-nom has no Event (JSON-LD types: none).'),  # 94
    _off('chatenaymalabry', 'La Piscine – Châtenay-Malabry', 'https://www.chatenay-malabry.fr/',
         'probe 2026-10-09: municipal agenda with Event JSON-LD, but mixes non-cultural items (loto, public meetings) and has no postcodes'),  # 92
    _off('chatillon', 'Théâtre de Châtillon', 'https://www.theatreachatillon.com/',
         'probe 2026-10-09: no Event data on https://www.theatreachatillon.com/lagenda (JSON-LD types: none).'),  # 92
    _off('choisy', 'Théâtre-Cinéma Paul Éluard – Choisy', 'https://www.theatrecinemachoisy.fr/',
         'probe 2026-10-09: detail page https://theatrecinemachoisy.fr/evenements/cinema/notre-salut has no Event (JSON-LD types: none).'),  # 94
    _off('chopinparis', 'Festival Chopin à Paris', 'https://www.frederic-chopin.com/',
         'probe 2026-10-09: detail page https://www.frederic-chopin.com/pages/festival-chopin-paris/41-me-festival-chopin-paris has no Event (JSON-LD types: none).'),  # 75
    _off('cine104', 'Ciné 104 – Pantin', 'https://www.cine104.com/',
         'probe 2026-10-09: network: network error: [Errno 61] Connection refused'),  # 93
    _off('cirquedhiver', "Cirque d'Hiver Bouglione", 'https://www.cirquedhiver.com/',
         'probe 2026-10-09: detail page https://www.cirquedhiver.com/evenements/alex-lutz-16/ has no Event (JSON-LD types: none).'),  # 75
    _off('citearchi', "Cité de l'architecture et du patrimoine", 'https://www.citedelarchitecture.fr/',
         'probe 2026-10-09: detail page https://www.citedelarchitecture.fr/fr/article/enfants-ados-et-en-famille has no Event (JSON-LD types: none).'),  # 75
    _off('citefertile', 'La Cité Fertile', 'https://www.citefertile.com/',
         'probe 2026-10-09: Events Manager iCal (/events.ics) only carries food-aid / outreach sessions, no cultural events'),  # 93
    _off('ciup', 'Cité internationale universitaire', 'https://www.ciup.fr/',
         "probe 2026-10-09: no Event data on https://www.ciup.fr/bourses/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('cluny', 'Musée de Cluny', 'https://www.musee-moyenage.fr/',
         'probe 2026-10-09: no Event data on https://www.musee-moyenage.fr/ (JSON-LD types: none).'),  # 75
    _off('cnd', 'Centre national de la danse', 'https://www.cnd.fr/',
         'probe 2026-10-09: detail page https://www.cnd.fr/fr/catalogue-ressources-professionnels/faq-pro has no Event (JSON-LD types: none).'),  # 93
    _off('cnsmdp', 'Conservatoire de Paris (CNSMDP)', 'https://www.conservatoiredeparis.fr/fr/agenda',
         'probe 2026-10-09: http_404: page → HTTP 404'),  # 75
    _off('colombier', 'Le Colombier – Bagnolet', 'https://lecolombier-langaja.com/',
         'probe 2026-10-09: no Event data on https://lecolombier-langaja.com/ (JSON-LD types: none).'),  # 93
    _off('comediamontreuil', 'Comédia – Montreuil', 'https://www.comedia-montreuil.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('comediecaumartin', 'Comédie Caumartin', 'https://www.comedie-caumartin.com/',
         "probe 2026-10-09: no Event data on https://www.comedie-caumartin.com/ (JSON-LD types: ['BreadcrumbList', 'FAQPage', 'ListItem', 'Organization', 'Product'])."),  # 75
    _off('comediedeparis', 'La Comédie de Paris', 'https://www.comediedeparis.com/',
         'probe 2026-10-09: no Event data on https://www.comediedeparis.com/programmation (JSON-LD types: none).'),  # 75
    _off('comediestmichel', 'Comédie Saint-Michel', 'https://www.comediesaintmichel.fr/',
         'probe 2026-10-09: detail page https://www.comediesaintmichel.fr/files/Visuel_Web_Saint-Michel_Alice_RECOQUE.jpg has no Event (JSON-LD types: none).'),  # 75
    _off('comptoirfontenay', 'Musiques au Comptoir – Fontenay', 'https://www.musiquesaucomptoir.fr/',
         "probe 2026-10-09: no Event data on https://www.musiquesaucomptoir.fr/agenda/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 94
    _off('comptoirgeneral', 'Le Comptoir Général', 'https://www.lecomptoirgeneral.com/',
         "probe 2026-10-09: detail page https://lecomptoirgeneral.com/sections/collections-exposition-galerie/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('concertsdepoche', 'Concerts de poche', 'https://www.concertsdepoche.com/',
         'probe 2026-10-09: detail page https://www.concertsdepoche.com/france/artistes/les-compagnons has no Event (JSON-LD types: none).'),  # 93
    _off('contrescarpe', 'Théâtre de la Contrescarpe', 'https://www.theatredelacontrescarpe.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
    _off('coreeculture', 'Centre culturel coréen', 'https://www.coree-culture.org/',
         'probe 2026-10-09: no Event data on https://www.coree-culture.org/IMG/pdf/ccc_programme_automnehiver_web.pdf (JSON-LD types: none).'),  # 75
    _off('courbevoie', 'Espace Carpeaux – Courbevoie', 'https://www.ville-courbevoie.fr/',
         "probe 2026-10-09: no Event data on https://www.ville-courbevoie.fr/11/l-agenda-de-vos-evenements.htm (JSON-LD types: ['BreadcrumbList', 'ListItem'])."),  # 92
    _off('custodia', 'Fondation Custodia', 'https://www.fondationcustodia.fr/',
         'probe 2026-10-09: no Event data on https://www.fondationcustodia.fr/Expositions (JSON-LD types: none).'),  # 75
    _off('cwb', 'Centre Wallonie-Bruxelles', 'https://www.cwb.fr/',
         'probe 2026-10-09: detail page https://cwb.fr/agenda/performissima-3 has no Event (JSON-LD types: none).'),  # 75
    _off('daunou', 'Théâtre Daunou', 'https://www.theatredaunou.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('dechargeurs', 'Les Déchargeurs', 'https://www.lesdechargeurs.fr/',
         "probe 2026-10-09: redirects to www.les-dechargeurs.fr. no Event data on https://www.les-dechargeurs.fr/les-lumieres-de-la-scene-quand-lelectricite-devient-spectacle/ (JSON-LD types: ['NewsArticle'])."),  # 75
    _off('dejazet', 'Théâtre Déjazet', 'https://www.dejazet.com/',
         'probe 2026-10-09: detail page https://www.dejazet.com/spectacles/kamel-magicien-super-heros-2/ has no Event (JSON-LD types: none).'),  # 75
    _off('delacroix', 'Musée Eugène-Delacroix', 'https://www.musee-delacroix.fr/',
         'probe 2026-10-09: no Event data on https://www.musee-delacroix.fr/toute-la-programmation (JSON-LD types: none).'),  # 75
    _off('disquaires', 'Les Disquaires', 'https://www.lesdisquaires.com/',
         "probe 2026-10-09: no Event data on https://lesdisquaires.com/programmation/ (JSON-LD types: ['Article', 'Organization', 'Person'])."),  # 75
    _off('divandumonde', 'Le Divan du Monde', 'https://www.divandumonde.com/',
         "probe 2026-10-09: no Event data on https://www.divandumonde.com/ (JSON-LD types: ['Organization', 'WebSite'])."),  # 75
    _off('djoon', 'Djoon', 'https://www.djoon.com/',
         "probe 2026-10-09: detail page https://djoon.com/products/t-shirt-djoon has no Event (JSON-LD types: ['Organization', 'Product'])."),  # 75
    _off('domainesceaux', 'Domaine départemental de Sceaux', 'https://domaine-de-sceaux.hauts-de-seine.fr/',
         'probe 2026-10-09: detail page https://domaine-de-sceaux.hauts-de-seine.fr/agenda/detail/seance-sophrologie-quand-lart-eveille-vos-sens-11-octobre has no Event (JSON-LD types: none).'),  # 92
    _off('ecam', 'ECAM – Le Kremlin-Bicêtre', 'https://www.ecam-lekremlinbicetre.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 94
    _off('echangeur', "L'Échangeur – Bagnolet", 'https://www.lechangeur.org/',
         'probe 2026-10-09: detail page https://lechangeur.org/programmation/spectacles/dernier-dimanche-du-mois has no Event (JSON-LD types: none).'),  # 93
    _off('edouard7', 'Théâtre Édouard VII', 'https://www.theatreedouard7.com/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://www.theatreedouard7.com/spectacles/anna-roy has only past or undated Events.'),  # 75
    _off('ejp93', 'Espace Jacques Prévert – Aulnay', 'https://www.ejp93.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('ensembleintercontemporain', 'Ensemble intercontemporain', 'https://www.ensembleintercontemporain.com/',
         'probe 2026-10-09: no Event data on https://www.ensembleintercontemporain.com/ (JSON-LD types: none).'),  # 75
    _off('epeedebois', "Théâtre de l'Épée de Bois", 'https://www.epeedebois.com/',
         'probe 2026-10-09: detail page https://www.epeedebois.com/un-spectacle/ubu-roi/ has no Event (JSON-LD types: none).'),  # 75
    _off('espace1789', 'Espace 1789 Saint-Ouen', 'https://www.espace-1789.com/',
         'probe 2026-10-09: no Event data on https://www.espace-1789.com/ (JSON-LD types: none).'),  # 93
    _off('espacefondationedf', 'Fondation EDF – Espace', 'https://fondation.edf.com/',
         "probe 2026-10-09: no Event data on https://fondation.edf.com/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('essaion', 'Essaïon Théâtre', 'https://www.essaion-theatre.com/',
         "probe 2026-10-09: detail page https://essaion-theatre.com/spectacle/jean-zay-l-homme-complet/ has no Event (JSON-LD types: ['Organization'])."),  # 75
    _off('fermedubonheur', 'La Ferme du Bonheur', 'https://www.lafermedubonheur.fr/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate'),  # 92
    _off('festivalautomne', "Festival d'Automne à Paris", 'https://www.festival-automne.com/',
         'probe 2026-10-09: detail page https://www.festival-automne.com/fr/artistes/alberto-cortes has no Event (JSON-LD types: none).'),  # 75
    _off('festivalidf', "Festival d'Île-de-France", 'https://www.festival-idf.fr/',
         "probe 2026-10-09: detail page https://festival-idf.fr/concerts-paris-2024/kalash-criminel-zenith-paris-2024/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('feuxdelarampe', 'Les Feux de la Rampe', 'https://www.feux-de-la-rampe.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('flechedor', "La Flèche d'Or", 'https://www.flechedor.fr/',
         "probe 2026-10-09: no Event data on https://www.flechedor.fr/ (JSON-LD types: ['BreadcrumbList', 'CollectionPage', 'ListItem', 'Organization', 'WebSite'])."),  # 75
    _off('fondationfiminco', 'Fondation Fiminco – Romainville', 'https://www.fondationfiminco.com/',
         "probe 2026-10-09: detail page https://www.fondationfiminco.com/programmation-details/la-vie-parisienne-theatre-du-chatelet.html has no Event (JSON-LD types: ['ImageObject', 'Page', 'WebPage'])."),  # 93
    _off('fontenay', 'Fontenay-en-Scènes', 'https://www.fontenayenscenes.fr/',
         'probe 2026-10-09: redirects to www.culture.fontenay.fr. iCal link https://www.culture.fontenay.fr/backstage-7664/calendar.ics → 200. detail page https://www.culture.fontenay.fr/sortir/spectacles/tarifs-et-adhesions-2350.html has no Event (JSON-L…'),  # 94
    _off('forumblancmesnil', 'Le Forum – Blanc-Mesnil', 'https://www.leforumbm.fr/',
         'probe 2026-10-09: detail page https://www.leforumbm.fr/depannage-store-roulant/92-hauts-de-seine/92300-levallois-perret has no Event (JSON-LD types: none).'),  # 93
    _off('fraciledefrance', 'Frac Île-de-France', 'https://www.fraciledefrance.com/',
         "probe 2026-10-09: detail page https://fraciledefrance.com/fr/footer/devenir-partenaire has no Event (JSON-LD types: ['WebSite'])."),  # 75
    _off('funambule', 'Le Funambule Montmartre', 'https://www.funambule-montmartre.com/',
         'probe 2026-10-09: detail page https://www.funambule-montmartre.com/spectacles/a-laffiche has no Event (JSON-LD types: none).'),  # 75
    _off('gaitemontparnasse', 'Théâtre de la Gaîté-Montparnasse', 'https://www.gaite.fr/',
         'probe 2026-10-09: no Event data on https://www.gaite.fr/ (JSON-LD types: none).'),  # 75
    _off('galabru', 'Théâtre Montmartre-Galabru', 'https://www.theatre-galabru.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('gardechasse', 'Théâtre du Garde-Chasse', 'https://www.theatredugardechasse.fr/',
         "probe 2026-10-09: redirects to atomicsoda.fr. no Event data on https://atomicsoda.fr/ (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 93
    _off('gentilly', 'Le Plateau 31 – Gentilly', 'https://www.ville-gentilly.fr/',
         'probe 2026-10-09: detail page https://www.ville-gentilly.fr/agenda/black-beautiful-kwame-brathwaite has no Event (JSON-LD types: none).'),  # 94
    _off('giacometti', 'Institut Giacometti', 'https://www.fondation-giacometti.fr/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 75
    _off('glazart', 'Glazart', 'https://www.glazart.com/',
         "probe 2026-10-09: no Event data on https://www.glazart.com/agenda-concerts/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('goethe', 'Goethe-Institut Paris', 'https://www.goethe.de/ins/fr/fr/sta/par.html',
         'probe 2026-10-09: blocked to the bot UA (HTTP 403) — not worked around'),  # 75
    _off('grandpalaisimmersif', 'Grand Palais Immersif', 'https://grand-palais-immersif.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('grandpointvirgule', 'Le Grand Point Virgule', 'https://www.legrandpointvirgule.com/',
         "probe 2026-10-09: redirects to scenemontparnasse.com. detail page https://scenemontparnasse.com/event-pro/un-soir-sans-fin/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('grevin', 'Musée Grévin', 'https://www.grevin-paris.com/',
         'probe 2026-10-09: no Event data on https://www.grevin-paris.com/ (JSON-LD types: none).'),  # 75
    _off('guichetmontparnasse', 'Guichet Montparnasse', 'https://www.guichetmontparnasse.com/',
         "probe 2026-10-09: no Event data on https://www.guichetmontparnasse.com/ (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('guimet', 'Musée Guimet', 'https://www.guimet.fr/',
         'probe 2026-10-09: detail page https://www.guimet.fr/fr/activites-visites/chudahye-chagis has no Event (JSON-LD types: none).'),  # 75
    _off('gulbenkian', 'Fondation Gulbenkian – Paris', 'https://gulbenkian.pt/paris/',
         "probe 2026-10-09: Event JSON-LD on 3 /agenda/ pages; location 'Bibliothèque Gulbenkian' without address"),  # 75
    _off('gymnase', 'Théâtre du Gymnase Marie-Bell', 'https://www.theatredugymnase.paris/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: certificate has expired (_ssl.'),  # 75
    _off('halldelachanson', 'Le Hall de la Chanson', 'https://www.lehalldelachanson.com/',
         'probe 2026-10-09: detail page https://lehalldelachanson.com/le-magazine-du-hall/la-revue-arc-en-ciel-interview-2 has no Event (JSON-LD types: none).'),  # 75
    _off('hallesaintpierre', 'Halle Saint-Pierre', 'https://www.hallesaintpierre.org/',
         'probe 2026-10-09: no Event data on https://www.hallesaintpierre.org/category/exposition/a-venir/ (JSON-LD types: none).'),  # 75
    _off('hcb', 'Fondation Henri Cartier-Bresson', 'https://www.henricartierbresson.org/',
         'probe 2026-10-09: detail page https://www.henricartierbresson.org/expositions/martine-franck-2/ has no Event (JSON-LD types: none).'),  # 75
    _off('hebertot', 'Théâtre Hébertot', 'https://www.theatrehebertot.com/',
         'probe 2026-10-09: detail page https://www.theatrehebertot.com/spectacle/le-cid-pete-1-cable has no Event (JSON-LD types: none).'),  # 75
    _off('houdremont', 'Houdremont – La Courneuve', 'https://www.houdremont.fr/',
         'probe 2026-10-09: http_501: page → HTTP 501'),  # 93
    _off('immigration', "Musée national de l'histoire de l'immigration", 'https://www.histoire-immigration.fr/',
         'probe 2026-10-09: detail page https://www.histoire-immigration.fr/programmation/expositions/une-histoire-du-cinema-francais has no Event (JSON-LD types: none).'),  # 75
    _off('inrocksfestival', 'Festival Les Inrocks', 'https://www.lesinrocks.com/festival/',
         'probe 2026-10-09: http_404: page → HTTP 404'),  # 75
    _off('instantschavires', 'Les Instants Chavirés', 'https://www.instantschavires.com/',
         "probe 2026-10-09: detail page https://www.instantschavires.com/arts-visuels/rien-a-voir/ has no Event (JSON-LD types: ['BreadcrumbList', 'CollectionPage', 'ListItem', 'WebSite'])."),  # 93
    _off('institutculturelitalien', 'Institut culturel italien', 'https://iicparigi.esteri.it/',
         'probe 2026-10-09: detail page https://iicparigi.esteri.it/it/gli_eventi/calendario/mostra-ceccotti-passeretti-metafisiche-del-tempo/ has no Event (JSON-LD types: none).'),  # 75
    _off('institutfinlandais', 'Institut finlandais', 'https://www.institut-finlandais.fr/',
         "probe 2026-10-09: detail page https://www.institut-finlandais.fr/en/meista-2/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('institutpolonais', 'Institut polonais', 'https://instytutpolski.pl/paris/',
         'probe 2026-10-09: timeout: timeout error: The read operation timed out'),  # 75
    _off('institutsuedois', 'Institut suédois', 'https://paris.si.se/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403) — not worked around'),  # 75
    _off('insula', 'Insula orchestra', 'https://www.insulaorchestra.fr/',
         'probe 2026-10-09: orchestra touring several halls (locations without address); its Seine Musicale dates come via seinemusicale'),  # 92
    _off('ircam', 'Ircam', 'https://www.ircam.fr/',
         'probe 2026-10-09: detail page https://www.ircam.fr/fr/magazine/1-30-avec-marco-fiorini-doctorant has no Event (JSON-LD types: none).'),  # 75
    _off('jamelcomedyclub', 'Jamel Comedy Club', 'https://www.jamelcomedyclub.com/',
         'probe 2026-10-09: no Event data on https://www.jamelcomedyclub.com/ (JSON-LD types: none).'),  # 75
    _off('jardinsduruisseau', 'Les Jardins du Ruisseau', 'https://www.lesjardinsduruisseau.org/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
    _off('jazzalavillette', 'Jazz à la Villette', 'https://jazzalavillette.com/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://jazzalavillette.com/fr/programme/under-the-radar has only past or undated Events.'),  # 75
    _off('jazzclubetoile', 'Jazz Club Étoile', 'https://www.jazzclubetoile.com/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
    _off('jazzsurseine', 'Jazz sur Seine', 'https://www.jazzsurseine.paris/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('jeanvilarvitry', 'Théâtre Jean-Vilar – Vitry', 'https://www.theatrejeanvilar.com/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 94
    _off('jeudepaume', 'Jeu de Paume', 'https://jeudepaume.org/',
         "probe 2026-10-09: detail page https://jeudepaume.org/evenement/conference-de-stan-douglas/ has no Event (JSON-LD types: ['WebPage', 'WebSite'])."),  # 75
    _off('kezaco', 'Kezaco Café-Théâtre', 'https://www.kezaco-cafe-theatre.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('komunuma', 'Komunuma – Romainville', 'https://www.komunuma.com/',
         'probe 2026-10-09: timeout: timeout error: timed out'),  # 93
    _off('labruyere', 'Théâtre La Bruyère', 'https://www.theatrelabruyere.com/',
         "probe 2026-10-09: detail page http://www.theatrelabruyere.com/spectacle/oublie-moi has no Event (JSON-LD types: ['Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('laclefrevival', 'La Clef Revival', 'https://www.laclefrevival.com/',
         "probe 2026-10-09: redirects to www.mandor.fr. no Event data on https://www.mandor.fr/ (JSON-LD types: ['Casino', 'WebSite'])."),  # 75
    _off('lacommune', "La Commune – CDN d'Aubervilliers", 'https://www.lacommune-aubervilliers.fr/',
         'probe 2026-10-09: detail page https://www.lacommune-aubervilliers.fr/saison/26-27-en-attendant-oum-hatice-ozer/ has no Event (JSON-LD types: none).'),  # 93
    _off('ladynamo', 'La Dynamo de Banlieues Bleues – Pantin', 'https://www.ladynamo.org/',
         'probe 2026-10-09: network: network error: [Errno 54] Connection reset by peer'),  # 93
    _off('lafilmotheque', 'Filmothèque du Quartier latin', 'https://www.lafilmotheque.fr/',
         'probe 2026-10-09: detail page https://lafilmotheque.fr/evenements/retrospective/alejandro-gonzalez-inarritu-avant-digger/ has no Event (JSON-LD types: none).'),  # 75
    _off('lagarejazz', 'La Gare – Le Gore', 'https://www.lagarejazz.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('lajava', 'La Java', 'https://www.la-java.fr/',
         "probe 2026-10-09: no Event data on https://www.la-java.fr/programmation (JSON-LD types: ['NightClub'])."),  # 75
    _off('lapeche', 'La Pêche – Montreuil', 'https://www.lapechecafe.com/',
         'probe 2026-10-09: no Event data on https://lapechecafe.com/evenements-cafes-culturels (JSON-LD types: none).'),  # 93
    _off('lapop', 'La Pop', 'https://www.lapop.fr/',
         "probe 2026-10-09: detail page https://lapop.fr/spectacles/ouvrons-les-ecoutilles/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('larotonde', 'La Rotonde Stalingrad', 'https://www.larotondestalingrad.com/',
         'probe 2026-10-09: Tribe REST present, 0 upcoming. iCal link https://larotondestalingrad.com/events/?ical=1 → 200. detail page https://larotondestalingrad.com/evenement/ultracks-beon-festival-%c2%b7-apero-notturno/ has no Event (JSON-LD types: no…'),  # 75
    _off('lastation', 'La Station – Gare des Mines', 'https://www.lastation.paris/',
         'probe 2026-10-09: detail page https://www.lastation.paris/stationgdm/rendez-vous/2026-10-09-djs-for-flirt has no Event (JSON-LD types: none).'),  # 75
    _off('lavoirmoderne', 'Le Lavoir Moderne Parisien', 'https://www.lavoirmoderneparisien.com/',
         "probe 2026-10-09: no Event data on https://lavoirmoderneparisien.com/programmation/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('le13emeart', 'Le 13e Art', 'https://www.le13emeart.com/',
         "probe 2026-10-09: detail page https://le13emeart.com/les-evenements/maison-den-face/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('le6b', 'Le 6b', 'https://www.le6b.fr/',
         "probe 2026-10-09: detail page https://www.le6b.fr/les-resident-e-s/laeternite-sauvage/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 93
    _off('lebal', 'Le Bal', 'https://www.le-bal.fr/',
         'probe 2026-10-09: detail page https://www.le-bal.fr/expositions/en-ce-moment has no Event (JSON-LD types: none).'),  # 75
    _off('lebalzac', 'Le Balzac', 'https://www.cinemabalzac.com/',
         'probe 2026-10-09: detail page https://www.cinemabalzac.com/evenement/2207029-retrospective-andrei-zviaguintsev has no Event (JSON-LD types: none).'),  # 75
    _off('lechinois', 'Le Chinois', 'https://www.lechinoismontreuil.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('lehublot', 'Le Hublot – Colombes', 'https://www.lehublot.org/',
         'probe 2026-10-09: no Event data on https://www.lehublot.org/ (JSON-LD types: none).'),  # 92
    _off('leklub', 'Le Klub', 'https://www.leklub.fr/',
         'probe 2026-10-09: no Event data on https://www.leklub.fr/ (JSON-LD types: none).'),  # 75
    _off('lepalace', 'Le Palace', 'https://www.theatrelepalace.fr/',
         'probe 2026-10-09: blocked to the bot UA (HTTP 403 + challenge page) — not worked around'),  # 75
    _off('lerepublique', 'Le République', 'https://www.le-republique.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('lesample', 'Le Sample', 'https://www.lesample.fr/',
         'probe 2026-10-09: no Event data on https://www.lesample.fr/programmation/ (JSON-LD types: none).'),  # 93
    _off('lesetoiles', 'Les Étoiles', 'https://www.lesetoiles.paris/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('levallois', 'Salle Ravel – Levallois', 'https://www.ville-levallois.fr/',
         'probe 2026-10-09: no Event data on https://www.ville-levallois.fr/ (JSON-LD types: none).'),  # 92
    _off('lfsm', "Festival Les Femmes s'en mêlent", 'https://www.lfsm.net/',
         'probe 2026-10-09: detail page https://lfsm.net/agenda/lfse-atelier-de-beatmaking-computer-girls-avec-songe/ has no Event (JSON-LD types: none).'),  # 75
    _off('lido', 'Lido2Paris', 'https://www.lido2paris.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('linternational', "L'International", 'https://www.linternational.paris/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('louisaragon', 'Théâtre Louis Aragon – Tremblay', 'https://www.theatrelouisaragon.fr/',
         'probe 2026-10-09: no Event data on https://www.theatrelouisaragon.fr/886/la-programmation/saison-2026-2027-les-spectacles.htm (JSON-LD types: none).'),  # 93
    _off('louxor', 'Le Louxor', 'https://www.cinemalouxor.fr/',
         'probe 2026-10-09: Event JSON-LD on /events/ pages, but screenings are covered by the allocine source'),  # 75
    _off('lucernaire', 'Le Lucernaire', 'https://www.lucernaire.fr/',
         "probe 2026-10-09: detail page https://www.lucernaire.fr/theatre/oliver-twist/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('maccreteil', 'Maison des Arts de Créteil', 'https://www.maccreteil.com/',
         'probe 2026-10-09: detail page https://www.maccreteil.com/la-mac/le-projet has no Event (JSON-LD types: none).'),  # 94
    _off('macval', 'MAC VAL', 'https://www.macval.fr/',
         'probe 2026-10-09: no Event data on https://www.macval.fr/Agenda-des-evenements (JSON-LD types: none).'),  # 94
    _off('magasinsgeneraux', 'Les Magasins Généraux', 'https://www.magasinsgeneraux.com/',
         'probe 2026-10-09: no Event data on https://magasinsgeneraux.com/agenda/ (JSON-LD types: none).'),  # 93
    _off('maillol', 'Musée Maillol', 'https://www.museemaillol.com/',
         "probe 2026-10-09: detail page https://museemaillol.com/expositions/harmonie-loeuvre-ultime/ has no Event (JSON-LD types: ['SiteNavigationElement'])."),  # 75
    _off('mainsdoeuvres', "Mains d'Œuvres", 'https://www.mainsdoeuvres.org/',
         'probe 2026-10-09: detail page https://www.mainsdoeuvres.org/agenda/aogiri-fest-2 has no Event (JSON-LD types: none).'),  # 93
    _off('maisondoisneau', 'Maison de la Photographie Robert Doisneau', 'https://www.maisondoisneau.agglo-valdebievre.fr/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: self signed certificate (_ssl.'),  # 94
    _off('maisonmusiquenanterre', 'Maison de la musique de Nanterre', 'https://www.maisondelamusique.eu/',
         "probe 2026-10-09: detail page https://www.maisondelamusique.eu/spectacles/apero-stand-up-oct/ has no Event (JSON-LD types: ['BreadcrumbList', 'WebPage'])."),  # 92
    _off('maisonsalfort', 'Théâtre Claude Debussy – Maisons-Alfort', 'https://www.theatredemaisons-alfort.org/',
         "probe 2026-10-09: detail page https://www.theatredemaisons-alfort.org/saison/saison-26-27/anouar-brahem/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 94
    _off('mal217', "Maison de l'Amérique latine", 'https://www.mal217.org/',
         'probe 2026-10-09: detail page https://www.mal217.org/fr/hors-les-murs/le-chien-qui-aboie-copie-79b170f6 has no Event (JSON-LD types: none).'),  # 75
    _off('malakoff', 'Malakoff scène nationale', 'https://www.malakoffscenenationale.fr/',
         'probe 2026-10-09: detail page https://malakoffscenenationale.fr/theatre-71/programme/sharon-eyal-leo-lerus has no Event (JSON-LD types: none).'),  # 92
    _off('marbrerie', 'La Marbrerie', 'https://www.lamarbrerie.fr/',
         "probe 2026-10-09: no Event data on https://lamarbrerie.fr/agenda/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 93
    _off('marchepoesie', 'Marché de la Poésie', 'https://www.marche-poesie.com/',
         'probe 2026-10-09: no Event data on https://www.marche-poesie.com/ (JSON-LD types: none).'),  # 75
    _off('mathurins', 'Théâtre des Mathurins', 'https://www.theatredesmathurins.com/',
         "probe 2026-10-09: detail page https://www.theatredesmathurins.com/spectacles/x-elles/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('maxlinder', 'Max Linder Panorama', 'https://www.maxlinder.com/',
         'probe 2026-10-09: Event JSON-LD on /events/ pages, but screenings are covered by the allocine source'),  # 75
    _off('mc93', 'MC93 – Maison de la Culture de Seine-Saint-Denis', 'https://www.mc93.com/',
         "probe 2026-10-09: detail page https://www.mc93.com/saison/salma-mon-amour has no Event (JSON-LD types: ['PerformingArtsTheater', 'WebSite'])."),  # 93
    _off('mcjp', 'Maison de la culture du Japon', 'https://www.mcjp.fr/',
         'probe 2026-10-09: detail page https://www.mcjp.fr/fr/la-mcjp/le-batiment has no Event (JSON-LD types: none).'),  # 75
    _off('mecaniqueondulatoire', 'La Mécanique Ondulatoire', 'https://www.lamecaniqueondulatoire.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('melies', 'Le Méliès Montreuil', 'https://www.montreuil.fr/sortir/cinema-le-melies',
         'probe 2026-10-09: http_404: page → HTTP 404'),  # 93
    _off('meloamelie', "Le Mélo d'Amélie", 'https://www.lemelodamelie.com/',
         'probe 2026-10-09: detail page https://lemelodamelie.com/movie/merci-au-suivant/ has no Event (JSON-LD types: none).'),  # 75
    _off('memorialshoah', 'Mémorial de la Shoah', 'https://www.memorialdelashoah.org/',
         "probe 2026-10-09: detail page https://www.memorialdelashoah.org/evenements-et-expositions/expositions/expositions-itinerantes.html has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('menilmontant', 'Théâtre de Ménilmontant', 'https://www.menilmontant.info/',
         'probe 2026-10-09: JS-rendered agenda, no server-side event data'),  # 75
    _off('mep', 'Maison européenne de la photographie', 'https://www.mep-fr.org/',
         "probe 2026-10-09: detail page https://www.mep-fr.org/event/projection-du-film-diana-vreeland-the-eye-has-to-travel-2/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('metallos', 'Maison des Métallos', 'https://www.maisondesmetallos.paris/',
         'probe 2026-10-09: detail page https://www.maisondesmetallos.paris/accueil/lieux-de-vie/accueil-billetterie has no Event (JSON-LD types: none).'),  # 75
    _off('micadanses', 'Micadanses', 'https://www.micadanses.com/',
         'probe 2026-10-09: detail page https://micadanses.com/types_cours/entrainement-regulier-de-l-artiste-choregraphique/ has no Event (JSON-LD types: none).'),  # 75
    _off('michelsimon', 'Espace Michel Simon – Noisy-le-Grand', 'https://www.espace-michel-simon.fr/',
         'probe 2026-10-09: network: network error: [Errno 61] Connection refused'),  # 93
    _off('michodiere', 'Théâtre de la Michodière', 'https://www.michodiere.com/',
         "probe 2026-10-09: detail page https://www.michodiere.com/evenement/le-malade-imaginaire/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('mjccolombes', 'MJC Théâtre de Colombes', 'https://www.mjctheatredecolombes.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 92
    _off('mnhn', "Muséum national d'Histoire naturelle", 'https://www.mnhn.fr/fr/agenda',
         'probe 2026-10-09: Event JSON-LD on animation pages, but multi-site (zoo, Jardin des Plantes…) with location names only'),  # 75
    _off('mobiliernational', 'Galerie des Gobelins', 'https://www.mobiliernational.culture.gouv.fr/',
         'probe 2026-10-09: detail page https://www.mobiliernational.culture.gouv.fr/fr/expositions-et-evenements/exposition-a-la-une has no Event (JSON-LD types: none).'),  # 75
    _off('monfort', 'Le Monfort', 'https://www.lemonfort.fr/',
         "probe 2026-10-09: redirects to theatresilviamonfort.eu. detail page https://theatresilviamonfort.eu/events/festival-sonore-3/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('montmartre', 'Musée de Montmartre', 'https://museedemontmartre.fr/',
         "probe 2026-10-09: detail page https://museedemontmartre.fr/exposition/le-cirque-fabrique-de-l-art-moderne/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('mouffetard', 'Le Mouffetard – CNMA', 'https://www.lemouffetard.com/',
         'probe 2026-10-09: detail page https://www.lemouffetard.com/la-saison/journee-d-etude-marionnette-cabaret-et-ventriloquie has no Event (JSON-LD types: none).'),  # 75
    _off('museeairespace', "Musée de l'Air et de l'Espace", 'https://www.museeairespace.fr/',
         "probe 2026-10-09: Tribe REST → HTTP 403. detail page https://www.museeairespace.fr/a-voir-a-faire/activites/visites-guidees/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 93
    _off('museearmee', "Musée de l'Armée", 'https://www.musee-armee.fr/',
         'probe 2026-10-09: detail page https://www.musee-armee.fr/au-programme/cette-semaine-au-musee/detail/la-saison-americaine.html has no Event (JSON-LD types: none).'),  # 75
    _off('museedelhomme', "Musée de l'Homme", 'https://www.museedelhomme.fr/',
         'probe 2026-10-09: Event JSON-LD on some pages, but detail URLs (/fr/<slug>) cannot be told apart from editorial pages'),  # 75
    _off('museeduluxembourg', 'Musée du Luxembourg', 'https://museeduluxembourg.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_PROTOCOL_VERSION] tlsv1 alert protocol version (_ssl.c:1129)'),  # 75
    _off('museeenherbe', 'Musée en Herbe', 'https://www.musee-en-herbe.com/',
         'probe 2026-10-09: no Event data on https://www.musee-en-herbe.com/evenements-en-cours-wo528.html (JSON-LD types: none).'),  # 75
    _off('museemarine', 'Musée national de la Marine', 'https://www.musee-marine.fr/',
         "probe 2026-10-09: detail page https://www.musee-marine.fr/enseignants/preparer-sa-visite-a-paris.html has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('museeposte', 'Musée de La Poste', 'https://www.museedelaposte.fr/',
         'probe 2026-10-09: redirects to www.museepostal.fr. detail page https://www.museepostal.fr/fr/collections/adulte-adolescent has no Event (JSON-LD types: none).'),  # 75
    _off('museesaintdenis', "Musée d'art et d'histoire Paul Éluard", 'https://www.musee-saint-denis.com/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 93
    _off('nouveaucasino', 'Nouveau Casino', 'https://www.nouveaucasino.net/',
         'probe 2026-10-09: no Event data on https://www.nouveaucasino.net/ (JSON-LD types: none).'),  # 75
    _off('ntm', 'Nouveau Théâtre de Montreuil', 'https://www.nouveau-theatre-montreuil.com/',
         "probe 2026-10-09: redirects to theatrepublicmontreuil.com. detail page https://theatrepublicmontreuil.com/fr/enseignement-superieur has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem'])."),  # 93
    _off('ondif', "Orchestre national d'Île-de-France", 'https://www.orchestre-ile.com/',
         'probe 2026-10-09: detail page https://www.orchestre-ile.com/concerts/jeune-public has no Event (JSON-LD types: none).'),  # 75
    _off('orchestrechambre', 'Orchestre de chambre de Paris', 'https://www.orchestredechambredeparis.com/',
         "probe 2026-10-09: detail page https://www.orchestredechambredeparis.com/concert/mozart-requiem/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('orchestredeparis', 'Orchestre de Paris', 'https://www.orchestredeparis.com/',
         'probe 2026-10-09: redirects to philharmoniedeparis.fr. detail page https://philharmoniedeparis.fr/fr/agenda-selection/prochains-evenements-dans-la-grande-salle-pierre-boulez has no Event (JSON-LD types: none).'),  # 75
    _off('pagode', 'Cinéma La Pagode', 'https://www.lapagode.fr/',
         'probe 2026-10-09: network: network error: [Errno 61] Connection refused'),  # 75
    _off('palaisroyal', 'Théâtre du Palais-Royal', 'https://www.theatrepalaisroyal.com/',
         "probe 2026-10-09: detail page https://www.theatrepalaisroyal.com/Spectacles/le-guide-du-parfait-gentleman-assassin/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('panameartcafe', 'Paname Art Café', 'https://www.panameartcafe.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('pantheon', 'Cinéma du Panthéon', 'https://www.cinemadupantheon.fr/',
         'probe 2026-10-09: no Event data on https://www.cinemadupantheon.fr/ (JSON-LD types: none).'),  # 75
    _off('paradislatin', 'Paradis Latin', 'https://www.paradislatin.com/',
         "probe 2026-10-09: detail page https://www.paradislatin.com/fr/infos-pratiques/adresse-acces/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem'])."),  # 75
    _off('parcfloral', 'Parc floral de Paris', 'https://www.parcfloraldeparis.com/',
         "probe 2026-10-09: detail page https://www.parcfloraldeparis.com/salons-professionnels/forum-arts-et-metiers has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem'])."),  # 75
    _off('parisjazzfestival', 'Paris Jazz Festival', 'https://www.parisjazzfestival.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_UNRECOGNIZED_NAME] tlsv1 unrecognized name (_ssl.c:1129)'),  # 75
    _off('parispodcastfestival', 'Paris Podcast Festival', 'https://www.parispodcastfestival.com/',
         "probe 2026-10-09: detail page https://www.parispodcastfestival.com/24-prog-j2/rencontre-d%C3%A9dicace-%3A-camille-froidevaux-metterie has no Event (JSON-LD types: ['ImageObject'])."),  # 75
    _off('parisvillette', 'Théâtre Paris-Villette', 'https://www.theatre-paris-villette.fr/',
         "probe 2026-10-09: detail page https://www.theatre-paris-villette.fr/spectacle/atelier-stop-motion-parents-enfants-autour-du-spectacle-grandeur-nature/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'We…"),  # 75
    _off('pavillonbaltard', 'Pavillon Baltard – Nogent', 'https://www.pavillon-baltard.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 94
    _off('pavillondescanaux', 'Pavillon des Canaux', 'https://www.pavillondescanaux.com/',
         "probe 2026-10-09: no Event data on https://www.pavillondescanaux.com/agenda/ (JSON-LD types: ['BreadcrumbList', 'ImageGallery', 'ImageObject', 'ListItem', 'Organization'])."),  # 75
    _off('penicheantipode', 'Péniche Antipode', 'https://www.penicheantipode.fr/',
         'probe 2026-10-09: detail page https://www.penicheantipode.fr/telecharger/cafeantipode/antipode-cafe_carte_restau.pdf has no Event (JSON-LD types: none).'),  # 75
    _off('pernodricard', 'Fondation Pernod Ricard', 'https://www.fondation-pernod-ricard.com/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 75
    _off('petiteloge', 'La Petite Loge', 'https://www.lapetiteloge.com/',
         'probe 2026-10-09: timeout: timeout error: timed out'),  # 75
    _off('petiterockette', 'La Petite Rockette', 'https://www.lapetiterockette.org/',
         "probe 2026-10-09: detail page https://www.lapetiterockette.org/event/vente-de-perles/ has no Event (JSON-LD types: ['WebSite'])."),  # 75
    _off('petitjournal', 'Le Petit Journal Saint-Michel', 'https://www.petitjournalsaintmichel.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('petitstmartin', 'Théâtre du Petit Saint-Martin', 'https://www.petitstmartin.com/',
         'probe 2026-10-09: redirects to www.portestmartin.com. detail page https://www.portestmartin.com/fr/acces-horaires has no Event (JSON-LD types: none).'),  # 75
    _off('plateauxsauvages', 'Les Plateaux Sauvages', 'https://www.lesplateauxsauvages.fr/',
         "probe 2026-10-09: no Event data on https://lesplateauxsauvages.fr/26-27-programmation/ (JSON-LD types: ['Article', 'ImageObject', 'Person', 'WebPage', 'WebSite'])."),  # 75
    _off('poc', "Pôle culturel d'Alfortville (POC)", 'https://www.poc-alfortville.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 94
    _off('pochemontparnasse', 'Théâtre de Poche-Montparnasse', 'https://www.theatredepoche-montparnasse.com/',
         'probe 2026-10-09: detail page https://www.theatredepoche-montparnasse.com/spectacle/quatrevingt-treize/ has no Event (JSON-LD types: none).'),  # 75
    _off('pointfort', 'Le Point Fort – Aulnay', 'https://www.lepointfort.fr/',
         'probe 2026-10-09: network: network error: [Errno 61] Connection refused'),  # 93
    _off('popupdulabel', 'Pop-Up du Label', 'https://www.popupdulabel.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('portestmartin', 'Théâtre de la Porte Saint-Martin', 'https://www.portestmartin.com/',
         'probe 2026-10-09: detail page https://www.portestmartin.com/fr/acces-horaires has no Event (JSON-LD types: none).'),  # 75
    _off('quartierdete', "Paris l'été", 'https://www.parislete.fr/',
         'probe 2026-10-09: detail page https://www.parislete.fr/fr/proposer-un-projet has no Event (JSON-LD types: none).'),  # 75
    _off('ranelagh', 'Théâtre le Ranelagh', 'https://www.theatre-ranelagh.com/',
         "probe 2026-10-09: detail page https://www.theatre-ranelagh.com/spectacle/le-mariage-de-figaro-ou-la-folle-journee-26-27/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('recyclerie', 'La REcyclerie', 'https://www.larecyclerie.com/',
         "probe 2026-10-09: no Event data on https://www.larecyclerie.com/programmation/ (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('reineblanche', 'Théâtre de la Reine Blanche', 'https://www.reineblanche.com/',
         'probe 2026-10-09: detail page https://www.reineblanche.com/calendrier/theatre/chroniques-de-chair has no Event (JSON-LD types: none).'),  # 75
    _off('renaissance', 'Théâtre de la Renaissance', 'https://www.theatredelarenaissance.com/',
         "probe 2026-10-09: detail page https://www.theatredelarenaissance.com/project/marion-mezadorian/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('reservoir', 'Le Réservoir', 'https://www.reservoirclub.com/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate'),  # 75
    _off('rexclub', 'Rex Club', 'https://www.rexclub.com/',
         'probe 2026-10-09: no Event data on https://rexclub.com/ (JSON-LD types: [\'Article\', \'Person\', \'WebPage\', \'WebSite\', "[\'Person\', \'Organization\']"]).'),  # 75
    _off('rodin', 'Musée Rodin', 'https://www.musee-rodin.fr/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://www.musee-rodin.fr/musee/agenda/public-du-monument-1789-2026-celebration-collective-en-question has only past or undated Events.'),  # 75
    _off('rungis', 'Théâtre de Rungis', 'https://www.theatre-rungis.fr/',
         'probe 2026-10-09: no Event data on https://www.theatre-rungis.fr/calendrier (JSON-LD types: none).'),  # 94
    _off('sablons', 'Théâtre des Sablons – Neuilly', 'https://www.theatredessablons.com/',
         'probe 2026-10-09: no Event data on https://www.theatredessablons.com/ (JSON-LD types: none).'),  # 92
    _off('saintechapelle', 'Sainte-Chapelle', 'https://www.sainte-chapelle.fr/',
         'probe 2026-10-09: detail page https://www.sainte-chapelle.fr/agenda/monument-jeu-d-enfant-la-sainte-chapelle-devoilee has no Event (JSON-LD types: none).'),  # 75
    _off('saintgeorges', 'Théâtre Saint-Georges', 'https://www.theatresaintgeorges.com/',
         'probe 2026-10-09: network: network error: [Errno 54] Connection reset by peer'),  # 75
    _off('saintmaur', 'Théâtre de Saint-Maur', 'https://www.theatresaintmaur.com/',
         'probe 2026-10-09: detail page https://www.theatresaintmaur.com/rdv/rendez_vous/les-p_tits-artistes.htm has no Event (JSON-LD types: none).'),  # 94
    _off('sallecortot', 'Salle Cortot', 'https://www.sallecortot.com/',
         "probe 2026-10-09: detail page https://sallecortot.com/event/marianne-vourch-raconte-moi-le-roi-danse/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('scenewatteau', 'La Scène Watteau – Nogent', 'https://www.scenewatteau.fr/',
         'probe 2026-10-09: redirects to www.theatreantoinewatteau.fr. detail page https://www.theatreantoinewatteau.fr/saison-culturelle/la-crise has no Event (JSON-LD types: none).'),  # 94
    _off('sentierdeshalles', 'Le Sentier des Halles', 'https://www.lesentierdeshalles.fr/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate'),  # 75
    _off('sevres', 'Sèvres – Manufacture et Musée nationaux', 'https://www.sevresciteceramique.fr/',
         'probe 2026-10-09: detail page https://www.sevresciteceramique.fr/manufacture/les-artistes.html has no Event (JSON-LD types: none).'),  # 92
    _off('shakirail', 'Le Shakirail', 'https://www.shakirail.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('sonsdhiver', "Festival Sons d'hiver", 'https://www.sonsdhiver.org/',
         "probe 2026-10-09: no Event data on https://www.sonsdhiver.org/ (JSON-LD types: ['Article', 'ImageObject', 'Organization', 'Person', 'WebPage'])."),  # 94
    _off('sorano', 'Espace Sorano – Vincennes', 'https://www.espacesorano.com/',
         "probe 2026-10-09: detail page https://www.espacesorano.com/evenement/stages-de-la-toussaint/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 94
    _off('splendid', 'Le Splendid', 'https://www.lesplendid.com/',
         "probe 2026-10-09: detail page https://www.lesplendid.com/project/colors-le-spectacle-culte/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('stadefrance', 'Stade de France', 'https://www.stadefrance.com/',
         "probe 2026-10-09: Event JSON-LD only on corporate hospitality pages ('PLACES VIP'), not on the public agenda"),  # 93
    _off('studio28', 'Studio 28', 'https://www.cinema-studio28.fr/',
         'probe 2026-10-09: Event JSON-LD (screenings) on the home page, covered by the allocine source'),  # 75
    _off('studioermitage', "Studio de l'Ermitage", 'https://www.studio-ermitage.com/',
         'probe 2026-10-09: detail page https://www.studio-ermitage.com/index.php/agenda/date/les-innocents-01.10 has no Event (JSON-LD types: none).'),  # 75
    _off('studiostains', 'Studio Théâtre de Stains', 'https://www.studiotheatrestains.fr/',
         "probe 2026-10-09: detail page https://www.studiotheatrestains.fr/spectacles/momo-ou-la-mysterieuse-histoire-des-voleurs-de-temps/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 93
    _off('sudest', 'Sud-Est Théâtre – Villeneuve-Saint-Georges', 'https://www.sud-est-theatre.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 94
    _off('supersonic', 'Supersonic', 'https://www.supersonic-club.fr/',
         "probe 2026-10-09: detail page https://supersonic-club.fr/evenement/common-people-nuit-british-rock-10th-oct-supersonic-paris-tickets/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('suresnes', 'Théâtre de Suresnes Jean Vilar', 'https://www.theatre-suresnes.fr/',
         "probe 2026-10-09: detail page https://www.theatre-suresnes.fr/spectacle/latelier-des-songes/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 92
    _off('t2g', 'T2G – Théâtre de Gennevilliers', 'https://www.theatredegennevilliers.fr/',
         'probe 2026-10-09: detail page https://theatredegennevilliers.fr/la-saison/programmation/paradis-plage-une-vie-comme-dans-du-miel has no Event (JSON-LD types: none).'),  # 92
    _off('tamanoir', 'Le Tamanoir – Gennevilliers', 'https://www.tamanoir.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 92
    _off('tempete', 'Théâtre de la Tempête', 'https://www.la-tempete.fr/',
         'probe 2026-10-09: detail page https://www.la-tempete.fr/le-theatre/presentation-e583f33d has no Event (JSON-LD types: none).'),  # 75
    _off('tempsdescerises', 'Le Temps des Cerises – Issy', 'https://www.letempsdescerises.fr/',
         "probe 2026-10-09: detail page https://letempsdescerises.fr/categorie-produit/grands-crus/ has no Event (JSON-LD types: ['BreadcrumbList', 'CollectionPage', 'Organization', 'WebSite'])."),  # 92
    _off('tgp', 'Théâtre Gérard Philipe – Saint-Denis', 'https://www.theatregerardphilipe.com/',
         "probe 2026-10-09: redirects to tgp.theatregerardphilipe.com. detail page https://tgp.theatregerardphilipe.com/spectacle/jetais-partie-pardon-dans-un-autre-univers/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organ…"),  # 93
    _off('theatre13', 'Théâtre 13', 'https://www.theatre13.com/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://theatre13.com/spectacle/mois-kreyol-3/ has only past or undated Events.'),  # 75
    _off('theatreantoine', 'Théâtre Antoine', 'https://www.theatre-antoine.com/',
         "probe 2026-10-09: detail page https://theatre-antoine.com/event-pro/maintenant-je-necris-plus-quen-francais has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('theatrearp', 'Théâtre Jean Arp – Clamart', 'https://www.theatrearp.com/',
         "probe 2026-10-09: detail page https://www.theatrearp.com/video/26292-japanese-mother垂乳.html has no Event (JSON-LD types: ['Organization', 'VideoObject', 'WebPage', 'WebSite'])."),  # 92
    _off('theatrebastille', 'Théâtre de la Bastille', 'https://www.theatre-bastille.com/',
         'probe 2026-10-09: detail page https://www.theatre-bastille.com/saison-26-27/la-bataille-des-recits has no Event (JSON-LD types: none).'),  # 75
    _off('theatreberthelot', 'Théâtre Berthelot – Montreuil', 'https://www.theatreberthelot.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('theatrebo', 'Théâtre BO Saint-Martin', 'https://www.theatrebo.fr/',
         "probe 2026-10-09: no Event data on https://theatrebo.fr/ (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('theatreconcorde', 'Théâtre de la Concorde', 'https://www.theatredelaconcorde.paris/',
         'probe 2026-10-09: Event markup present but no upcoming dated event: detail page https://theatredelaconcorde.paris/evenements/le-courage-de-la-nuance-jean-birnbaum/ has only past or undated Events.'),  # 75
    _off('theatredelacite', 'Théâtre de la Cité internationale', 'https://www.theatredelacite.com/',
         'probe 2026-10-09: detail page https://www.theatredelacite.com/fr/le-projet has no Event (JSON-LD types: none).'),  # 75
    _off('theatredelatoureiffel', 'Théâtre de la Tour Eiffel', 'https://www.theatredelatoureiffel.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
    _off('theatredenesle', 'Théâtre de Nesle', 'https://www.theatredenesle.com/',
         "probe 2026-10-09: detail page https://www.theatredenesle.com/tribe-events/george-sand-et-marie-dagoult-une-amitie-immediate-et-passionnee/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('theatredesbergeries', 'Théâtre des Bergeries – Noisy-le-Sec', 'https://www.theatredesbergeries.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 93
    _off('theatredixheures', 'Théâtre de Dix Heures', 'https://www.theatre-dix-heures.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('theatreduchaudron', 'Théâtre du Chaudron', 'https://www.theatreduchaudron.fr/',
         "probe 2026-10-09: redirects to atacte-theatre.com. no Event data on https://atacte-theatre.com/ (JSON-LD types: ['Article', 'ImageObject', 'Person', 'WebPage', 'WebSite'])."),  # 75
    _off('theatredusoleil', 'Théâtre du Soleil', 'https://www.theatre-du-soleil.fr/',
         'probe 2026-10-09: detail page https://www.theatre-du-soleil.fr/fr/les-editos/lettre-au-public-88 has no Event (JSON-LD types: none).'),  # 75
    _off('theatrehuchette', 'Théâtre de la Huchette', 'https://www.theatre-huchette.com/',
         "probe 2026-10-09: detail page https://www.theatre-huchette.com/profile/sophie-fontaine/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'Organization', 'WebPage', 'WebSite'])."),  # 75
    _off('theatrelebout', 'Le Bout', 'https://www.lebout.fr/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
    _off('theatrelepic', 'Théâtre Lepic', 'https://www.theatrelepic.com/',
         "probe 2026-10-09: detail page https://theatrelepic.com/programmation/ou-vont-les-larmes-quand-elles-sechent/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('theatrelibre', 'Théâtre Libre', 'https://www.theatrelibre.fr/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 75
    _off('theatremadeleine', 'Théâtre de la Madeleine', 'https://www.theatredelamadeleine.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('theatremarais', 'Théâtre du Marais', 'https://www.theatredumarais.com/',
         'probe 2026-10-09: blocked to the bot UA (robots.txt → HTTP 403 (challenge)) — not worked around'),  # 75
    _off('theatremetropole', 'Le Métropole', 'https://www.lemetropole.paris/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('theatremichel', 'Théâtre Michel', 'https://www.theatre-michel.fr/',
         "probe 2026-10-09: detail page https://www.theatre-michel.fr/Spectacles/on-peut-sappeler-alain-et-sauver-le-monde/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('theatreneuilly', 'Théâtre de Neuilly', 'https://www.theatredeneuilly.com/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 92
    _off('theatreoeuvre', "Théâtre de l'Œuvre", 'https://www.theatredeloeuvre.fr/',
         'probe 2026-10-09: TLS failure: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: Hostname mismatch, certificate'),  # 75
    _off('theatreouvert', 'Théâtre Ouvert', 'https://www.theatre-ouvert.com/',
         'probe 2026-10-09: detail page https://www.theatre-ouvert.com/spectacle/lac-artificiel-4/ has no Event (JSON-LD types: none).'),  # 75
    _off('theatreputeaux', 'Théâtre de Puteaux', 'https://www.theatre-puteaux.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 92
    _off('theatrestudio', "Théâtre-Studio d'Alfortville", 'https://www.theatre-studio.com/',
         'probe 2026-10-09: detail page https://www.theatre-studio.com/spectacle/la-fete-du-vieux-dapres-shakespeare/ has no Event (JSON-LD types: none).'),  # 94
    _off('theatretrevise', 'Théâtre Trévise', 'https://www.theatre-trevise.com/',
         "probe 2026-10-09: no Event data on https://theatre-trevise.com/ (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 75
    _off('tobb', "Théâtre de l'Ouest Parisien – Boulogne", 'https://www.tobb.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 92
    _off('tqi', "Théâtre des Quartiers d'Ivry", 'https://www.theatre-quartiers-ivry.com/',
         'probe 2026-10-09: detail page https://www.theatre-quartiers-ivry.com/saison/les-vagabondes.htm has no Event (JSON-LD types: none).'),  # 94
    _off('tristanbernard', 'Théâtre Tristan-Bernard', 'https://www.theatre-tristan-bernard.fr/',
         'probe 2026-10-09: domain does not resolve (URL unknown / site gone)'),  # 75
    _off('triton', 'Le Triton', 'https://www.letriton.com/',
         'probe 2026-10-09: detail page https://letriton.com/concert/pifarely-roy-ducret-2026-10-09 has no Event (JSON-LD types: none).'),  # 93
    _off('trr', 'Théâtre Romain Rolland – Villejuif', 'https://www.trr.fr/',
         "probe 2026-10-09: detail page https://trr.fr/spectacles/le-roi-lear/ has no Event (JSON-LD types: ['BreadcrumbList', 'ImageObject', 'ListItem', 'Organization', 'WebPage'])."),  # 94
    _off('vanves', 'Théâtre de Vanves', 'https://www.theatre-vanves.fr/',
         'probe 2026-10-09: detail page https://www.theatre-vanves.fr/spectacle/decadanse-11/ has no Event (JSON-LD types: none).'),  # 92
    _off('villettesonique', 'Villette Sonique', 'https://www.villettesonique.com/',
         'probe 2026-10-09: timeout: timeout error: timed out'),  # 75
    _off('vingtieme', 'Vingtième Théâtre', 'https://www.vingtiemetheatre.com/',
         "probe 2026-10-09: no Event data on https://vingtiemetheatre.com/ (JSON-LD types: ['Article', 'BreadcrumbList', 'ListItem', 'Product', 'WebSite'])."),  # 75
    _off('welovegreen', 'We Love Green', 'https://www.welovegreen.fr/',
         "probe 2026-10-09: detail page https://www.welovegreen.fr/artist/erin-lecount/ has no Event (JSON-LD types: ['BreadcrumbList', 'ListItem', 'WebPage', 'WebSite'])."),  # 75
    _off('ysl', 'Musée Yves Saint Laurent Paris', 'https://museeyslparis.com/',
         "probe 2026-10-09: detail page https://museeyslparis.com/expositions/yves-saint-laurent-formes has no Event (JSON-LD types: ['NGO', 'Place', 'Website'])."),  # 75
    _off('zebre', 'Le Zèbre de Belleville', 'https://www.lezebre.com/',
         'probe 2026-10-09: TLS failure: [SSL: TLSV1_ALERT_INTERNAL_ERROR] tlsv1 alert internal error (_ssl.c:1129)'),  # 75
]

ALL_VENUES: List[VenueSource] = VENUES + DISCOVERED_VENUES
VENUES_BY_KEY: Dict[str, VenueSource] = {v.key: v for v in VENUES}  # curated only
ALL_VENUES_BY_KEY: Dict[str, VenueSource] = {v.key: v for v in ALL_VENUES}
assert len(ALL_VENUES_BY_KEY) == len(ALL_VENUES), "duplicate venue key"
