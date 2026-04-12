# 📰 Up-2-date: Your AI-Powered News Concierge

Up-2-date is a blazing-fast, personalized news aggregator that uses AI to scrape, curate, and summarize the latest updates based purely on your interests. Break through the noise, skip the clickbait, and get straight to the facts.

![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)

---

## ✨ Key Features

- **🤖 AI Daily Briefs:** Get digestible, AI-generated summaries of the day's top complex stories.
- **⚡ Blazing Fast:** Powered by FastAPI caching (`fastapi-cache2`), GZip compression, and global Next.js SWR deduping to deliver payload under milliseconds.
- **📱 App-Like Experience:** Optimized for mobile viewing as a PWA (Progressive Web App). Add it directly to your home screen!
- **🎯 Hyper-Personalized "For You" Feed:** A dedicated news feed that strictly adheres to user-selected onboarding interests. No algorithmic bloat.
- **📝 Integrated Note-Taking & Bookmarks:** Save articles for later and attach personal, floating markdown notes directly to your Daily Briefs.
- **🔐 Secure Authentication:** Seamless email/password and Google OAuth powered by Supabase.
- **🕷️ Multi-Source Scraping:** Aggregates real-time data from RSS feeds, Reddit, and standard news pipelines.

## 🥊 Comparison with Existing Platforms

How does Up-2-date stack up against the giants?

| Feature / Platform       | Up-2-date 🚀                      | Inshorts                     | Feedly (RSS Readers)        | Google / Apple News             |
| :----------------------- | :-------------------------------- | :--------------------------- | :-------------------------- | :------------------------------ |
| **Content Delivery**     | AI-Summarized Bullet Points       | Human-curated 60-word blurbs | Raw, unsummarized articles  | Full articles (often paywalled) |
| **Personalization**      | Strict (Only shows chosen topics) | Broad / Algorithmic          | Manual (You find the feeds) | Algorithmic / Behavioral        |
| **Integrated Notes**     | Yes (Markdown supported)          | No                           | Premium Only                | No                              |
| **Ad-Free**              | 100% Ad-Free                      | Heavy Ads & Sponsored posts  | Premium Only                | Heavy Ads                       |
| **Open Source & Custom** | Yes (Host it yourself)            | No                           | No                          | No                              |

**The Up-2-date Advantage:** Unlike _Inshorts_ which caters to a broad audience, Up-2-date uses custom Python scrapers to find niche topics you specifically care about. Unlike _Feedly_, you don't have to read 5 pages of text—our AI pipelines summarize the core facts immediately.

---

## 🏗️ Tech Stack

**Frontend (Vercel Ready)**

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS & Lucide Icons
- **State/Fetching:** Setup with `SWR` (Global deduping & `revalidateOnFocus`), Fetch/Axios.
- **Auth:** Supabase Auth Helpers (`@supabase/ssr`)
- **PWA/Icons:** Custom SVG icon/favicons matching OS-level branding.

**Backend (Render/Railway Ready)**

- **Framework:** FastAPI (Python)
- **Performance:** `fastapi-cache2` (InMemoryBackend), `Uvicorn`, and native `GZipMiddleware`
- **Database:** PostgreSQL (via Supabase)
- **AI & Pipelines:** Custom Python web scrapers (`services/reddit.py`, `services/rss.py`) + AI Summarization (`services/ai.py`)

---

## 💻 Local Development Setup

### 1. Prerequisites

- Node.js (v18+)
- Python (3.9+)
- A Supabase Project (for DB and Auth)

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate  # On Windows
pip install -r requirements.txt

# Start the FastAPI server on localhost:8000
uvicorn app.main:app --reload
```

### 3. Frontend Setup

```bash
cd frontend
npm install

# Start the Next.js server on localhost:3000
npm run dev
```

### 4. Environment Variables

You will need to create `.env` files in both the frontend and backend directories.

**frontend/.env.local**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

**backend/.env**

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
# Add any required AI API keys (e.g., OPENAI_API_KEY) here
```

## 🚀 Deployment Architecture

- **Frontend:** Optimized for Vercel. Ensure the Root Directory is set to `frontend`.
- **Backend:** Optimized for Render/Railway as a Python Web Service. This prevents the serverless timeouts (504 errors) common on Vercel's free tier during heavy AI processing.
