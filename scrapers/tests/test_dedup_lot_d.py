"""Lot D : doublons au même lieu (titres équivalents, heures, expos), priorité de source,
articles jamais canoniques, rattrapage (tools/backfill_doublons.plan)."""
from datetime import datetime, timedelta, timezone

from pipelines.dedup import (
    canonical_rank,
    choose_canonical,
    conflict,
    find_duplicates,
    group_canonical,
    is_duplicate,
    titles_equivalent,
)
from tools.backfill_doublons import plan, refusal_reason

PARIS_OFFSET = timedelta(hours=1)  # novembre → mars : UTC+1


def at(day, hhmm="20:00", month=12, year=2026):
    h, m = map(int, hhmm.split(":"))
    return datetime(year, month, day, h, m, tzinfo=timezone.utc) - PARIS_OFFSET


def ev(id, source, title, start, end=None, venue="olympia", venue_name="L'Olympia", time_known=True,
       price="unknown", image=True, q=70, status="active", canonical=None, lat=48.8702, lng=2.3283):
    return {"id": id, "source": source, "title": title, "start_date": start, "end_date": end,
            "canonical_venue": venue, "venue_name": venue_name, "lat": lat, "lng": lng,
            "time_known": time_known, "price_status": price, "has_image": image, "quality_score": q,
            "status": status, "created_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
            "canonical_event_id": canonical, "price_min": 0, "price_max": 0, "is_free": price == "free",
            "has_short": True, "desc_len": 200, "member_activity": 0}


# ── exemples réels (23/11/2026) qui doivent fusionner ──

def test_venue_suffix_and_source_priority_olympia():
    rows = [ev("oa", "openagenda", "Peet - l'Olympia", at(28, month=11), price="paid"),
            ev("vo", "venue_olympia", "Peet", at(28, month=11), price="paid")]
    assert find_duplicates(rows) == {"oa": "vo"}


def test_sortiraparis_article_is_never_canonical():
    rows = [ev("tm", "ticketmaster", "The Pogues", at(26, month=11)),
            ev("sap", "sortiraparis", "The Pogues, le groupe qui a révolutionné le folk irlandais, en concert "
                                      "à l'Olympia en novembre 2026", at(26, month=11), price="paid", q=95)]
    assert find_duplicates(rows) == {"sap": "tm"}


def test_ticketmaster_prestation_is_the_same_concert():
    tm = ev("t1", "ticketmaster", "Tori Kelly", at(2))
    vip = ev("t2", "ticketmaster", "Prestation Tori Kelly", at(2))
    venue = ev("v", "venue_olympia", "Tori Kelly", at(2), price="paid")
    assert is_duplicate(tm, vip)  # même source, même début, même titre une fois nettoyé
    assert find_duplicates([tm, vip, venue]) == {"t1": "v", "t2": "v"}
    # « RUSH » / « Prestation Rush » sans autre source : rattachés entre eux
    a = ev("r1", "ticketmaster", "RUSH", at(19, month=2, year=2027), venue="plenitude", venue_name="Plenitude Arena")
    b = ev("r2", "ticketmaster", "Prestation Rush", at(19, month=2, year=2027), venue="plenitude",
           venue_name="Plenitude Arena")
    assert len(find_duplicates([a, b])) == 1


def test_inclusion_in_whole_words_and_unknown_time():
    rows = [ev("br", "billetreduc", "Booder dans Ah... l'école !", at(17, "17:30", 1, 2027), price="paid"),
            ev("tm", "ticketmaster", "Booder", at(17, "17:30", 1, 2027)),
            # sortiraparis à 12:00 = heure inconnue : ne bloque pas
            ev("sap", "sortiraparis", "Booder dans Ah… l’école ! : un regard drôle et tendre", at(17, "12:00", 1, 2027))]
    out = find_duplicates(rows)
    assert set(out) == {"tm", "sap"} and set(out.values()) == {"br"}


def test_angele_article_attaches_to_one_session_and_never_glues_two():
    sap = ev("sap", "sortiraparis", "Angèle : un cinquième concert prévu à Paris Bercy en mars 2027",
             at(8, "12:00", 3, 2027), end=at(13, "12:00", 3, 2027), venue="bercy", venue_name="Accor Arena",
             time_known=False)
    d8 = ev("o8", "offi", "Angèle", at(8, month=3, year=2027), venue="bercy", venue_name="Accor Arena")
    d10 = ev("o10", "offi", "Angèle", at(10, month=3, year=2027), venue="bercy", venue_name="Accor Arena")
    out = find_duplicates([sap, d8, d10])
    assert list(out) == ["sap"]  # les deux concerts restent affichés


