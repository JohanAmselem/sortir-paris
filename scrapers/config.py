import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
MEILISEARCH_HOST = os.getenv("MEILISEARCH_HOST", "http://localhost:7700")
MEILISEARCH_API_KEY = os.getenv("MEILISEARCH_API_KEY", "")

# Scraping settings
REQUEST_DELAY = 1.0  # seconds between requests per domain
CONCURRENT_REQUESTS = 4
USER_AGENT = "SortirParis/1.0 (+https://sortir.paris)"
