<p align="center">
  <img src="https://github.com/yannolerobot/Immich-Stats/blob/main/assets/immich-stats-s.png?raw=true" width="140" alt="Immich Stats Dashboard Logo">
</p>

<h1 align="center">Immich Stats Dashboard</h1>

<p align="center">
  A self-hosted, maintenance-free upload statistics dashboard for your Immich server.
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/yannolerobot/Immich-Stats?style=flat-square&color=blue" alt="License">
  <img src="https://img.shields.io/github/v/release/yannolerobot/Immich-Stats?style=flat-square&color=orange" alt="Latest Release">
  <img src="https://img.shields.io/badge/Docker-Ready-blue?style=flat-square&logo=docker" alt="Docker Ready">
</p>

---

## ✨ Features

* 📊 **Daily Activity:** Interactive bar charts tracking photo & video uploads across all users.
* 🏆 **Leaderboards:** Friendly competition tracking ranking users by total upload counts.
* 👤 **User Insights:** Individual per-user breakdowns complete with clean mini sparkline charts.
* 🔄 **Real-Time Data:** Live API fetching with automatic data updates every 5 minutes.
* 📅 **Flexible Windows:** Dynamically toggle and filter between 7, 14, or 30-day view ranges.
* 🐋 **Ultra Lightweight:** Single Docker container. No internal databases, no cron jobs, zero overhead.

---

## 🚀 Quick Start

### 1. Generate an Immich API key
Log into your core Immich instance, navigate to **Account Settings** ➔ **API Keys**, and generate a new key. 
*Note: The only permissions needed are server.statistics and adminUser.read*

### 2. Configure Your `.env` File
Create a `.env` file in your deployment directory to store your connection keys and database credentials safely:

```env
IMMICH_API_KEY=your_immich_api_key_here
DB_PASSWORD=your_immich_postgres_password_here

# Optional overrides (Defaults to immich / postgres if left out)
DB_DATABASE_NAME=immich
DB_USERNAME=postgres
```

### 3. Configure `compose.yml`
Create a `compose.yml` file and drop in the deployment configuration below:

```yaml
version: "3.8"

services:
  immich-stats:
    image: ghcr.io/yannolerobot/immich-stats:latest
    container_name: immich-stats
    restart: unless-stopped
    
    # Expose port (comment out if using a reverse proxy)
    ports:
      - "3456:3000"
      
    env_file:
      - .env
      
    environment:
      # Required — point at your Immich instance
      IMMICH_URL: "http://immich-server:2283"
      IMMICH_API_KEY: "${IMMICH_API_KEY}"
                
      # Point at the Immich postgres container
      DB_HOSTNAME: "immich_postgres"
      DB_PORT: "5432"
      DB_DATABASE_NAME: "${DB_DATABASE_NAME:-immich}"
      DB_USERNAME: "${DB_USERNAME:-postgres}"
      DB_PASSWORD: "${DB_PASSWORD:-postgres}" # change in your .env

      PORT: "3000"
    
    # Optional: If Immich runs on a specific internal network, uncomment below to join it, make sure both immich and the postgres container is reachable
    # networks:
    #   - immich_default

# networks:
#   immich_default:
#     external: true
```