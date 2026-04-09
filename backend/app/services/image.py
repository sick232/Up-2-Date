import re
from html import unescape
from typing import Optional
from urllib.parse import urljoin

import requests


_META_OG_IMAGE_RE = re.compile(
    r'<meta\b(?=[^>]*(?:property|name)\s*=\s*["\'](?:og:image(?:[:](?:url|secure_url))?|twitter:image|twitter:image:src)["\'])(?=[^>]*\bcontent\s*=\s*["\']([^"\']+)["\'])[^>]*>',
    flags=re.IGNORECASE,
)
_META_ITEMPROP_IMAGE_RE = re.compile(
    r'<meta\b(?=[^>]*\bitemprop\s*=\s*["\']image["\'])(?=[^>]*\bcontent\s*=\s*["\']([^"\']+)["\'])[^>]*>',
    flags=re.IGNORECASE,
)
_LINK_PRELOAD_IMAGE_RE = re.compile(
    r'<link\b(?=[^>]*\brel\s*=\s*["\']preload["\'])(?=[^>]*\bas\s*=\s*["\']image["\'])(?=[^>]*\bhref\s*=\s*["\']([^"\']+)["\'])[^>]*>',
    flags=re.IGNORECASE,
)
_IMG_SRC_RE = re.compile(r'<img[^>]+(?:src|data-src|data-lazy-src)\s*=\s*["\']([^"\']+)["\']', flags=re.IGNORECASE)
_PARAGRAPH_RE = re.compile(r'<p\b[^>]*>(.*?)</p>', flags=re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r'<[^>]+>')
_SCRIPT_STYLE_RE = re.compile(r'<(script|style|noscript)\b[^>]*>.*?</\1>', flags=re.IGNORECASE | re.DOTALL)
_CODE_ARTIFACT_RE = re.compile(
    r'(htmlelements|tickerdata|numberformat|pricediff|text-green|text-red|\+\=|<script|</script>|function\s*\(|var\s+\w+\s*=)',
    flags=re.IGNORECASE,
)


def normalize_image_url(url: Optional[str], base_url: Optional[str] = None) -> Optional[str]:
    if not url:
        return None
    cleaned = unescape(str(url)).strip()
    if not cleaned:
        return None
    if cleaned.startswith("//"):
        cleaned = f"https:{cleaned}"
    if base_url:
        cleaned = urljoin(base_url, cleaned)
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    return None


def extract_image_from_html(html: str, base_url: Optional[str] = None) -> Optional[str]:
    for pattern in (_META_OG_IMAGE_RE, _META_ITEMPROP_IMAGE_RE, _LINK_PRELOAD_IMAGE_RE, _IMG_SRC_RE):
        match = pattern.search(html)
        if not match:
            continue
        extracted = normalize_image_url(match.group(1), base_url=base_url)
        if extracted:
            return extracted
    return None


def fetch_fallback_image_url(article_url: Optional[str]) -> Optional[str]:
    normalized_article_url = normalize_image_url(article_url)
    if not normalized_article_url:
        return None

    try:
        response = requests.get(
            normalized_article_url,
            timeout=(1.5, 3.5),
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; FastAFNewsBot/1.0)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            allow_redirects=True,
        )
        response.raise_for_status()

        content_type = (response.headers.get("Content-Type") or "").lower()
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            return None

        html = response.text[:500000]
        return extract_image_from_html(html, base_url=str(response.url))
    except requests.RequestException:
        return None


def _looks_like_code_artifact(text: str) -> bool:
    if _CODE_ARTIFACT_RE.search(text):
        return True
    symbol_count = sum(ch in '{};<>[]=+|$' for ch in text)
    return symbol_count > max(8, len(text) // 7)


def extract_text_from_html(html: str) -> str:
    paragraphs = []
    cleaned_html = _SCRIPT_STYLE_RE.sub(" ", html)
    for match in _PARAGRAPH_RE.findall(cleaned_html):
        text = _TAG_RE.sub(" ", match)
        text = unescape(text)
        text = " ".join(text.split())
        if _looks_like_code_artifact(text):
            continue
        if len(text) >= 45:
            paragraphs.append(text)
        if len(" ".join(paragraphs)) >= 1400:
            break
    return " ".join(paragraphs)


def fetch_fallback_summary(article_url: Optional[str], max_chars: int = 1000) -> Optional[str]:
    normalized_article_url = normalize_image_url(article_url)
    if not normalized_article_url:
        return None

    try:
        response = requests.get(
            normalized_article_url,
            timeout=(2.0, 5.0),
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; FastAFNewsBot/1.0)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
            allow_redirects=True,
        )
        response.raise_for_status()

        content_type = (response.headers.get("Content-Type") or "").lower()
        if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
            return None

        html = response.text[:600000]
        extracted = extract_text_from_html(html)
        if not extracted:
            return None
        if len(extracted) <= max_chars:
            return extracted
        return f"{extracted[:max_chars].rsplit(' ', 1)[0]}..."
    except requests.RequestException:
        return None
