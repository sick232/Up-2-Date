from __future__ import annotations

import calendar
import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import feedparser

from app.services.ai import generate_summary, get_supabase_client

IST = ZoneInfo("Asia/Kolkata")
DAILY_BRIEF_CATEGORIES = [
    "economy",
    "defence",
    "technology",
    "geopolitics",
    "sports",
    "politics",
    "government_schemes",
]
CATEGORY_LABELS = {
    "economy": "Economy",
    "defence": "Defence",
    "technology": "Technology",
    "geopolitics": "Geopolitics",
    "sports": "Sports",
    "politics": "Politics",
    "government_schemes": "Government Schemes",
}

DAILY_BRIEF_FEEDS: Dict[str, List[str]] = {
    "economy": [
        "https://www.thehindu.com/business/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        "https://feeds.feedburner.com/ndtvprofit-latest",
    ],
    "defence": [
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://feeds.feedburner.com/ndtvnews-top-stories",
    ],
    "technology": [
        "https://www.thehindu.com/sci-tech/technology/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "https://feeds.feedburner.com/gadgets360-latest",
    ],
    "geopolitics": [
        "https://www.thehindu.com/news/international/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://feeds.feedburner.com/ndtvnews-world-news",
    ],
    "sports": [
        "https://www.thehindu.com/sport/feeder/default.rss",
        "https://feeds.bbci.co.uk/sport/rss.xml",
        "https://feeds.feedburner.com/ndtvsports-latest",
    ],
    "politics": [
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/politics/rss.xml",
        "https://feeds.feedburner.com/ndtvnews-top-stories",
    ],
    "government_schemes": [
        "https://www.thehindu.com/news/national/feeder/default.rss",
        "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
        "https://feeds.feedburner.com/ndtvnews-top-stories",
    ],
}


def _today_ist_date() -> str:
    return datetime.now(IST).date().isoformat()


def today_ist_date() -> str:
    return _today_ist_date()


