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
- To find more: `python -m tools.discover_openagenda` (no key needed; see the
  DISCOVERED_AGENDAS section below), or `spiders.openagenda.discover_agendas`
  (needs OPENAGENDA_API_KEY).
- Service zone since 2026-10-09: Paris + petite couronne (75/92/93/94) only. Agendas
  of other departments are kept in OUT_OF_ZONE_AGENDA_IDS and not fetched.
- City of Paris libraries, mairies d'arrondissement, Paris Musées and the
  Philharmonie do NOT publish on OpenAgenda (searched 2026-10-07). The libraries
  and mairies are covered by the "Que faire à Paris" open-data dataset
  (spiders/paris_opendata.py, group "Bibliothèques").
"""

from __future__ import annotations

from typing import Dict, List, Set, Tuple

CURATED_AGENDA_IDS = [
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

DISABLED_AGENDA_IDS = [
    56500817, 61694203, 82290100, 70296720, 97606842, 73237661, 86184123,
    68165804, 20272888, 5790361, 49731145, 1540494,
    65853096,  # Petit Palais d'AVIGNON (see above)
]

# ── Outside the service zone (Paris + 92/93/94) since 2026-10-09 ──
# Kept for reference but NOT fetched: every event would be rejected as out_of_zone
# by validation.py, so fetching them only costs requests.
OUT_OF_ZONE_AGENDA_IDS = [
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

# Main department of the curated agendas ("idf" = regional, events spread over IDF:
# fetched with the server-side `department[]` filter).
CURATED_DEPT: Dict[int, str] = {
    **{uid: "75" for uid in (64649366, 83174464, 35234157, 37232304, 36691733, 61774014,
                             74002720, 76126842, 78042370, 39942705, 61665301, 12120678,
                             95082863, 20685588, 2707619, 37836092)},
    **{uid: "idf" for uid in (1388317, 54154994, 22790778)},
    **{uid: "92" for uid in (11207540, 1007085, 85121895, 36002164, 43702874, 68088585)},
    **{uid: "93" for uid in (85936066, 20768029, 88114046, 83907687, 20261407, 52892578,
                             54300269, 81744645, 6063335, 8914188, 72271823, 13935165,
                             54046098)},
    **{uid: "94" for uid in (1118828,)},
}

# ── Discovered with tools/discover_openagenda.py (keyless public search + a sample of
# each agenda's current/upcoming events located in 75/92/93/94) ──
# (uid, main department, mode): mode "all" = fetch every event (≥ 50 % in zone in the
# sample), "dept" = fetch with department[]=Paris/Hauts-de-Seine/Seine-Saint-Denis/
# Val-de-Marne (regional agendas where most events are outside the zone).
# Comment: title — upcoming/current on 2026-10-09, sampled events in zone / located.
DISCOVERED_AGENDAS: List[Tuple[int, str, str]] = [
# DISCOVERED-BEGIN
    (87270972, "75", "all"),  # Échosciences — 255/275, 79/99 in zone  # discovered 2026-10-09
    (78111427, "75", "all"),  # Union Fédérale d'Intervention des Structures Culturelles — 496/11, 50/99 in zone  # discovered 2026-10-09
    (71750868, "75", "all"),  # Vie parisienne — 163/130, 69/86 in zone  # discovered 2026-10-09
    (2869079, "75", "all"),  # [non-official] Agenda Koreance — France Corée — 14/211, 99/100 in zone  # discovered 2026-10-09
    (7107617, "75", "all"),  # [non-official] Une Semaine en Galerie 2026 — 119/0, 97/100 in zone  # discovered 2026-10-09
    (71022838, "75", "all"),  # Étincelles du Palais de la découverte — 1/103, 100/100 in zone  # discovered 2026-10-09
    (75354844, "75", "all"),  # Collège des Bernardins — 70/0, 70/70 in zone  # discovered 2026-10-09
    (51511017, "75", "all"),  # ACP la Manufacture Chanson — 59/4, 62/62 in zone  # discovered 2026-10-09
    (16031938, "75", "all"),  # Institut-culturel — 43/17, 48/52 in zone  # discovered 2026-10-09
    (36351557, "75", "all"),  # Les événements des Librairies Le Divan & Le Divan Perché — 49/0, 47/47 in zone  # discovered 2026-10-09
    (45968730, "75", "all"),  # Théâtre accessible - Agenda Panthea — 27/4, 16/30 in zone  # discovered 2026-10-09
    (21059017, "75", "all"),  # [non-official] Maison de la Poésie - Scène littéraire — 26/0, 25/25 in zone  # discovered 2026-10-09
    (54045603, "75", "all"),  # [non-official] Agenda de concerts — 23/0, 20/23 in zone  # discovered 2026-10-09
    (81942013, "75", "all"),  # Agenda de l'Europe en Île-de-France — 19/3, 10/14 in zone  # discovered 2026-10-09
    (62752038, "75", "all"),  # Maison du Film — 15/1, 16/16 in zone  # discovered 2026-10-09
    (27009408, "75", "all"),  # Les événements de la Librairie Compagnie ! — 16/0, 12/12 in zone  # discovered 2026-10-09
    (90349001, "75", "all"),  # [non-official] Le Pavillon de la Sirène — 15/0, 15/15 in zone  # discovered 2026-10-09
    (18084807, "75", "all"),  # Centre Culturel Coréen — 13/2, 11/11 in zone  # discovered 2026-10-09
    (15872090, "75", "all"),  # Les rendez-vous littéraires de la Librairie Gallimard — 14/0, 12/12 in zone  # discovered 2026-10-09
    (11308355, "75", "all"),  # [non-official] Bibliothèques de sciences de Sorbonne Université — 9/3, 12/12 in zone  # discovered 2026-10-09
    (66992768, "75", "all"),  # [non-official] Les soirées littéraires de la Librairie Delamain — 11/0, 9/9 in zone  # discovered 2026-10-09
    (64254514, "75", "all"),  # [non-official] Librairie de la Pyramide — 11/0, 11/11 in zone  # discovered 2026-10-09
    (36965439, "75", "all"),  # Mon été, ma région - Culture — 8/2, 8/10 in zone  # discovered 2026-10-09
    (19238272, "75", "all"),  # [non-official] Réseau MAP — 9/0, 9/9 in zone  # discovered 2026-10-09
    (64179403, "75", "all"),  # Institut suédois — 6/2, 6/6 in zone  # discovered 2026-10-09
    (23559850, "75", "all"),  # Institut Liszt Paris — 6/0, 4/4 in zone  # discovered 2026-10-09
    (504556, "75", "all"),  # [non-official] Philharmonie de Paris - Saison 26/27 — 5/1, 6/6 in zone  # discovered 2026-10-09
    (7664421, "75", "all"),  # [non-official] Festival Signes d'Automne 2026 — 6/0, 6/6 in zone  # discovered 2026-10-09
    (63547808, "75", "all"),  # Arc de triomphe — 0/6, 6/6 in zone  # discovered 2026-10-09
    (19992582, "75", "all"),  # Institut du Monde Arabe — 5/1, 6/6 in zone  # discovered 2026-10-09
    (10283953, "75", "all"),  # [non-official] Conservatoire — 6/0, 5/5 in zone  # discovered 2026-10-09
    (5504885, "75", "all"),  # [non-official] S’émouvoir autrement — 6/0, 5/5 in zone  # discovered 2026-10-09
    (69114427, "75", "all"),  # La Sirène de Paris, orchestre d'harmonie & brass band — 5/0, 5/5 in zone  # discovered 2026-10-09
    (71066517, "75", "all"),  # [non-official] Kilomètre Zéro — 5/0, 5/5 in zone  # discovered 2026-10-09
    (6820858, "75", "all"),  # [non-official] Dramaturgie d’une Renaissance — 5/0, 5/5 in zone  # discovered 2026-10-09
    (35423840, "75", "all"),  # [non-official] L'agenda de la Fédération Patrimoine-Environnement — 5/0, 2/2 in zone  # discovered 2026-10-09
    (4130852, "75", "all"),  # Mission spatiale — 0/4, 4/4 in zone  # discovered 2026-10-09
    (6899331, "75", "all"),  # Centre tchèque de Paris — 3/0, 2/2 in zone  # discovered 2026-10-09
    (60537271, "75", "all"),  # Centre culturel canadien — 2/1, 3/3 in zone  # discovered 2026-10-09
    (7888303, "75", "all"),  # Vivre le patrimoine culturel immatériel : Île-de-France — 0/3, 3/3 in zone  # discovered 2026-10-09
    (9983879, "75", "all"),  # Cirque électrique — 3/0, 3/3 in zone  # discovered 2026-10-09
    (85913886, "75", "all"),  # Institut finlandais — 1/1, 2/2 in zone  # discovered 2026-10-09
    (9286031, "75", "all"),  # Anqa — 0/2, 2/2 in zone  # discovered 2026-10-09
    (11236384, "75", "all"),  # ARTMELE — 2/0, 2/2 in zone  # discovered 2026-10-09
    (9969608, "idf", "dept"),  # Shotgun — 5117/28, 49/100 in zone  # discovered 2026-10-09
    (86244142, "idf", "dept"),  # Ministère de la culture - Tous les événements — 1804/183, 11/95 in zone  # discovered 2026-10-09
    (2568169, "idf", "dept"),  # Bicentenaire de la Photographie - 2026-2027 — 1253/280, 7/99 in zone  # discovered 2026-10-09
    (82566953, "idf", "dept"),  # AgendaTrad — 1404/2, 4/100 in zone  # discovered 2026-10-09
    (41240026, "idf", "dept"),  # SCARE - Syndicat des Cinémas d'Art, de Répertoire et d'Essai — 781/1, 14/100 in zone  # discovered 2026-10-09
    (889555, "idf", "dept"),  # FESTIVAL CULTURE BAR-BARS — 524/0, 3/100 in zone  # discovered 2026-10-09
    (30166879, "idf", "dept"),  # Confédération Musicale de France — 368/12, 4/100 in zone  # discovered 2026-10-09
    (6862496, "idf", "dept"),  # RNCAP — 297/7, 10/99 in zone  # discovered 2026-10-09
    (60711089, "idf", "dept"),  # Sites & Cités — 179/110, 16/100 in zone  # discovered 2026-10-09
    (75742032, "idf", "dept"),  # Écoles, universités et recherche — 260/21, 4/93 in zone  # discovered 2026-10-09
    (6068900, "idf", "dept"),  # Centre des Monuments Nationaux — 145/108, 15/100 in zone  # discovered 2026-10-09
    (14115607, "idf", "dept"),  # Unidivers Oui sortir, vos deux agendas ! — 188/58, 11/100 in zone  # discovered 2026-10-09
    (64295436, "idf", "dept"),  # Api'Week 2026 — 124/100, 12/100 in zone  # discovered 2026-10-09
    (1854436, "idf", "dept"),  # Saison Méditerranée 2026 — 150/26, 31/99 in zone  # discovered 2026-10-09
    (69750790, "idf", "dept"),  # Réseau TMN — 154/3, 45/100 in zone  # discovered 2026-10-09
    (99155778, "idf", "dept"),  # EcoNature — 34/118, 21/100 in zone  # discovered 2026-10-09
    (4310687, "idf", "dept"),  # Zone Franche — 139/3, 36/100 in zone  # discovered 2026-10-09
    (35777956, "idf", "dept"),  # La Palestine à l'Affiche — 107/14, 18/98 in zone  # discovered 2026-10-09
    (435523, "idf", "dept"),  # Saison Cabaret — 92/15, 33/96 in zone  # discovered 2026-10-09
    (39001109, "idf", "dept"),  # Place Locale — 82/14, 40/94 in zone  # discovered 2026-10-09
    (22695649, "idf", "dept"),  # Accueil agenda spectacle vivant - DRAC : Nouvelle-Aquitaine — 79/0, 4/78 in zone  # discovered 2026-10-09
    (66324610, "idf", "dept"),  # Agenda l'Europe s'engage en France — 50/12, 10/52 in zone  # discovered 2026-10-09
    (69270915, "idf", "dept"),  # HK près de chez vous — 35/0, 3/35 in zone  # discovered 2026-10-09
    (76685088, "idf", "dept"),  # Tournée des équipes Théâtre - Bourgogne-Franche-Comté — 28/0, 5/26 in zone  # discovered 2026-10-09
    (51149534, "idf", "dept"),  # Infos Musicien·ne·s — 25/0, 8/25 in zone  # discovered 2026-10-09
    (18027291, "idf", "dept"),  # Association des Planétariums de Langue Française — 10/14, 11/23 in zone  # discovered 2026-10-09
    (63637214, "idf", "dept"),  # Mon été, ma région — 11/7, 8/18 in zone  # discovered 2026-10-09
    (16831813, "idf", "dept"),  # calendrier danse — 7/0, 3/7 in zone  # discovered 2026-10-09
    (80515007, "92", "all"),  # L'agenda de la ville d'Issy-les-Moulineaux — 412/12, 100/100 in zone  # discovered 2026-10-09
    (16265731, "92", "all"),  # CLAVIM — 264/6, 99/99 in zone  # discovered 2026-10-09
    (37677191, "92", "all"),  # Le Temps des Cerises — 95/2, 96/96 in zone  # discovered 2026-10-09
    (62521262, "92", "all"),  # L'Azimut — 84/1, 79/82 in zone  # discovered 2026-10-09
    (31101747, "92", "all"),  # Saison culturelle — 69/2, 70/70 in zone  # discovered 2026-10-09
    (16624806, "92", "all"),  # Les Médiathèques d'Issy-les-Moulineaux — 59/3, 62/62 in zone  # discovered 2026-10-09
    (50008175, "92", "all"),  # Médiathèques et des espaces numériques — 54/7, 59/59 in zone  # discovered 2026-10-09
    (13420061, "92", "all"),  # Programmation du Sel — 32/0, 31/31 in zone  # discovered 2026-10-09
    (41998231, "92", "all"),  # Espace Jeunes Anne Frank — 31/0, 30/30 in zone  # discovered 2026-10-09
    (28909405, "92", "all"),  # Potager du Dauphin — 25/3, 26/26 in zone  # discovered 2026-10-09
    (18309955, "92", "all"),  # [non-official] Hauts de Seine — 23/0, 22/22 in zone  # discovered 2026-10-09
    (4511419, "92", "all"),  # L'agenda culturel d'Issy-les-Moulineaux — 22/0, 22/22 in zone  # discovered 2026-10-09
    (77743260, "92", "all"),  # L'Espace Andrée Chedid — 19/2, 15/15 in zone  # discovered 2026-10-09
    (40170198, "92", "all"),  # [non-official] Santé — 19/2, 15/15 in zone  # discovered 2026-10-09
    (21666234, "92", "all"),  # Musée d'art et d'histoire de Meudon — 15/1, 11/11 in zone  # discovered 2026-10-09
    (80268051, "92", "all"),  # Maison de la nature et de l'arbre - GPSO — 15/0, 15/15 in zone  # discovered 2026-10-09
    (36715635, "92", "all"),  # [non-official] Fête du cinéma d'animation - à Issy — 13/0, 13/13 in zone  # discovered 2026-10-09
    (71581037, "92", "all"),  # [non-official] Maison de la musique - scène conventionnée d'intérêt national — 12/0, 11/11 in zone  # discovered 2026-10-09
    (95883062, "92", "all"),  # Le Réacteur — 9/0, 8/8 in zone  # discovered 2026-10-09
    (52644797, "92", "all"),  # La Halle des Épinettes — 9/0, 8/8 in zone  # discovered 2026-10-09
    (77225185, "92", "all"),  # 25 de la Vallée — 9/0, 8/8 in zone  # discovered 2026-10-09
    (47666995, "92", "all"),  # Le Tamanoir | Salle de Concert - Gennevilliers — 9/0, 9/9 in zone  # discovered 2026-10-09
    (19554588, "92", "all"),  # Le Ciné d'Issy — 7/1, 8/8 in zone  # discovered 2026-10-09
    (78367046, "92", "all"),  # Faculté Jean Monnet (Droit, Économie, Management) de l'Université Pari — 6/1, 4/5 in zone  # discovered 2026-10-09
    (29505025, "92", "all"),  # [non-official] Cycle Mémoire et citoyenneté — 6/0, 6/6 in zone  # discovered 2026-10-09
    (14237618, "92", "all"),  # [non-official] L'Atelier Janusz Korczak — 5/0, 5/5 in zone  # discovered 2026-10-09
    (99273395, "92", "all"),  # [non-official] Ludothèque — 5/0, 5/5 in zone  # discovered 2026-10-09
    (16261277, "92", "all"),  # Les espaces ludiques d'Issy-les-Moulineaux — 3/0, 1/1 in zone  # discovered 2026-10-09
    (88982272, "92", "all"),  # Couleurs Japon — 3/0, 3/3 in zone  # discovered 2026-10-09
    (95716291, "93", "all"),  # Agenda Temps Libres — 190/26, 97/97 in zone  # discovered 2026-10-09
    (71121803, "93", "all"),  # [non-official] Public Agenda — 153/16, 96/97 in zone  # discovered 2026-10-09
    (93479028, "93", "all"),  # [non-official] Agenda global — 35/6, 34/40 in zone  # discovered 2026-10-09
    (14898606, "93", "all"),  # Sortir & bouger à Montreuil — 30/7, 36/36 in zone  # discovered 2026-10-09
    (96493090, "93", "all"),  # Mains d'Œuvres — 33/1, 34/34 in zone  # discovered 2026-10-09
    (6655871, "93", "all"),  # [non-official] Académie Fratellini - Saison 26-27 — 33/0, 33/33 in zone  # discovered 2026-10-09
    (11028977, "93", "all"),  # Le Triton — 32/0, 31/31 in zone  # discovered 2026-10-09
    (30777520, "93", "all"),  # [non-official] Agenda Conservatoire de Danse et de Musique E. Satie de Bagnolet — 31/0, 29/29 in zone  # discovered 2026-10-09
    (81008507, "93", "all"),  # [non-official] Agenda Conservatoire Gabriel Fauré des Lilas — 31/0, 29/29 in zone  # discovered 2026-10-09
    (20245077, "93", "all"),  # [non-official] Agenda Conservatoire de Noisy-le-Sec — 31/0, 29/29 in zone  # discovered 2026-10-09
    (98936265, "93", "all"),  # Programmation du Théâtre Public de Montreuil — 13/1, 14/14 in zone  # discovered 2026-10-09
    (25266294, "93", "all"),  # Le Pré Saint-Gervais — 8/3, 11/11 in zone  # discovered 2026-10-09
    (6430408, "93", "all"),  # Théâtre des Bergeries - Noisy-le-Sec (93) — 10/0, 9/9 in zone  # discovered 2026-10-09
    (64158634, "93", "all"),  # [non-official] MAISON POPULAIRE — 7/2, 8/8 in zone  # discovered 2026-10-09
    (62529616, "93", "all"),  # [non-official] Conservatoire de Pantin — 9/0, 8/8 in zone  # discovered 2026-10-09
    (13774959, "93", "all"),  # [non-official] Le Drunken (A la bière comme à la bière) — 6/0, 6/6 in zone  # discovered 2026-10-09
    (83009536, "93", "all"),  # [non-official] L'Odéon de Tremblay (93) — 5/0, 5/5 in zone  # discovered 2026-10-09
    (93310375, "93", "all"),  # Ville de Bobigny — 3/0, 3/3 in zone  # discovered 2026-10-09
    (56547324, "93", "all"),  # Réseau Actes if — 3/0, 3/3 in zone  # discovered 2026-10-09
    (49837743, "93", "all"),  # Agenda Romainville — 3/0, 3/3 in zone  # discovered 2026-10-09
    (23598507, "94", "all"),  # [non-official] Espace Culturel Dispan de Floran — 14/0, 13/13 in zone  # discovered 2026-10-09
    (31879073, "94", "all"),  # [non-official] CONCERTS LA GRANGE SUCY — 9/0, 9/9 in zone  # discovered 2026-10-09
    (89954817, "94", "all"),  # Val-de-Marne en Transition — 8/0, 7/7 in zone  # discovered 2026-10-09
    (80874099, "94", "all"),  # AGENDA COLLABORATIF DE LA VALLEE DE LA BIEVRE — 8/0, 7/7 in zone  # discovered 2026-10-09
    (86864197, "94", "all"),  # [non-official] Coqueli'Coop — 8/0, 7/7 in zone  # discovered 2026-10-09
# DISCOVERED-END
]

AGENDA_IDS: List[int] = list(CURATED_AGENDA_IDS) + [
    uid for uid, _, _ in DISCOVERED_AGENDAS if uid not in set(CURATED_AGENDA_IDS)
]
AGENDA_DEPT: Dict[int, str] = {**CURATED_DEPT, **{uid: d for uid, d, _ in DISCOVERED_AGENDAS}}
DEPT_FILTER_IDS: Set[int] = {uid for uid, d in AGENDA_DEPT.items() if d == "idf"} | {
    uid for uid, _, mode in DISCOVERED_AGENDAS if mode == "dept"
}

# Split used by the two-SourceSpec setup (fetch_all(part=...)).
PARTS = {
    "paris": ("75", "idf"),
    "couronne": ("92", "93", "94"),
}
