<p align="center">
  <img src="frontend/public/logo.svg" width="80" alt="SmartCinema"/>
</p>

<h1 align="center">SmartCinema</h1>

<p align="center">
  Self-hosted media server with AI-powered discovery, adaptive streaming, and a Netflix-grade interface — built to run entirely on your own hardware.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React_18_%2B_TypeScript-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Backend-Python_Flask-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Streaming-HLS_%2B_GPU_Accelerated-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/AI-Ollama_%2F_Cloud_Hybrid-purple?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square" />
</p>

---

## What is SmartCinema?

SmartCinema turns any PC or server into a personal streaming platform. Point it at your media folders and it handles the rest — scanning, organizing, fetching metadata and posters from TMDb, transcoding on-the-fly for any device, and serving everything through a clean web UI that works on phones, tablets, smart TVs, and desktops.

It's not just a media player. It's a full media management stack with built-in AI features, a subtitle studio, intro detection, analytics, multi-user profiles, and a whole lot more.

---

## Core Features

### Media Library & Scanner
- Automatic folder scanning with smart detection — distinguishes movies from TV series by analyzing folder structures, filenames, and TMDb lookups.
- Arabic filename support with ordinal translation (الموسم الأول → Season 1).
- Aggressive tag cleaning — strips tracker watermarks, release group tags, quality strings, and piracy site branding from titles automatically.
- Orphan adoption — when files move between drives or get renamed, the scanner reconnects them without losing your watch history, ratings, or favorites.
- Broken link pruning and ghost series cleanup.

### Streaming & Playback
- **Direct streaming** via HTTP Range requests for natively compatible formats.
- **Adaptive HLS transcoding** with automatic quality switching (1080p / 720p / 480p / 360p) when the source format isn't browser-friendly.
- **Hardware acceleration** — auto-detects NVIDIA NVENC, Intel QuickSync, AMD AMF, or falls back to optimized CPU encoding.
- **HEVC/H.265 pass-through** using fragmented MP4 with `hvc1` tags for Safari and modern Edge.
- Timeline hover previews generated at 10-second intervals using parallel FFmpeg workers.

### Video Player
The player is a standalone feature in itself:
- Double-tap seek (±10s), mouse wheel volume, full keyboard shortcuts.
- **Subtitle engine** — embedded track extraction, OpenSubtitles search & download, delay sync, custom styling (font, size, color, opacity, position), preset profiles (Netflix Style, Cinema Yellow, Classic TV), and permanent hardsub burning.
- **Audio management** — real-time track switching for multilingual dubs, and a strip tool to remove unwanted audio tracks from the file directly.
- Video filters — brightness, contrast, saturation sliders with auto-enhance.
- Skip Intro button powered by audio fingerprint matching.
- Auto Next Episode with countdown overlay.
- Picture-in-Picture support, playback speed control (0.5x–2x).

### AI Engine
SmartCinema ships with a hybrid AI stack that works both offline and online:
- **Local-first**: Connects to a local Ollama instance (Llama 3.2, Qwen 2.5, Mistral, etc.) for zero-cost, zero-latency, fully private AI.
- **Cloud failover**: Automatically rotates through Gemini, Groq, OpenRouter, Together AI, and HuggingFace when Ollama isn't available, with health monitoring and dead-key detection.
- **CineMind chatbot** — a conversational assistant that understands your library. Ask it things like "أفلام رعب في الغابات من التسعينات" and it returns matching titles with posters and availability badges.
- **Natural language search** — converts plain Arabic or English queries into structured filters.
- **AI recommendations** — hybrid TF-IDF cosine similarity on local metadata + TMDb global suggestions.
- **Catchup summaries** — spoiler-free recaps of where you left off in a series.
- **AI playlist generator** — describe a mood or theme and it builds a playlist from your library.

### Intro Detection
An audio fingerprinting system that doesn't rely on any external database:
- Extracts audio energy profiles from episodes of the same season.
- Builds a cosine similarity matrix and detects matching diagonal runs.
- Saves precise intro start/end timestamps, enabling the "Skip Intro" button in the player.

### Trailers
- Background download queue using yt-dlp with multi-browser cookie fallback.
- **Self-healing** — when a YouTube link dies or gets geo-blocked, the system automatically queries TMDb for an alternative and retries.
- Local trailer serving from cache.

### Subtitles
- OpenSubtitles API integration with JWT authentication.
- Search by IMDb ID, TMDb ID, or structured series queries.
- Balanced multilingual results (Arabic + English interleaved by popularity).
- Auto-conversion to WebVTT for browser compatibility.
- One-click merge into MKV/MP4 containers.
- Automatic subtitle scheduling on scan completion.

