# Event sources

Status as of **2026-10-07**. All live checks used the honest User-Agent `PanameClubBot/1.0 (+https://www.panameclub.fr)` at 1 request per second, with a handful of pages per source. No browser user agent was spoofed and no challenge was bypassed.

The registry is `sources.py`; run `python cron.py --list` to see it. To enable or disable a source, change one line there. Every spider builds events with `utils/event.make_event`. Validation (`validation.py`) then decides whether each one is published.

**Legal basis**
- **open data**: published under an open licence.
- **official API**: documented API, accessed with a key.
- **public structured data**: schema.org JSON-LD, microdata or iCal that the site publishes for machines.
- **scraping**: parsing the visible HTML.

## Enabled

| Source (`source`) | Group | Type | Legal basis | Status | Volume / run | Notes |
|---|---|---|---|---|---|---|
| `paris_opendata` | official | Explore v2.1 API, dataset `que-faire-a-paris-` | open data (ODbL) | ✅ verified live | ~3,600 | **Key source.** The `+00:00` offsets are wrong (the times are Paris local), so real times are read from `occurrences`. The "Plusieurs lieux" placeholder point is dropped. Keyset paging is used past 10k records. |
| `openagenda` | official | OpenAgenda API v2 | official API | 🟡 repaired, not tested live (no key) | 2–3,000 per agenda | **Key source.** Needs `OPENAGENDA_API_KEY`. About 60 curated agendas in `spiders/openagenda_config.py`, checked through the keyless public search. Uses the next upcoming timing, keeps the end of the run, reads registration `{type,value}`, and isolates each agenda's failure. |
| `parismusees` | official | parismusees.paris.fr listing + detail pages | scraping | ✅ verified live | ~15 exhibitions | No open-data feed and no JSON-LD. |
| `ticketmaster` | ticketing | Discovery API v2 | official API | 🟡 new, not tested live (no key) | unknown (likely hundreds) | Needs `TICKETMASTER_API_KEY`. Skipped with a log line when the key is missing. |
| `billetreduc` | ticketing | listing ItemList + Event JSON-LD | public structured data | ✅ verified live | ~150–180 | It inserted 0 rows before because the JSON-LD `type` attribute is HTML-escaped. |
| `eventbrite` | ticketing | `__SERVER_DATA__` + Event JSON-LD | public structured data | ✅ verified live | ~150–300 | Keeps Île-de-France only (bounding box or postcode), filters off-topic business events and online events, and reads AggregateOffer prices. |
| `meetup` | ticketing | `__NEXT_DATA__` / Apollo state on the find page | public structured data | ✅ verified live | ~40–60 | Online events are dropped. Price comes only from `feeSettings`, otherwise it is unknown. |
| `dice` | ticketing | `__NEXT_DATA__` on dice.fm/browse/paris | public structured data | ✅ verified live | ~150–250 | The old API endpoint was guessed and has been replaced. |
| `sortiraparis` | media | Event microdata on article pages | scraping (microdata) | ✅ verified live | ≤120 | Items without a real date are skipped, as are "jusqu'au …"-only items. |
| `timeout` | media | Review JSON-LD → `itemReviewed` Event | public structured data | ✅ verified live | ~10–40 | List and article pages are skipped. |
| `offi` | media | Event microdata cards + AggregateOffer on detail pages | scraping (microdata) | ✅ verified live | ~250–375 | Cinema is skipped (covered by allocine). |
| `theatreonline` | media | Event microdata cards | scraping (microdata) | ✅ verified live | ~300 | Dates only (`time_known=false`). |
| `venues` → `venue_<key>` | venues | generic JSON-LD / iCal spider (`spiders/venues_config.py`) | public structured data | ✅ verified live | ~150 in total | Enabled venues: Bataclan, Olympia, Théâtre du Châtelet, La Cigale, Maison de la Radio et de la Musique, Musée de l'Orangerie, Le Comedy Club (ics), Sunset-Sunside (ics). Adding a venue takes one config line. |
| `newmorning` | venues | JSON-LD listing + detail pages for the real times | public structured data | ✅ verified live | ~70 | The JSON-LD shows 00:00 start times and "0.00" prices, both of which are wrong, so they are treated as unknown. |
| `parisjazzclub` | venues | schema.org microdata cards | public structured data | ✅ verified live | ~500 (45 pages, 7 days) | Each event uses the real club as its venue. The 22:00 hardcoded time is gone. |
| `allocine` | cinema | public JSON behind the theater pages (`/_/showtimes/theater-…`) | public structured data | ✅ verified live | ~3,000–5,000 film-days | Only real showtimes are kept, 7 days ahead (Allociné publishes the Wednesday→Tuesday programme on Monday/Tuesday; unpublished days are skipped). There is one event per film × cinema × day, with all showtimes in the description. The cinema table was rebuilt: most old codes pointed to the wrong cinema. |

