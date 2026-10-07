FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy scraper code
COPY . .

# Default: run every source, then geocode + dedup + expiry + Meilisearch sync
CMD ["python", "cron.py", "--all", "--post"]
