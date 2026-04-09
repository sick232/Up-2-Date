import feedparser
import calendar
import re
from datetime import datetime, timezone
from app.services.image import normalize_image_url, fetch_fallback_image_url

RSS_SOURCES = {
    "Technology": [
        "https://techcrunch.com/feed/",
        "http://feeds.arstechnica.com/arstechnica/index",
    ],
    "International": [
        "http://feeds.bbci.co.uk/news/world/rss.xml",
        "https://www.aljazeera.com/xml/rss/all.xml",
    ],
    "Business": [
        "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
        "http://feeds.marketwatch.com/marketwatch/topstories/",
    ],
    "Sports": [
        "https://www.espn.com/espn/rss/news",
        "https://sports.yahoo.com/rss/"
    ],
    "India": [
        "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
        "https://www.thehindu.com/rssfeeds/rssindia.xml"
    ],
    "Science": [
        "https://www.sciencedaily.com/rss/top/science.xml",
        "https://www.wired.com/rss/index.xml"
    ],
    "Startups": [
        "https://www.entrepreneur.com/feed",
    ],
    "Entertainment": [
        "https://www.bollywoodhungama.com/rss/entertainment.xml",
        "https://variety.com/feed/rss"
    ],
    "Travel": [
        "https://www.nationalgeographic.com/culture/travel/rss",
    ],
    "Automobile": [
        "https://www.autocar.co.uk/rss"
    ],
    "Indian Defence": [
        "https://idrw.org/feed/",
        "https://www.livefistdefence.com/feed/",
        "https://indiandefencenews.info/feeds/posts/default?alt=rss"
    ],
    "Indian Economy": [
        "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms"
    ]
}


_IMG_SRC_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', flags=re.IGNORECASE)


def _extract_rss_image(entry) -> str | None:
    media_content = getattr(entry, "media_content", None) or entry.get("media_content", [])
    for item in media_content:
        candidate = normalize_image_url(item.get("url"), base_url=getattr(entry, "link", None))
        if candidate:
            return candidate

    media_thumbnail = getattr(entry, "media_thumbnail", None) or entry.get("media_thumbnail", [])
    for item in media_thumbnail:
        candidate = normalize_image_url(item.get("url"), base_url=getattr(entry, "link", None))
        if candidate:
            return candidate

    links = getattr(entry, "links", None) or entry.get("links", [])
    for item in links:
        rel = str(item.get("rel", "")).lower()
        kind = str(item.get("type", "")).lower()
        if rel == "enclosure" and kind.startswith("image/"):
            candidate = normalize_image_url(item.get("href"), base_url=getattr(entry, "link", None))
            if candidate:
                return candidate

    for html_blob in [
        getattr(entry, "summary", None),
        (entry.get("content", [{}])[0].get("value") if entry.get("content") else None),
    ]:
        if not html_blob:
            continue
        match = _IMG_SRC_RE.search(str(html_blob))
        if not match:
            continue
        candidate = normalize_image_url(match.group(1), base_url=getattr(entry, "link", None))
        if candidate:
            return candidate

    return None

import html
from html.parser import HTMLParser

class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs = True
        self.text_parts = []

    def handle_data(self, d):
        self.text_parts.append(d)

    def get_data(self):
        return ''.join(self.text_parts)

def strip_html_tags(html_content: str) -> str:
    """
    Safely strips HTML tags from a string and unescapes HTML entities.
    """
    if not html_content:
        return ""
    
    stripper = MLStripper()
    try:
        stripper.feed(html_content)
        text = stripper.get_data()
        return html.unescape(text).strip()
    except Exception:
        return html_content

def fetch_rss_articles(limit_per_feed: int = 15) -> list[dict]:
    """
    Parses RSS feeds and returns a list of raw articles across categories.
    """
    articles = []
    
    for category, urls in RSS_SOURCES.items():
        for url in urls:
            try:
                feed = feedparser.parse(url)
                for entry in feed.entries[:limit_per_feed]:
                    title = getattr(entry, "title", "").strip()
                    link = getattr(entry, "link", "").strip()
                    summary_raw = getattr(entry, "summary", "").strip()
                    summary = strip_html_tags(summary_raw)
                    
                    if not title or not link:
                        continue
                        
                    published_at = None
                    if getattr(entry, "published_parsed", None):
                        # Convert structural time directly to UTC instead of shifting via local timezone
                        published_at = datetime.fromtimestamp(calendar.timegm(entry.published_parsed), tz=timezone.utc).isoformat()

                    image_url = _extract_rss_image(entry)
                    if not image_url:
                        image_url = fetch_fallback_image_url(link)
                        
                    articles.append({
                        "title": title,
                        "url": link,
                        "summary_raw": summary,
                        "category": category,
                        "source": url,
                        "published_at": published_at,
                        "image_url": image_url,
                    })
            except Exception as e:
                print(f"Error parsing RSS feed {url}: {e}")
                
    return articles
