# DATAtourisme flux fixture (test data, not a real download)

This folder mimics the archive returned by a Diffuseur webservice
(`https://diffuseur.datatourisme.fr/webservice/<flux_key>/<app_key>`) in the
"JSON-LD, one file per object" format: `index.json` at the root and one JSON-LD
file per POI under `objects/`. The tests zip it in memory
(`tests/test_datatourisme.py`).

No real flux archive was available (no Diffuseur account, and new flux can no
longer be created since 2026-10-01), so the fixture was **built by hand**:

- **Structure** (property names, nesting, `@type` lists, language maps
  `{"fr": [...]}`) follows the DATAtourisme ontology documentation v3.1.0
  (https://gitlab.adullact.net/adntourisme/datatourisme/ontology, `Documentation/`),
  the support forum (`hasMainRepresentation → ebucore:hasRelatedResource →
  ebucore:locator`, `index.json` at the archive root) and the compacted JSON-LD
  export on https://data.cquest.org/datatourisme/ (`{"@value", "@language"}`
  literals, used in `objects/2/versace.json`).
- **Values** (titles, descriptions, street lines, postcodes, INSEE codes,
  coordinates, periods, homepages, URIs, update dates) are copied from the real
  DATAtourisme Île-de-France export published on data.gouv.fr
  (`datatourisme-reg-idf.csv`, 2026-10-08, Licence Ouverte 2.0). Descriptions
  are shortened in a few files. Splitting the CSV's single address string into
  `schema:streetAddress` lines (street vs. place name) was done by hand.
  Inconsistent periods are kept as published (e.g. Brassaï: start 2026-10-17,
  end 2026-02-21).
- There are **no** times, prices or images in that CSV, so the fixture has none.
  The tests that need them add the fields inline, and say so.

| File | Purpose |
|---|---|
| `octobre-medieval.json` | 6 dated periods (2 past), Concert + Conference, 93 |
| `brassai.json` | exhibition in 92, end date before start date |
| `versace.json` | ongoing exhibition in 75, `@value` literals |
| `rencontres-ciel.json` | conference, 3-day period, venue name in street lines |
| `rugby.json` | sports event → skipped |
| `marche-cachan.json` | market → skipped |
| `moulin-rouge.json` | 1 Jan → 31 Dec "permanent" period → skipped |
| `coupes-linas.json` | event in Essonne (91) → outside the zone |
| `hotel.json` | not an event → skipped |
