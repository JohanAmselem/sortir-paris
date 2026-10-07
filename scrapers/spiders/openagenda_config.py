"""
Curated list of OpenAgenda agendas for Paris / Île-de-France.

How these UIDs were verified (2026-10-07): each UID was returned by OpenAgenda's
public agenda search (https://openagenda.com/agendas.json?search=...&official=1)
or uid lookup (https://openagenda.com/agendas.json?uid[]=...), which gives the
agenda title, slug, "official" flag and its count of upcoming events. Counts in
comments are "upcoming / current" on that date, to spot dormant agendas later.

Rules:
- Only UIDs confirmed to exist are listed. Entries that exist but are doubtful
  (off-topic, national aggregators, possible duplicates, outside IDF) are kept
  commented out with the reason.
- To find more: `python -c "from spiders.openagenda import discover_agendas; ..."`
  (needs OPENAGENDA_API_KEY) or the public search URL above in a browser.
- City of Paris libraries, mairies d'arrondissement, Paris Musées and the
  Philharmonie do NOT publish on OpenAgenda (searched 2026-10-07). The libraries
  and mairies are covered by the "Que faire à Paris" open-data dataset
  (spiders/paris_opendata.py, group "Bibliothèques").
"""

from __future__ import annotations

AGENDA_IDS = [
    # ── Original list (kept; several are dormant on 2026-10-07) ──
    64649366,   # Parc de la Villette (parcvilletteparis) — 22 / 150, aggregates Cité des sciences
    83174464,   # La Gaîté Lyrique — 0 upcoming (dormant)
    35234157,   # Théâtre Mandapa — 7 upcoming
    37232304,   # Centre Pompidou — 0 upcoming (dormant, closed for works)
    36691733,   # Opéra national de Paris — 0 upcoming (dormant)
    61774014,   # Jeu de Paume — 0 upcoming (dormant, not "official")
    74002720,   # Fondation Louis Vuitton — 0 upcoming (dormant)
    # 65853096, # "Musée du Petit Palais" — WRONG: this is the Petit Palais in AVIGNON
    #           #   (location set "Lieux d'Avignon"), not Paris. Disabled.

    # ── Paris (75) — added 2026-10-07 ──
    76126842,   # Cité des sciences et de l'industrie (cite-des-sciences) — 20 / 152
    78042370,   # Palais de la découverte / Palais des enfants — 4 / 3
    39942705,   # Cabaret Sauvage (Paris 19e) — 8 upcoming
    61665301,   # FICEP — Forum des Instituts Culturels Étrangers à Paris — 42 / 17
    12120678,   # Centre Culturel de Taïwan à Paris — 3 / 2
    95082863,   # Centre Wallonie-Bruxelles Paris — 2 / 1
    20685588,   # Cité internationale des arts — 1 upcoming
    2707619,    # Paris14 Territoire de Cinéma — 34 upcoming
    37836092,   # Agenda littéraire de la Librairie de Paris (place de Clichy) — 12 upcoming

    # ── Île-de-France — regional cultural agendas ──
    1388317,    # Journées nationales de l'architecture 2026 : Île-de-France — 237 upcoming
    54154994,   # Le RIF — réseau des musiques actuelles en Île-de-France — 366 / 5
    22790778,   # Collectif Musiques et Danses du Monde en Île-de-France — 2 upcoming

    # ── Hauts-de-Seine (92) ──
    11207540,   # Ville de Meudon — 318 / 37
    1007085,    # Ville de Sèvres — 39 upcoming
    85121895,   # Grand Paris Seine Ouest (GPSO) — 37 upcoming
    36002164,   # L'Avant Seine (théâtre de Colombes) — 64 / 11
    43702874,   # Théâtre Rutebeuf (Clichy) — 33 upcoming
    68088585,   # Musée Français de la Carte à Jouer (Issy-les-Moulineaux) — 2 upcoming

    # ── Seine-Saint-Denis (93) ──
    85936066,   # Ville de Pantin — 19 / 2
    20768029,   # Bibliothèques de Pantin — 8 / 3
    88114046,   # Bibliothèques de Montreuil — 32 / 6
    83907687,   # Conservatoire de Montreuil — 3 upcoming
    20261407,   # Réseau des conservatoires d'Est Ensemble — 31 upcoming
    52892578,   # Conservatoire de Romainville — 31 upcoming
    54300269,   # Bibliothèque Denis-Diderot (Bondy) — 6 / 1
    81744645,   # Saison culturelle Conservatoire de Bondy — 10 upcoming
    6063335,    # Bibliothèque André-Malraux (Les Lilas) — 4 / 3
    8914188,    # Bibliothèque François-Mitterrand (Le Pré-Saint-Gervais) — 8 / 3
    72271823,   # Théâtre du Blanc-Mesnil — 43 upcoming
    13935165,   # Théâtre L'Échangeur (Bagnolet) — 3 upcoming
    54046098,   # MAAD 93 (musiques actuelles, Seine-Saint-Denis) — 88 upcoming

    # ── Val-de-Marne (94) ──
    1118828,    # Ville de Villiers-sur-Marne — 11 / 1

    # ── Yvelines (78) ──
    10387409,   # Ville de Versailles — 534 / 63
    72120377,   # Réseau des bibliothèques de Versailles — 56 / 9
    99371247,   # Musée Lambinet (Versailles) — 8 / 5
    36994113,   # Conservatoire à Rayonnement Régional de Versailles Grand Parc — 103 upcoming
    60701331,   # Saint-Quentin-en-Yvelines (SQY) — 369 / 10
    33952218,   # Musée de la Ville de Saint-Quentin-en-Yvelines — 5 / 4
    41751401,   # Ville de Buc — 30 upcoming
    17477744,   # Théâtre Alphonse Daudet (Coignières) — 17 upcoming
    65855330,   # Théâtre Coluche (Plaisir) — 24 upcoming
    9781523,    # Théâtre Albert Camus (Maurepas) — 21 upcoming

    # ── Essonne (91) / Seine-et-Marne (77) ──
    60662226,   # Saison culturelle Val d'Yerres Val de Seine — 84 upcoming
    38254283,   # Château et parc de Champs-sur-Marne — 7 upcoming

    # ── Val-d'Oise (95) ──
    91962954,   # Roissy Pays de France (agglomération) — 154 / 11
    78494514,   # Médiathèques de Roissy Pays de France — 98 / 16
    37227192,   # Ville de Sarcelles — 32 / 1
    33717866,   # Ville de Goussainville — 18 / 2
    90134339,   # Combo95 (musiques actuelles, Val-d'Oise) — 42 upcoming
]

# Exist, but disabled on purpose (verified the same way):
#   56500817  OpenAgenda en Île-de-France — 3111 upcoming: huge regional aggregator, mixes
#             non-cultural events; enable only after checking quality / duplicates.
#   61694203  Versailles Grand Parc — 663 upcoming: overlaps Ville de Versailles + CRR.
#   82290100  Diocèse de Paris — 180 upcoming: organ concerts but mostly masses / services.
#   70296720  Saint-Eustache (diocèse) — 6 upcoming: same remark.
#   97606842  DRAC Île-de-France, tableau de bord théâtre — 248: touring dashboard, venues all over.
#   73237661  DRAC Île-de-France, calendrier musique — 29: same remark.
#   86184123  Université Paris-Saclay — 83: mostly academic seminars.
#   68165804  Île-de-France Nature Animations — 34: nature outings, not cultural.
#   20272888  JASS CLUB PARIS — 66: nature of the agenda not confirmed.
#   5790361   Info Jeunes Paris — 9: youth information sessions.
#   49731145  Quartiers populaires du 14ème — 26: neighbourhood life.
#   1540494   Théâtre Rutebeuf saison 2026-2027 — duplicate of 43702874.