def test_exhibitions_overlapping_periods_and_article():
    s, e = at(14, "12:00", 10), at(14, "12:00", 2, 2027)
    rows = [ev("pm", "parismusees", "Paris à l'arraché", s, e, venue="carna", venue_name="Musée Carnavalet"),
            ev("of", "offi", "Paris à l'arraché. Jacques Villeglé et l'art urbain", s, e, venue="carna",
               venue_name="Musée Carnavalet"),
            ev("art", "paris_opendata", "On a vu, on a (plus qu’) aimé l’expo « Paris à l’arraché. Jacques "
                                        "Villeglé et l’art urbain », au musée Carnavalet", at(24, "10:00", 11), e,
               venue="carna", venue_name="Musée Carnavalet", q=100),
            ev("dr", "offi", "Drogues", s, e, venue="carna", venue_name="Musée Carnavalet")]
    out = find_duplicates(rows)
    assert out == {"of": "pm", "art": "pm"}  # « Drogues » est une autre expo


def test_nearby_unlinked_venues_for_an_exhibition():
    s, e = at(14, "12:00", 10), at(14, "12:00", 2, 2027)
    a = ev("of", "offi", "Paris à l'arraché. Jacques Villeglé et l'art urbain", s, e, venue="c1",
           venue_name="Musée Carnavalet", lat=48.85837, lng=2.36264)
    b = ev("pm", "parismusees", "Paris à l'arraché", s, e, venue="c2",
           venue_name="Musée Carnavalet - Histoire de Paris", lat=48.85698, lng=2.36279)  # 154 m
    assert is_duplicate(a, b)
    # un soir donné, deux salles voisines non liées restent distinctes
    a1 = ev("a1", "offi", "Peet", at(5), venue="c1", venue_name="Musée Carnavalet", lat=48.85837, lng=2.36264)
    b1 = ev("b1", "openagenda", "Peet", at(5), venue="c2", venue_name="Musée Carnavalet - Histoire de Paris",
            lat=48.85698, lng=2.36279)
    assert not is_duplicate(a1, b1)


# ── cas volontairement NON fusionnés ──

def test_two_shows_same_evening_different_known_times():
    a = ev("a", "ticketmaster", "Alex Ramires", at(26, "21:30", 1, 2027))
    b = ev("b", "billetreduc", "Alex Ramirès dans Panache", at(26, "18:45", 1, 2027))
    assert not is_duplicate(a, b)
    assert refusal_reason(a, b).startswith("heures connues et différentes")
    # une ligne à l'heure inconnue ne les recolle pas
    c = ev("c", "offi", "Alex Ramirès", at(26, "12:00", 1, 2027), time_known=False)
    assert conflict(a, b)
    out = find_duplicates([a, b, c])
    shown = {i: out.get(i, i) for i in ("a", "b")}
    assert shown["a"] != shown["b"]  # 18 h 45 et 21 h 30 restent deux fiches


def test_two_plays_in_the_same_theatre_are_not_merged():
    a = ev("a", "billetreduc", "Le Médecin malgré lui", at(5), venue="no", venue_name="Théâtre du Nord-Ouest")
    b = ev("b", "theatreonline", "Histoire d'un merle blanc", at(5), venue="no", venue_name="Théâtre du Nord-Ouest")
    assert not is_duplicate(a, b)


def test_guards_numbers_generic_words_derived_activities_bundles():
    v = dict(venue="gp", venue_name="Grand Palais")
    s, e = at(24, "10:00", 11), at(17, "18:00", 1, 2027)
    expo = ev("x", "paris_opendata", "Cézanne et nous", s, e, **v)
    visit = ev("y", "billetreduc", "Visite guidée : Exposition Cézanne et nous au Grand Palais", s, e, **v)
    assert not is_duplicate(expo, visit)  # activité dérivée
    assert not titles_equivalent(ev("a", "x", "Saison 2", at(5)), ev("b", "y", "Saison 3", at(5)))
    church = dict(venue="eph", venue_name="Eglise Saint-Ephrem")
    assert not is_duplicate(ev("a", "billetreduc", "Chopin", at(5), **church),
                            ev("b", "theatreonline", "Natasha Kadyrova : Récital piano de Mozart, Chopin", at(5),
                               **church))  # le compositeur ne dit pas qui joue
    assert not is_duplicate(ev("a", "offi", "Visite guidée", at(5)), ev("b", "openagenda", "Visite guidée : Art Nouveau",
                                                                          at(5)))
    cite = dict(venue="cite", venue_name="Cité des sciences et de l'industrie")
    assert not is_duplicate(ev("a", "openagenda", "Cité des sciences et de l'industrie", s, e, **cite),
                            ev("b", "paris_opendata", "Esprit critique à la Cité des sciences et de l'industrie", s, e,
                               **cite))  # le titre court n'est que le nom du lieu
    z = dict(venue="zen", venue_name="Zénith Paris - La Villette")
    pack = ev("p", "openagenda", "PACK DUO : Luther + Rounhaa - Zénith de Paris", at(27, "21:00", 1, 2027),
              at(29, "23:00", 1, 2027), **z)
    assert not is_duplicate(pack, ev("r", "venue_zenith", "Rounhaa", at(28, month=1, year=2027), **z))


