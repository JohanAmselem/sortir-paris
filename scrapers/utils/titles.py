"""
Title clean-up shared by validation (display titles) and matching (dedup / series keys).

- strip_date_affixes: "09.OCT | PARIS | Fakear" → "Fakear";
  "Jeanne Lee par Äulne – 09/10/2026 - 17:30" → "Jeanne Lee par Äulne".
- title_flags: "(ANNULÉ)" / "Reporté" → cancelled; "COMPLET" / "sold out" → sold out
  (the marker is removed from the title).
- smart_title_case: "LES 4 SAISONS DE VIVALDI" → "Les 4 Saisons de Vivaldi"
  (only applied to mostly upper-case strings; acronyms such as DJ, UGC, MK2, XIV kept).
- strip_for_matching: strip_date_affixes + editorial tails
  ("… en concert à Paris au Bataclan le 9 octobre 2026") — comparison only, never displayed.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

from unidecode import unidecode

_MONTHS = (
    r"janv(?:ier)?|f[eé]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept?(?:embre)?|"
    r"oct(?:obre)?|nov(?:embre)?|d[eé]c(?:embre)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
    r"june?|july?|aug(?:ust)?|october|november|december"
)
_DAYS = r"lun(?:di)?|mar(?:di)?|mer(?:credi)?|jeu(?:di)?|ven(?:dredi)?|sam(?:edi)?|dim(?:anche)?"
_NUM_DATE = r"\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?"
_TXT_DATE = rf"(?:(?:{_DAYS})\.?\s+)?\d{{1,2}}(?:er)?[\s.]*(?:{_MONTHS})\.?(?:\s+\d{{4}})?"
_TIME = r"\d{1,2}\s*(?:[:h]\s*\d{2}|h)"
_DATE_ANY = rf"(?:{_NUM_DATE}|{_TXT_DATE})"
_SEP = r"\s*[–—\-|•·,:/@]\s*"

# Trailing " – 09/10/2026 - 17:30", " - 9 octobre 2026 à 20h", " (09/10/2026)", " | 09.10"
_DATE_SUFFIX_RE = re.compile(
    rf"(?:{_SEP}|\s+)(?:le\s+|du\s+)?\(?\s*{_DATE_ANY}(?:\s*(?:{_SEP}|\s+|à\s+|a\s+)?{_TIME})?\s*\)?\s*$",
    re.I,
)
_TIME_SUFFIX_RE = re.compile(rf"{_SEP}{_TIME}\s*$", re.I)
# Leading "09.OCT | PARIS | ", "09/10/2026 - ", "Ven. 9 octobre : "
_CITY_WORDS = {"paris", "france", "idf", "ile de france", "ile-de-france"}
_DATE_PREFIX_RE = re.compile(rf"^\s*\(?{_DATE_ANY}(?:\s*{_TIME})?\)?\s*[|–—\-:•·]\s*", re.I)

# Editorial tails (matching only): "en concert à Paris…", "au Bataclan le …", "à l'Olympia en 2026"
_EDITORIAL_TAIL_RE = re.compile(
    r"\s+(?:en\s+(?:concert|showcase|live|spectacle|tournee|tournée|dj set)\b.*"
    r"|(?:a|à)\s+paris\b.*"
    r"|(?:au|a\s+la|à\s+la|a\s+l'|à\s+l'|à\s+l’|a\s+l’)\s+[^,]{2,60}\s+le\s+\d{1,2}(?:er)?\s+\w+.*)$",
    re.I,
)

_CANCEL_WORDS = r"annul[ée]e?s?|cancell?ed|report[ée]e?s?|postponed"
_SOLD_OUT_WORDS = r"complet|sold[\s-]?out"
_BRACKET_FLAG_RE = re.compile(rf"[\(\[]\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*[\)\]]", re.I)
_LEAD_FLAG_RE = re.compile(rf"^\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*[–—\-:|•·/]+\s*", re.I)
_TAIL_FLAG_RE = re.compile(rf"\s*[–—\-:|•·/,]+\s*({_CANCEL_WORDS}|{_SOLD_OUT_WORDS})\s*!?\s*$", re.I)
_CAPS_FLAG_RE = re.compile(r"(?<![A-Za-zÀ-ÿ])(ANNUL[ÉE]E?S?|REPORT[ÉE]E?S?|CANCELL?ED|POSTPONED|COMPLET|SOLD[\s-]?OUT)"
                           r"(?![A-Za-zÀ-ÿ])")
_CANCEL_RE = re.compile(rf"^(?:{_CANCEL_WORDS})$", re.I)


def _tidy(t: str) -> str:
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\(\s*\)|\[\s*\]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t.strip(" –—-|•·,:/").strip()


def strip_date_affixes(title: Optional[str]) -> str:
    """Remove a leading date (+ city) prefix and a trailing date/time suffix."""
    t = (title or "").strip()
    if not t:
        return ""
    original = t
    # leading "09.OCT | PARIS | …"
    m = _DATE_PREFIX_RE.match(t)
    if m:
        t = t[m.end():]
        parts = [p for p in re.split(r"\s*\|\s*", t)]
        while len(parts) > 1 and unidecode(parts[0]).strip().lower() in _CITY_WORDS:
            parts.pop(0)
        t = " | ".join(parts)
    # trailing date(s)/time: "– 09/10/2026 - 17:30", "- 18:00"
    for _ in range(2):
        new = _DATE_SUFFIX_RE.sub("", t)
        new = _TIME_SUFFIX_RE.sub("", new) if new != t else new
        if new == t:
            break
        t = new
    t = _tidy(t)
    return t if len(t) >= 2 else original


def title_flags(title: Optional[str]) -> Tuple[str, bool, bool]:
    """→ (title without status markers, cancelled, sold_out)."""
    t = (title or "").strip()
    cancelled = sold_out = False

    def mark(word: str) -> None:
        nonlocal cancelled, sold_out
        if _CANCEL_RE.match(word.strip()) or _CANCEL_RE.match(unidecode(word).strip()):
            cancelled = True
        else:
            sold_out = True

    for rx in (_BRACKET_FLAG_RE, _LEAD_FLAG_RE, _TAIL_FLAG_RE):
        while True:
            m = rx.search(t)
            if not m:
                break
            mark(m.group(1))
            t = (t[:m.start()] + " " + t[m.end():]).strip()
    # upper-case marker inside a mixed-case title: "Fakear COMPLET supplémentaire"
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) < 0.7:
        for m in list(_CAPS_FLAG_RE.finditer(t)):
            mark(m.group(1))
        t = _CAPS_FLAG_RE.sub(" ", t)
    t = _tidy(t)
    return (t if len(t) >= 2 else (title or "").strip()), cancelled, sold_out


# ─────────────────────────── title case ───────────────────────────

_SMALL_WORDS = {
    "de", "du", "des", "la", "le", "les", "et", "à", "a", "au", "aux", "en", "sur", "pour", "par",
    "dans", "avec", "sans", "un", "une", "ou", "chez", "vs", "the", "of", "and", "or", "in", "on",
    "at", "to", "for", "with", "by", "from", "an", "y", "d", "l",
}
_ACRONYMS = {
    "DJ", "MC", "UGC", "MK2", "USA", "UK", "NYC", "RER", "SNCF", "RATP", "BD", "VO", "VF",
    "VOST", "VOSTFR", "OST", "IA", "AI", "LGBT", "LGBTQ", "LGBTQIA", "TV", "CD", "LP", "EP", "PSG",
    "BNF", "MJC", "CNSMD", "R&B", "RNB", "OK", "KO", "SOS", "FM", "XXL", "XL", "BBC", "ONU", "UE",
    "VIP", "NBA", "NFL", "WWE", "MMA", "ABBA", "AC/DC", "ACDC", "UB40", "BTS", "PNL", "SCH", "JUL",
    "IAM", "NTM", "MGMT", "LCD", "XX", "CNRS", "EDF", "IRCAM", "ADN", "UFO",
}
_ROMAN_RE = re.compile(r"^(?=[IVXL])L?X{0,3}(IX|IV|V?I{0,3})$")
_VOWELS = set("AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ")
_WORD_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.U)


def _is_mostly_upper(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) <= 4:
        return False
    return sum(c.isupper() for c in letters) / len(letters) > 0.7


def _keep_upper(word: str) -> bool:
    w = word.upper()
    if w in _ACRONYMS or _ROMAN_RE.match(w):
        return True
    if any(c.isdigit() for c in w) and any(c.isalpha() for c in w):
        return True  # MK2, B2B, UB40
    letters = [c for c in w if c.isalpha()]
    return 1 < len(letters) <= 4 and not any(c in _VOWELS for c in letters)  # PNL, TKT, DJ


def _cap(word: str) -> str:
    return word[:1].upper() + word[1:].lower() if word else word


def _case_word(word: str, first: bool) -> str:
    if _keep_upper(word):
        return word.upper()
    low = word.lower()
    m = re.match(r"^([ldjnsc]|qu|jusqu|lorsqu|puisqu)(['’])(.+)$", low)
    if m:  # l'avare → L'Avare (first) / l'Avare
        prefix = m.group(1).capitalize() if first else m.group(1)
        return prefix + m.group(2) + _case_word(m.group(3), True)
    if not first and low in _SMALL_WORDS:
        return low
    return _cap(low)


def smart_title_case(text: Optional[str]) -> Optional[str]:
    """Title-case a mostly upper-case string (> 70 % upper-case letters, > 4 letters).
    Other strings are returned unchanged."""
    if not text or not _is_mostly_upper(text):
        return text
    out, pos, first = [], 0, True
    for m in _WORD_RE.finditer(text):
        out.append(text[pos:m.start()])
        word = m.group(0)
        # hyphenated compounds are split by the regex: "SAINT-GERMAIN" → each part
        prev = text[m.start() - 1] if m.start() else ""
        out.append(_case_word(word, first or prev in "–—(\"«:|/."))
        first = False
        pos = m.end()
    out.append(text[pos:])
    return "".join(out)


def strip_for_matching(title: Optional[str]) -> str:
    """Title stripped of dates, status markers and editorial tails (comparison only)."""
    t, _, _ = title_flags(title)
    t = strip_date_affixes(t)
    stripped = _EDITORIAL_TAIL_RE.sub("", t).strip()
    return stripped if len(stripped) >= 2 else t
