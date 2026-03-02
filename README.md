# 🛰️ Global Intel: Real-Time Geospatial AI Tracker

A high-performance situational awareness dashboard that merges **Real-Time Aircraft Tracking (OpenSky)** with **Edge AI Traffic Analysis (Gemini 2.0 Flash)** and **Global Intelligence (Weather/News)**.

![System Architecture](https://img.shields.io/badge/Stack-FastAPI_|_React_|_MapLibre_|_Gemini_AI-blue)

## 🚀 Core Features

* **Multi-Source Fusion**: Integrates OpenSky Network (OAuth2), OpenWeather, and NewsAPI into a unified GeoJSON stream.
* **AI-Powered Surveillance**: Automates frame capture from YouTube Live streams (yt-dlp + ffmpeg) and uses **Gemini 2.0 Flash** to perform object detection (Cars, Buses, Pedestrians).
* **Tactical Dashboard**:
    * **11 Tactical Regions**: Instant "Fly-To" navigation (NYC, London, Dubai, Singapore, etc.).
    * **Movement Trails**: Persistent 15-point history dots for aircraft tracking movement over time.
    * **Style Persistence**: Seamless switching between Tactical (Dark) and Satellite views without data loss.
* **Resilient Ingestion**: Implements "Dead Stream" filtering (rejects static/broken thumbnails) and OAuth2 token lifecycle management.

---

## 🏗️ System Architecture



1.  **Backend (FastAPI)**: Orchestrates an asynchronous ingestion loop every 60 seconds.
2.  **Analysis (Gemini AI)**: Processes base64-encoded frames to generate structured traffic metadata.
3.  **Broadcasting (WebSockets)**: Pushes unified GeoJSON payloads to all connected clients.
4.  **Frontend (React + MapLibre)**: Renders 10,000+ data points with hardware-accelerated GL layers.

---

## 🛠️ Setup Instructions

### Prerequisites
- Python 3.11+ | Node.js 20+
- `ffmpeg` installed on your system path.

### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Configure `.env` (Use `.env.example` as a template for Gemini, OpenSky, and News keys).
4. `uvicorn main:app --port 8001`

### Frontend
1. `cd frontend`
2. `npm install`
3. Add `VITE_MAPTILER_KEY` to `.env`.
4. `npm run dev`

---

## 📊 Monitored Tactical Zones
* **North America**: NYC Times Square, Chicago Downtown
* **Europe**: London Oxford St, Paris, Amsterdam Canal
* **Asia/ME**: Tokyo Shibuya, Singapore Marina Bay, Dubai Downtown, Sydney Harbour