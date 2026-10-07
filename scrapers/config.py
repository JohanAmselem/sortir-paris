import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
MEILISEARCH_HOST = os.getenv("MEILISEARCH_HOST", "")
# Prefer a scoped write key (see pipelines/meili.py); falls back to the legacy variable.
MEILISEARCH_WRITE_KEY = os.getenv("MEILISEARCH_WRITE_KEY") or os.getenv("MEILISEARCH_API_KEY", "")

# Optional API keys (sources are skipped with a log line when missing)
OPENAGENDA_API_KEY = os.getenv("OPENAGENDA_API_KEY", "")
TICKETMASTER_API_KEY = os.getenv("TICKETMASTER_API_KEY", "")
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")

# Scraping settings (see utils/http.py)
REQUEST_DELAY = 1.0  # seconds between requests per host
USER_AGENT = "PanameClubBot/1.0 (+https://www.panameclub.fr)"