def test_same_source_rows_with_different_titles_never_share_a_group():
    z = dict(venue="zen", venue_name="Zénith Paris - La Villette")
    luther = ev("l", "venue_zenith", "Luther", at(27, month=1, year=2027), **z)
    rounhaa = ev("r", "venue_zenith", "Rounhaa", at(28, month=1, year=2027), **z)
    assert conflict(luther, rounhaa)


# ── fiche canonique ──

def test_canonical_priority_and_ties():
    s = at(5)
    rows = {src: ev(src, src, "X", s) for src in ("venue_x", "ticketmaster", "openagenda", "sortiraparis")}
    order = sorted(rows.values(), key=canonical_rank, reverse=True)
    assert [r["source"] for r in order] == ["venue_x", "ticketmaster", "openagenda", "sortiraparis"]
    # à égalité de source : prix connu et image
    a = ev("a", "offi", "X", s, price="unknown", image=False, q=99)
    b = ev("b", "billetreduc", "X", s, price="paid", image=True, q=10)
    assert choose_canonical(a, b)[0]["id"] == "b"


def test_a_run_beats_one_of_its_dates():
    run = ev("of", "offi", "La Coccinelle et le Jardinier", at(13, "12:00", 9), at(3, "12:00", 1, 2027), time_known=False)
    one = ev("br", "billetreduc", "La Coccinelle et le Jardinier", at(3, "10:15", 1, 2027), price="paid", q=99)
    assert group_canonical([run, one])["id"] == "of"


# ── rattrapage (plan pur) ──

def test_backfill_plan_merges_reports_price_and_releases_orphans():
    rows = [
        ev("v", "venue_olympia", "Peet", at(28, month=11), price="unknown"),
        ev("oa", "openagenda", "Peet - l'Olympia", at(28, month=11), price="paid"),
        # doublon caché derrière une fiche qui n'est plus vivante (absente des lignes lues)
        ev("orph", "offi", "Déni", at(18, "12:00", 9), at(10, "12:00", 1, 2027), venue="th", venue_name="Théâtre",
           canonical="expired-row", time_known=False),
    ]
    p = plan(rows)
    assert p["desired"] == {"v": None, "oa": "v", "orph": None}
    assert ("v", "oa") in p["fills"]  # prix connu reporté sur la canonique
    assert p["stats"]["orphelins_reaffiches"] == 1 and p["stats"]["lignes_rattachees"] == 1


def test_backfill_swap_only_when_strictly_better():
    s = at(5)
    # groupe existant : openagenda affichée, ticketmaster cachée derrière
    rows = [ev("oa", "openagenda", "Kalika", s), ev("tm", "ticketmaster", "Kalika", s, canonical="oa")]
    p = plan(rows)
    assert p["desired"] == {"oa": "tm", "tm": None} and p["stats"]["dont_bascules"] == 1
    assert plan(rows, keep_canonicals=True)["desired"] == {"oa": None, "tm": "oa"}
    # même rang (offi / theatreonline, prix et image) : pas de bascule pour la seule note de qualité
    rows = [ev("to", "theatreonline", "L'Ange du foyer", s, q=40), ev("of", "offi", "L'Ange du foyer", s, q=90,
                                                                     canonical="to")]
    assert plan(rows)["changes"] == []


def test_backfill_splits_sessions_held_together_by_an_article():
    sap = ev("sap", "sortiraparis", "Festival du Cirque de Demain 2027 : la 46e édition au Cirque Phénix",
             at(21, "12:00", 1, 2027), at(24, "12:00", 1, 2027), time_known=False)
    a = ev("a", "billetreduc", "Festival du Cirque de Demain : Spectacle A", at(21, month=1, year=2027),
           canonical="sap")
    b = ev("b", "billetreduc", "Festival du Cirque de Demain : Spectacle B", at(22, month=1, year=2027),
           canonical="sap")
    p = plan([sap, a, b])
    assert p["desired"]["a"] is None and p["desired"]["b"] is None  # les deux soirs ré-affichés
    assert p["desired"]["sap"] in ("a", "b")


def test_same_words_in_another_order():
    church = dict(venue="mad", venue_name="Eglise de la Madeleine")
    a = ev("a", "offi", "Haendel : Le Messie", at(11, "20:45"), **church)
    b = ev("b", "paris_opendata", "Le Messie de Haendel", at(11, "20:45"), **church)
    assert is_duplicate(a, b)  # mots génériques seuls, mais les mêmes


def test_grand_et_petit_palais_ne_sont_pas_le_meme_lieu():
    from pipelines.dedup import _shared_venue_word
    a = {"venue_name": "Grand Palais"}
    b = {"venue_name": "Petit Palais - Musée des Beaux-Arts de la Ville de Paris"}
    assert not _shared_venue_word(a, b)
