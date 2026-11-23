"""
Grande variante des images servies en vignette par certaines sources.

- Offi : https://files.offi.fr/<type>/<id>/images/120/<hash>.jpg (ou /200/) → /images/1000/.
  Vérifié le 23/11/2026 sur les types programmation, evenement, lieu et festival
  (200 image/jpeg ou image/png) ; 300, 400, 500, 600, 800, 1200, 1500 et « original »
  renvoient une redirection 302 vers une page HTML : seule la taille 1000 existe.
- Theatreonline : …/BDDPhoto/Medias//spectacle/<id>/xs_1_affiche.jpg (ou programmation,
  .jpeg, .JPG) → même chemin sans le préfixe « xs_ » (affiche complète, vérifiée).
  s_, m_, l_, xl_ n'existent pas (404). /BDDPhoto/Affiche/<id>.jpg n'a pas de variante.

Fonction pure, idempotente : une URL déjà grande ou inconnue est rendue telle quelle.
"""

from __future__ import annotations

import re
from typing import Optional

_OFFI_RE = re.compile(r"^(https?://files\.offi\.fr/[a-z_]+/\d+/images/)(?:120|200)(/[^/?#]+)$", re.I)
_THEATREONLINE_RE = re.compile(
    r"^(https?://(?:www\.)?theatreonline\.com/BDDPhoto/Medias/+(?:spectacle|programmation)/\d+/)"
    r"xs_(\d+_affiche\.(?:jpe?g|png|gif|webp))$",
    re.I,
)

OFFI_HD_SIZE = "1000"


def hd_image_url(url: Optional[str]) -> Optional[str]:
    """URL de la grande variante quand la source en publie une, sinon l'URL d'origine."""
    if not url:
        return url
    u = url.strip()
    m = _OFFI_RE.match(u)
    if m:
        return f"{m.group(1)}{OFFI_HD_SIZE}{m.group(2)}"
    m = _THEATREONLINE_RE.match(u)
    if m:
        return f"{m.group(1)}{m.group(2)}"
    return url