### Multi-User Profiles
- Individual watch history, favorites, and ratings per profile.
- Custom avatar with color palette or image upload.
- Per-profile audio language and subtitle preferences.
- **Zero-touch LAN login** — bind profiles to device IPs so your TV, phone, and tablet each auto-login to the right profile.

### Collections & Discovery
- Curated movie sagas with chronological timeline view (Harry Potter, Marvel, John Wick, etc.).
- Smart AI collections — trending, top rated, decade-based groupings.
- Interactive franchise timeline showing story order vs release order with library availability badges.
- Release calendar tracking upcoming episodes for series in your library.

### Analytics
- Total watch hours, bandwidth consumed, session counts.
- Watch trends by day/week/month.
- Genre distribution charts.
- Decade comparison (movies vs series).
- Quality breakdown across your library.
- Most-watched actors leaderboard.

### Admin & Toolbox
- Real-time scanner terminal with SSE log streaming and progress bars.
- Library path manager with per-path lock/unlock.
- **Audio converter** — batch EAC3/AC3/DTS/TrueHD → AAC conversion with up to 50 parallel workers, video stream untouched.
- **File renamer** — bulk rename proposals following Plex/Kodi/Jellyfin naming conventions.
- **Backup service** — automated daily RoboCopy mirroring to secondary drives.
- **System health dashboard** — disk usage, internet status, FFmpeg check, CPU/RAM utilization, corrupted file detection.
- **Media inspector** — forensic view of SQLite records, file paths, codec info, and cached images.
- **Unit test runner** — run backend tests directly from the browser.
- **Theme engine** — dozens of themes across categories (Dark, OLED, Cinema, Retro, Nature, Luxury, Light).

### IPTV
- M3U playlist integration with category filtering and channel search.
- Direct HLS live stream playback with low-latency buffering.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI, Hls.js, TanStack Query, Framer Motion |
| Backend | Python 3.10+, Flask, SQLite (WAL mode), FFmpeg/FFprobe pipeline |
| AI | Ollama (local), Gemini, Groq, OpenRouter, Together AI, HuggingFace (cloud) |
| Streaming | HLS adaptive bitrate, HTTP Range, NVENC / QSV / AMF hardware encoding |
| Tools | yt-dlp, RoboCopy, OpenSubtitles API |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.10+
- [FFmpeg](https://ffmpeg.org/) installed and on PATH

### Installation

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
pip install -r requirements.txt
```

### Run

**Windows** — double-click `start.cmd`.

**Manual:**
```bash
# Terminal 1 — Backend (port 5000)
cd backend && python app.py

# Terminal 2 — Frontend (port 8080)
cd frontend && npm run dev
```

Open `http://localhost:8080` in your browser.

---

## Deployment

### Frontend → Vercel / Netlify
| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment | `VITE_API_URL` = your backend URL |

### Backend → Render / Railway / VPS
A `Dockerfile` is included. Or use `docker-compose.yml` at the project root:
```bash
docker compose up -d
```

### Home Server (Recommended)
Since media files live on your drives, run the backend locally and expose it through [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for secure remote access. Host the frontend on Vercel for fast loading anywhere.

---

## Environment Variables

Copy `.env.example` → `.env` in both `frontend/` and `backend/`.

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | Frontend | Backend URL (empty = use Vite proxy in dev) |
| `PORT` | Backend | Server port (default: 5000) |
| `TMDB_API_KEY` | Backend | TMDb metadata & posters (optional) |
| `OLLAMA_HOST` | Backend | Local AI endpoint (default: localhost:11434) |

---

## Project Structure

```
├── frontend/          React app (pages, components, hooks, lib)
│   ├── src/
│   │   ├── pages/     Index, Movies, Series, Details, Player, Admin, ...
│   │   ├── components/  VideoPlayer, MediaCard, HeroSection, AiChat, ...
│   │   └── lib/       API client, logger, utilities
│   └── dist/          Production build (pre-built)
│
├── backend/           Flask API server
│   ├── app.py         Main application & route registration
│   ├── scanner.py     Media scanner engine
│   ├── database.py    SQLite schema & queries
│   ├── ai_service.py  Hybrid AI engine
│   ├── hls_transcoder.py  Adaptive streaming
│   └── tests/         Unit tests (39 tests)
│
├── docker-compose.yml
├── start.cmd          Windows launcher
└── start.sh           Linux/Mac launcher
```
