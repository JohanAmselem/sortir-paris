from utils.keywords import extract_keywords


def test_hip_hop_night_is_not_tagged_metal():
    kw = extract_keywords("Jeru the Damaja", "Légende du rap hardcore new-yorkais, boom bap en solo.",
                          category_slug="concerts")
    assert "hip-hop" in kw and "boom bap" in kw
    assert not {"metal", "black metal", "death metal", "heavy metal"} & set(kw)
    assert "stand-up" not in kw and "fado" not in kw


def test_metal_concert_found_from_text_and_source_tags():
    kw = extract_keywords("Deathchant + Fangus", "Une soirée heavy metal au Klub.", category_slug="concerts")
    assert "metal" in kw and "heavy metal" in kw
    kw = extract_keywords("GOJIRA", None, category_slug="concerts", tags=["Gojira", "Rock", "Metal"])
    assert "metal" in kw and "rock" in kw


def test_only_matched_terms_are_added():
    kw = extract_keywords("Soirée salsa", "Cours puis bal", category_slug="danse")
    assert "salsa" in kw
    assert "flamenco" not in kw and "zouk" not in kw
