"""
Shared HTTP client for all spiders.

- Honest User-Agent (PanameClubBot) — never pretend to be a browser.
- Per-host politeness delay (default 1 req/s).
- Retries with exponential backoff on network errors / 429 / 5xx, honouring Retry-After.
- Optional time budget: a source stops cleanly when its budget is spent.
"""

from __future__ import annotations

import time
import random
from email.utils import parsedate_to_datetime
from typing import Optional
from urllib.parse import urlparse

import httpx

USER_AGENT = "PanameClubBot/1.0 (+https://www.panameclub.fr)"

DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
}

RETRY_STATUSES = {429, 500, 502, 503, 504}


class BudgetExceeded(Exception):
    """Raised when a source has spent its time budget."""


class Budget:
    """Wall-clock budget for one source run."""

    def __init__(self, seconds: Optional[float] = None):
        self.deadline = time.monotonic() + seconds if seconds else None

    def remaining(self) -> float:
        if self.deadline is None:
            return float("inf")
        return self.deadline - time.monotonic()

    def expired(self) -> bool:
        return self.remaining() <= 0

    def check(self) -> None:
        if self.expired():
            raise BudgetExceeded("time budget exhausted")


# A process-wide budget that cron.py sets per source; spiders never need to pass it around.
_current_budget = Budget(None)


def set_budget(seconds: Optional[float]) -> Budget:
    global _current_budget
    _current_budget = Budget(seconds)
    return _current_budget


def current_budget() -> Budget:
    return _current_budget


def _retry_after_seconds(resp: httpx.Response) -> Optional[float]:
    value = resp.headers.get("Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        return max(0.0, dt.timestamp() - time.time())
    except (TypeError, ValueError):
        return None


class PoliteClient:
    """Thin wrapper around httpx.Client with politeness + retries.

    Usage:
        with PoliteClient() as client:
            resp = client.get(url)          # returns httpx.Response or raises
            soup = client.get_soup(url)     # BeautifulSoup or None (logs the error)
    """

    def __init__(
        self,
        delay: float = 1.0,
        retries: int = 3,
        timeout: float = 20.0,
        headers: Optional[dict] = None,
        budget: Optional[Budget] = None,
    ):
        self.delay = delay
        self.retries = retries
        self.budget = budget
        h = dict(DEFAULT_HEADERS)
        if headers:
            h.update(headers)
        h["User-Agent"] = USER_AGENT  # always honest
        self._client = httpx.Client(
            headers=h,
            timeout=timeout,
            follow_redirects=True,
            transport=httpx.HTTPTransport(retries=1),  # connection-level retry
        )
        self._last_hit: dict = {}

    # context manager
    def __enter__(self) -> "PoliteClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _wait_turn(self, url: str) -> None:
        host = urlparse(url).netloc
        last = self._last_hit.get(host)
        if last is not None:
            wait = self.delay - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_hit[host] = time.monotonic()

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        budget = self.budget or current_budget()
        attempt = 0
        while True:
            budget.check()
            self._wait_turn(url)
            try:
                resp = self._client.request(method, url, **kwargs)
            except (httpx.TransportError, httpx.TimeoutException) as e:
                if attempt >= self.retries:
                    raise
                sleep = min(30.0, (2 ** attempt) + random.random())
                print(f"  [http] {type(e).__name__} on {url} — retry in {sleep:.1f}s")
                time.sleep(sleep)
                attempt += 1
                continue

            if resp.status_code in RETRY_STATUSES and attempt < self.retries:
                sleep = _retry_after_seconds(resp)
                if sleep is None:
                    sleep = (2 ** attempt) + random.random()
                sleep = min(sleep, 60.0)
                print(f"  [http] HTTP {resp.status_code} on {url} — retry in {sleep:.1f}s")
                time.sleep(sleep)
                attempt += 1
                continue
            return resp

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def get_text(self, url: str, **kwargs) -> Optional[str]:
        """GET and return body text, or None (logged) on HTTP error."""
        try:
            resp = self.get(url, **kwargs)
        except BudgetExceeded:
            raise
        except Exception as e:
            print(f"  [http] GET {url} failed: {e}")
            return None
        if resp.status_code != 200:
            print(f"  [http] GET {url} → HTTP {resp.status_code}")
            return None
        return resp.text

    def get_json(self, url: str, **kwargs):
        try:
            resp = self.get(url, **kwargs)
        except BudgetExceeded:
            raise
        except Exception as e:
            print(f"  [http] GET {url} failed: {e}")
            return None
        if resp.status_code != 200:
            print(f"  [http] GET {url} → HTTP {resp.status_code}")
            return None
        try:
            return resp.json()
        except ValueError:
            print(f"  [http] GET {url} → invalid JSON")
            return None

    def get_soup(self, url: str, **kwargs):
        from bs4 import BeautifulSoup

        text = self.get_text(url, **kwargs)
        if text is None:
            return None
        return BeautifulSoup(text, "html.parser")
