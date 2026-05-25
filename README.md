# Immich Stats Dashboard

A self-hosted, maintenance-free weekly upload stats dashboard for your Immich server.

## Features

- 📊 Daily bar chart of photo & video uploads across all users
- 🏆 Leaderboard ranked by upload count
- 👤 Per-user breakdown with mini sparkline chart
- 🔄 Auto-refreshes every 5 minutes
- 📅 Switch between 7 / 14 / 30 day windows
- 🐋 Single Docker container, no database, no cron

---

## Quick Start

### 1. Get your Immich API key

In Immich → **Account Settings** → **API Keys** → create a new key.
A read-only key is sufficient.

### 2. Edit `compose.yml`

```yaml
environment:
  IMMICH_URL: "http://immich-server:2283"  # or https://immich.yourdomain.tld
  IMMICH_API_KEY: "paste_your_key_here"
```

If Immich is on the same Docker network, uncomment the `networks:` block and set the network name to match (e.g. `immich_default`).

### 3. Build and run

```bash
docker compose up -d --build
```

Dashboard is available at **http://your-server:3456**

---

## Traefik / Reverse proxy

The `compose.yml` already includes Traefik labels. Adjust the `Host()` rule and remove the `ports:` mapping if you're routing through Traefik:

```yaml
labels:
  - "traefik.http.routers.immich-stats.rule=Host(`stats.yourdomain.tld`)"
```

---

## Environment variables

| Variable         | Required | Default | Description                              |
|-----------------|----------|---------|------------------------------------------|
| `IMMICH_URL`    | ✅       | —       | Base URL of your Immich instance          |
| `IMMICH_API_KEY`| ✅       | —       | Immich API key (read-only is fine)        |
| `PORT`          | ❌       | `3000`  | Internal port the app listens on          |

---

## Notes

- Data is fetched live from the Immich API on each page load / refresh — no local storage.
- The daily breakdown uses `fileCreatedAt` (the EXIF date) if available, falling back to `createdAt` (upload date).
- Large libraries with many assets will take a few seconds on first load; subsequent loads are fast.
- The container runs as the non-root `node` user.