def _normalize_whitespace(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _entry_published_iso(entry: Any) -> Optional[str]:
    if getattr(entry, "published_parsed", None):
        dt = datetime.fromtimestamp(calendar.timegm(entry.published_parsed), tz=timezone.utc)
        return dt.isoformat()
    return None


def _extract_summary(entry: Any) -> str:
    raw = getattr(entry, "summary", "") or ""
    clean = re.sub(r"<[^>]+>", " ", raw)
    return _normalize_whitespace(clean)


def _build_article_content(summary_raw: str, title: str, max_chars: int = 320) -> str:
    cleaned = _normalize_whitespace(summary_raw)
    if not cleaned:
        cleaned = _normalize_whitespace(title)
    if len(cleaned) <= max_chars:
        return cleaned
    truncated = cleaned[:max_chars].rsplit(" ", 1)[0]
    return f"{truncated}..."


def _article_dedupe_key(title: str, url: str) -> str:
    normalized = f"{_normalize_whitespace(title).lower()}|{(url or '').strip().lower()}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

def _extract_image_url(entry: Any) -> Optional[str]:
    """Attempt to extract an image URL from various RSS entry attributes."""
    if hasattr(entry, "media_content") and entry.media_content:
        for media in entry.media_content:
            if media.get("url") and "image" in media.get("medium", "image").lower():
                return media["url"]
                
    if hasattr(entry, "enclosures") and entry.enclosures:
        for enc in entry.enclosures:
            if enc.get("type", "").startswith("image/") and enc.get("href"):
                return enc["href"]

    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        for thumb in entry.media_thumbnail:
            if thumb.get("url"):
                return thumb["url"]
                
    return None

def _clean_source_title(source_title: str) -> str:
    """Extract publication name from verbose feed titles."""
    if not source_title:
        return "News"
    
    # Try to extract from ' | Publication' pattern (e.g., "Union Budget ... | The Hindu")
    if " | " in source_title:
        parts = source_title.split(" | ")
        publication = _normalize_whitespace(parts[-1])
        if publication and len(publication) < 100:
            return publication
    
    # Try to extract from ' - Publication' pattern
    if " - " in source_title:
        parts = source_title.split(" - ")
        publication = _normalize_whitespace(parts[-1])
        if publication and len(publication) < 50:
            return publication
    
    # If source is too verbose (more than 80 chars), extract key parts
    if len(source_title) > 80:
        # Try to find publication name at the end
        words = source_title.split()
        # Look for common publication indicators
        for i in range(len(words) - 1, max(len(words) - 5, 0), -1):
            candidate = " ".join(words[i:])
            if len(candidate) < 50 and len(candidate) > 3:
                return candidate
    
    return _normalize_whitespace(source_title)


def _safe_feed_source(feed_url: str, parsed_feed: Any) -> str:
    feed_title = getattr(getattr(parsed_feed, "feed", {}), "title", None)
    raw_source = _normalize_whitespace(str(feed_title)) or feed_url
    return _clean_source_title(raw_source)


def fetch_daily_brief_articles(limit_per_feed: int = 12) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {category: [] for category in DAILY_BRIEF_CATEGORIES}
    for category, urls in DAILY_BRIEF_FEEDS.items():
        for url in urls:
            try:
                feed = feedparser.parse(url)
                source_name = _safe_feed_source(url, feed)
                for entry in feed.entries[:limit_per_feed]:
                    title = _normalize_whitespace(getattr(entry, "title", ""))
                    link = _normalize_whitespace(getattr(entry, "link", ""))
                    if not title or not link:
                        continue
                    grouped[category].append(
                        {
                            "title": title,
                            "url": link,
                            "image_url": _extract_image_url(entry),
                            "summary_raw": _extract_summary(entry),
                            "published_at": _entry_published_iso(entry),
                            "source": source_name,
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                print(f"Daily brief feed parse error for {url}: {exc}")
    return grouped


def dedupe_and_limit_articles(
    grouped_articles: Dict[str, List[Dict[str, Any]]],
    max_per_category: int = 10,
) -> Dict[str, List[Dict[str, Any]]]:
    deduped: Dict[str, List[Dict[str, Any]]] = {category: [] for category in DAILY_BRIEF_CATEGORIES}
    global_seen: set[str] = set()

    for category in DAILY_BRIEF_CATEGORIES:
        for article in grouped_articles.get(category, []):
            key = _article_dedupe_key(article.get("title", ""), article.get("url", ""))
            if key in global_seen:
                continue
            global_seen.add(key)
            deduped[category].append(article)
            if len(deduped[category]) >= max_per_category:
                break

    return deduped


def _is_instruction_artifact(text: str) -> bool:
    lowered = text.lower()
    return lowered.startswith("summarize the following") or lowered.startswith("focus on key developments")


def _summary_to_bullets(summary_text: str, fallback_titles: List[str], desired: int = 5) -> List[str]:
    normalized = _normalize_whitespace(summary_text)
    if normalized:
        candidate_lines = [
            _normalize_whitespace(re.sub(r"^[\-•\d\.)\s]+", "", line))
            for line in re.split(r"[\n\r]+", normalized)
            if _normalize_whitespace(line)
        ]
        if len(candidate_lines) >= 3:
            bullets = []
            for line in candidate_lines:
                if _is_instruction_artifact(line):
                    continue
                if line and line not in bullets:
                    bullets.append(line)
                if len(bullets) >= desired:
                    return bullets

        sentence_candidates = [
            _normalize_whitespace(sentence)
            for sentence in re.split(r"(?<=[.!?])\s+", normalized)
            if _normalize_whitespace(sentence)
        ]
        bullets = []
        for sentence in sentence_candidates:
            if _is_instruction_artifact(sentence):
                continue
            if sentence and sentence not in bullets:
                bullets.append(sentence)
            if len(bullets) >= desired:
                return bullets

    fallback: List[str] = []
    for title in fallback_titles:
        cleaned = _normalize_whitespace(title)
        if cleaned and cleaned not in fallback:
            fallback.append(cleaned)
        if len(fallback) >= desired:
            break

    if fallback:
        return fallback

    return ["No major updates available in this category today."]


def generate_category_bullets(category: str, articles: List[Dict[str, Any]]) -> List[str]:
    if not articles:
        return ["No major updates available in this category today."]

    compact_lines = []
    for item in articles[:10]:
        title = item.get("title", "")
        summary_raw = item.get("summary_raw", "")
        if summary_raw:
            compact_lines.append(f"- {title}: {summary_raw}")
        else:
            compact_lines.append(f"- {title}")

    summary_text = generate_summary("\n".join(compact_lines))
    fallback_titles = [article.get("title", "") for article in articles]
    return _summary_to_bullets(summary_text, fallback_titles=fallback_titles, desired=5)


def _build_categories_payload(grouped_articles: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    payload: Dict[str, Dict[str, Any]] = {}
    for category in DAILY_BRIEF_CATEGORIES:
        articles = grouped_articles.get(category, [])
        bullets = generate_category_bullets(category, articles)
        payload[category] = {
            "title": CATEGORY_LABELS.get(category, category.title()),
            "bullets": bullets,
            "article_count": len(articles),
        }
    return payload


def _build_source_links_payload(grouped_articles: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, str]]]:
    links: Dict[str, List[Dict[str, str]]] = {}
    for category in DAILY_BRIEF_CATEGORIES:
        category_links: List[Dict[str, str]] = []
        seen: set[str] = set()
        for article in grouped_articles.get(category, [])[:10]:
            url = article.get("url")
            title = article.get("title")
            if not url or not title or url in seen:
                continue
            seen.add(url)
            category_links.append(
                {
                    "title": title,
                    "url": url,
                    "source": article.get("source") or "Unknown",
                }
            )
        links[category] = category_links
    return links


def _build_articles_payload(grouped_articles: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    payload: Dict[str, List[Dict[str, Any]]] = {}
    for category in DAILY_BRIEF_CATEGORIES:
        category_articles: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for article in grouped_articles.get(category, [])[:10]:
            url = article.get("url")
            title = article.get("title")
            if not url or not title or url in seen:
                continue
            seen.add(url)
            category_articles.append(
                {
                    "title": title,
                    "url": url,
                    "image_url": article.get("image_url"),
                    "source": article.get("source") or "Unknown",
                    "published_at": article.get("published_at"),
                    "content": _build_article_content(article.get("summary_raw", ""), title),
                }
            )
        payload[category] = category_articles
    return payload


def _normalize_db_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "date": str(row.get("brief_date")),
        "updated_at": row.get("updated_at") or row.get("created_at"),
        "categories": row.get("categories") or {},
        "source_links": row.get("source_links") or {},
        "articles": row.get("articles") or {},
        "status": row.get("status") or "completed",
    }


def get_daily_brief_for_date(brief_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    supabase = get_supabase_client()
    if not supabase:
        return None

    target_date = brief_date or _today_ist_date()
    try:
        response = (
            supabase.table("daily_briefs")
            .select("brief_date,categories,source_links,articles,status,created_at,updated_at")
            .eq("brief_date", target_date)
            .limit(1)
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Daily brief lookup failed: {exc}")
        return None

    if not response.data:
        return None

    return _normalize_db_payload(response.data[0])


def generate_daily_brief_payload(brief_date: Optional[str] = None) -> Dict[str, Any]:
    target_date = brief_date or _today_ist_date()
    grouped_raw = fetch_daily_brief_articles(limit_per_feed=10)
    grouped_articles = dedupe_and_limit_articles(grouped_raw, max_per_category=10)

    categories = _build_categories_payload(grouped_articles)
    source_links = _build_source_links_payload(grouped_articles)
    articles = _build_articles_payload(grouped_articles)

    return {
        "date": target_date,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "categories": categories,
        "source_links": source_links,
        "articles": articles,
        "status": "completed",
    }


def store_daily_brief(payload: Dict[str, Any]) -> Dict[str, Any]:
    supabase = get_supabase_client()
    if not supabase:
        return payload

    db_row = {
        "brief_date": payload.get("date"),
        "categories": payload.get("categories") or {},
        "source_links": payload.get("source_links") or {},
        "articles": payload.get("articles") or {},
        "status": payload.get("status") or "completed",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("daily_briefs").upsert(db_row, on_conflict="brief_date").execute()
    except Exception as exc:  # noqa: BLE001
        print(f"Daily brief store failed: {exc}")

    return payload


def generate_and_store_daily_brief(force: bool = False) -> Dict[str, Any]:
    today = _today_ist_date()
    if not force:
        existing = get_daily_brief_for_date(today)
        if existing:
            return existing

    payload = generate_daily_brief_payload(today)
    stored = store_daily_brief(payload)
    return stored


def reorder_brief_categories_for_interests(payload: Dict[str, Any], interests: List[str]) -> Dict[str, Any]:
    categories = payload.get("categories")
    if not isinstance(categories, dict) or not categories:
        return payload

    lowered_interest_terms = {str(item).strip().lower() for item in interests if str(item).strip()}
    if not lowered_interest_terms:
        return payload

    aliases: Dict[str, set[str]] = {
        "economy": {"economy", "business", "indian economy"},
        "defence": {"defence", "defense", "indian defence"},
        "technology": {"technology", "tech", "science", "startups"},
        "geopolitics": {"geopolitics", "international", "world"},
        "sports": {"sports"},
        "politics": {"politics", "india"},
        "government_schemes": {"government schemes", "government", "policy", "education"},
    }

    ordered_keys = list(categories.keys())
    prioritized: List[str] = []
    rest: List[str] = []
    for key in ordered_keys:
        key_aliases = aliases.get(key, {key})
        if lowered_interest_terms.intersection(key_aliases):
            prioritized.append(key)
        else:
            rest.append(key)

    if not prioritized:
        return payload

    reordered = {k: categories[k] for k in prioritized + rest}
    updated = dict(payload)
    updated["categories"] = reordered

    source_links = payload.get("source_links")
    if isinstance(source_links, dict):
        updated["source_links"] = {k: source_links.get(k, []) for k in prioritized + rest}

    articles = payload.get("articles")
    if isinstance(articles, dict):
        updated["articles"] = {k: articles.get(k, []) for k in prioritized + rest}

    return updated