## Disabled (kept in the code, `enabled=False`)

| Source | Reason | Path to re-enable |
|---|---|---|
| `tmdb` | It invented screenings. It is now only used to enrich allocine (`enrich_film`), never as an event source. | — (set `TMDB_API_KEY` for posters and synopses) |
| `paris_fr` | It shows the same records as `paris_opendata` (paris.fr/quefaire is the front-end for that dataset). | Not needed. |
| `quefaire_paris` | The site is in maintenance (`/fiches/all` returns 404), and it carries the same data as `paris_opendata`. | Not needed. |
| `infoconcert` | Blocked: Cloudflare returns 403 "Just a moment…" to the bot UA. A JSON-LD parser and placeholder-image filter are ready. | Ask for partner access or for the UA to be allowed. |
| `lebonbon` | The site only has editorial articles: no event date and no venue. It used to ingest articles as events. | Only if the site publishes Event JSON-LD again. |
| `fnacspectacles` | Every request times out for the bot UA, including robots.txt. | Partner feed or allowed UA. |
| `mapado` | `/paris` returns 404; mapado.com is now a B2B ticketing/CRM site. | Point `listing_urls` at organiser ticketing pages. |
| `shotgun` | Blocked by a Vercel Security Checkpoint (HTTP 429 JS challenge). | Partner API. |
| `bandsintown` | The site returns a Cloudflare 403, and the official API is artist-based (403 for an unapproved app_id). | Set `BANDSINTOWN_APP_ID` + `BANDSINTOWN_ARTISTS`. |

## Venues checked for the generic spider but not usable

Each of these is listed in `spiders/venues_config.py` with `enabled=False` and a note giving the reason.

| Reason | Venues |
|---|---|
| JS-rendered, no server-side events | Philharmonie / Cité de la musique, Le Centquatre (Nuxt), Théâtre du Rond-Point (Nuxt), Bouffes du Nord, Louvre (Next.js), Casino de Paris, Folies Bergère, Bobino, Seine Musicale, Salle Gaveau, Grand Rex, Café de la Gare, Jacquemart-André, Marmottan |
| No Event JSON-LD (Article, WebPage or nothing) | Théâtre de la Ville, Forum des images, Cinémathèque (would need an HTML parser), BnF, Institut du monde arabe, Palais de Tokyo, Fondation Cartier, Gaîté Lyrique, Petit Bain, Trianon, Ground Control, Maison de la Poésie, Machine du Moulin Rouge, Musée Picasso, Salle Pleyel, La Scala, Bal Blomet, Duc des Lombards, Quai Branly, Théâtre des Champs-Élysées, La Colline, Café de la Danse, Opéra de Paris, Point Éphémère, FGO-Barbara, Odéon, MAD, Bourse de Commerce, Petit Palais (covered by `parismusees`), Cité des sciences (covered by OpenAgenda), Élysée Montmartre, Trabendo, Bellevilloise, Théâtre de Paris, Accor Arena, Adidas Arena, Montparnasse, Marigny |
| Event JSON-LD present but no usable location | Centre Pompidou (building closed for works; events take place elsewhere) |
| robots.txt disallows the agenda | La Villette (covered by OpenAgenda 64649366), La Maroquinerie |
| Blocked (403, challenge, TLS failure) | Musée d'Orsay (403 + challenge), Fondation Louis Vuitton (403), Comédie-Française (404 to the bot), Grand Palais (TLS), Paris La Défense Arena (TLS) |
| Broken or empty | Le Hasard Ludique (HTTP 500), Pan Piper (DNS), Théâtre de l'Atelier (empty iCal), Point Virgule (timeout), Mogador (redirects to stage-entertainment.fr) |

## Operations

- **Schedule.** `.github/workflows/daily-scrape.yml` runs at 05:30 and 15:30 UTC. The matrix has one job per group (official / ticketing / media / venues / cinema), each with a 45-minute limit, followed by `cron.py --post`, which runs geocoding (address, then venue name via BAN / OpenStreetMap), venue linking (`canonical_venue_id`), re-scoring, hiding per-date rows of collapsed series, cross-source dedup, category reclassification, expiry and purge.
- **Series.** Before ingestion, `utils/series.py` turns ≥ 4 sessions of the same title at the same venue into one event spanning them (`<source>-series-<hash>`), for every source except cinema (allocine, cinematheque, forumdesimages).
- **Logs.** Each source writes one row to `ingestion_logs`, with the real start time and a truncated list of errors.
- **Failures.** A group job fails (exit 1) when a key source returns 0 events, when a source drops more than 60 % against its last successful run (if that run had ≥ 20 events), or when a source crashes.
- **Running locally.** `python cron.py --source <name> --dry-run` fetches and validates without touching the database. `pytest` runs entirely offline on the fixtures in `tests/fixtures/`.
