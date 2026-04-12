from fastapi import APIRouter, HTTPException, Header
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from postgrest.exceptions import APIError
from app.services.ai import get_supabase_client
from app.services.image import fetch_fallback_image_url, fetch_fallback_summary
from app.services.daily_brief import (
    generate_and_store_daily_brief,
    get_daily_brief_for_date,
    reorder_brief_categories_for_interests,
    today_ist_date,
)
from fastapi_cache.decorator import cache
from pathlib import Path
from datetime import datetime, timezone
import threading
import time
import json

router = APIRouter()

LOCAL_BOOKMARKS_PATH = Path(__file__).resolve().parents[1] / "db" / "bookmarks_local.json"

_RESOLVER_CACHE_LOCK = threading.Lock()
_MAX_CACHE_ENTRIES = 600
_IMAGE_CACHE_TTL_SECONDS = 60 * 60 * 6
_SUMMARY_CACHE_TTL_SECONDS = 60 * 60 * 2
_EMPTY_RESULT_TTL_SECONDS = 60 * 10
_DAILY_BRIEF_CACHE_TTL_SECONDS = 60 * 5
_image_resolver_cache: Dict[str, tuple[float, Any]] = {}
_summary_resolver_cache: Dict[str, tuple[float, Any]] = {}
_daily_brief_cache: Dict[str, tuple[float, Any]] = {}

class BookmarkArticle(BaseModel):
    id: str
    title: str
    summary: str
    url: str
    category: Optional[str] = "General"
    source: Optional[str] = "Unknown"
    created_at: Optional[str] = None
    published_at: Optional[str] = None
    image_url: Optional[str] = None

class BookmarkRequest(BaseModel):
    article_id: str
    article: Optional[BookmarkArticle] = None

class InterestsRequest(BaseModel):
    interests: List[str]

def _normalize_resolver_url(raw_url: str) -> str:
    return raw_url.strip()

def _cache_get(cache: Dict[str, tuple[float, Any]], key: str) -> tuple[bool, Any]:
    now = time.time()
    with _RESOLVER_CACHE_LOCK:
        item = cache.get(key)
        if not item:
            return False, None
        expires_at, value = item
        if expires_at < now:
            cache.pop(key, None)
            return False, None
        return True, value

def _cache_set(cache: Dict[str, tuple[float, Any]], key: str, value: Any, ttl_seconds: int) -> None:
    expires_at = time.time() + ttl_seconds
    with _RESOLVER_CACHE_LOCK:
        cache[key] = (expires_at, value)

        if len(cache) <= _MAX_CACHE_ENTRIES:
            return

        now = time.time()
        expired_keys = [k for k, (exp, _) in cache.items() if exp < now]
        for expired_key in expired_keys:
            cache.pop(expired_key, None)

        while len(cache) > _MAX_CACHE_ENTRIES:
            oldest_key = next(iter(cache), None)
            if oldest_key is None:
                break
            cache.pop(oldest_key, None)

def _load_local_bookmarks() -> Dict[str, List[Dict[str, Any]]]:
    if not LOCAL_BOOKMARKS_PATH.exists():
        return {}
    try:
        with LOCAL_BOOKMARKS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}

def _save_local_bookmarks(data: Dict[str, List[Dict[str, Any]]]) -> None:
    LOCAL_BOOKMARKS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOCAL_BOOKMARKS_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=True, indent=2)

def _normalize_bookmark_article(article_id: str, article: Optional[BookmarkArticle]) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    if not article:
        return {
            "id": article_id,
            "title": "Saved article",
            "summary": "This article was saved from your feed.",
            "url": "#",
            "category": "Saved",
            "source": "Local",
            "created_at": now_iso,
            "published_at": None,
            "image_url": None,
        }

    payload = article.model_dump()
    payload["id"] = article_id
    payload["created_at"] = payload.get("created_at") or now_iso
    payload["category"] = payload.get("category") or "General"
    payload["source"] = payload.get("source") or "Unknown"
    return payload

def _toggle_local_bookmark(user_id: str, article_id: str, article: Optional[BookmarkArticle]) -> Dict[str, str]:
    data = _load_local_bookmarks()
    user_items = data.get(user_id, [])
    exists = any(item.get("id") == article_id for item in user_items)

    if exists:
        data[user_id] = [item for item in user_items if item.get("id") != article_id]
        _save_local_bookmarks(data)
        return {"status": "removed", "article_id": article_id}

    user_items.append(_normalize_bookmark_article(article_id, article))
    data[user_id] = sorted(
        user_items,
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )
    _save_local_bookmarks(data)
    return {"status": "added", "article_id": article_id}

def _get_local_bookmarks(user_id: str) -> List[Dict[str, Any]]:
    data = _load_local_bookmarks()
    user_items = data.get(user_id, [])
    return sorted(
        user_items,
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )

def _merge_bookmarks(primary: List[Dict[str, Any]], fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    for item in fallback:
        article_id = item.get("id")
        if article_id:
            merged[article_id] = item
    for item in primary:
        article_id = item.get("id")
        if article_id:
            merged[article_id] = item

    return sorted(
        list(merged.values()),
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )

def _hydrate_missing_image_urls(supabase, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for article in articles:
        if article.get("image_url"):
            continue

        article_id = article.get("id")
        article_url = article.get("url")
        if not article_id or not article_url:
            continue

        image_url = fetch_fallback_image_url(article_url)
        if not image_url:
            continue

        article["image_url"] = image_url

        try:
            supabase.table("articles").update({"image_url": image_url}).eq("id", article_id).execute()
        except APIError:
            pass

    return articles

@router.get("/news/resolve-image")
def resolve_image(url: str):
    """Best-effort resolve a news image URL from a source page."""
    normalized_url = _normalize_resolver_url(url)
    has_cached, cached = _cache_get(_image_resolver_cache, normalized_url)
    if has_cached:
        return {"image_url": cached}

    image_url = fetch_fallback_image_url(normalized_url)
    ttl_seconds = _IMAGE_CACHE_TTL_SECONDS if image_url else _EMPTY_RESULT_TTL_SECONDS
    _cache_set(_image_resolver_cache, normalized_url, image_url, ttl_seconds)
    return {"image_url": image_url}

@router.get("/news/resolve-summary")
def resolve_summary(url: str):
    """Best-effort resolve a longer summary from a source page."""
    normalized_url = _normalize_resolver_url(url)
    has_cached, cached = _cache_get(_summary_resolver_cache, normalized_url)
    if has_cached:
        return {"summary": cached}

    summary = fetch_fallback_summary(normalized_url)
    ttl_seconds = _SUMMARY_CACHE_TTL_SECONDS if summary else _EMPTY_RESULT_TTL_SECONDS
    _cache_set(_summary_resolver_cache, normalized_url, summary, ttl_seconds)
    return {"summary": summary}

@router.get("/daily-brief")
@cache(expire=300)
def get_daily_brief(user_id: Optional[str] = Header(default=None, description="Supabase Auth User ID")):
    """Return today's daily brief. If missing, generate and return it."""
    today_key = today_ist_date()
    has_cached, cached_payload = _cache_get(_daily_brief_cache, today_key)
    if has_cached and cached_payload is not None:
        payload = dict(cached_payload)
    else:
        payload = get_daily_brief_for_date()
        if payload is None:
            payload = generate_and_store_daily_brief(force=False)
        _cache_set(_daily_brief_cache, today_key, payload, _DAILY_BRIEF_CACHE_TTL_SECONDS)

    if not user_id:
        return payload

    supabase = get_supabase_client()
    if not supabase:
        return payload

    try:
        response = supabase.table("profiles").select("interests").eq("id", user_id).limit(1).execute()
        if not response.data:
            return payload
        interests = response.data[0].get("interests") or []
        return reorder_brief_categories_for_interests(payload, interests)
    except Exception:
        return payload

@router.put("/profiles/interests")
def update_interests(req: InterestsRequest, user_id: str = Header(..., description="Supabase Auth User ID")):
    """Update user interests."""
    supabase = get_supabase_client()
    if not supabase:
        return {"status": "mock_updated", "interests": req.interests}

    try:
        supabase.table("profiles").upsert({"id": user_id, "interests": req.interests}).execute()
        return {"status": "updated", "interests": req.interests}
    except APIError as exc:
        # Local dev often uses a mock user ID that does not exist in auth.users.
        # Treat that as a successful save so the UI stays functional without Supabase auth setup.
        if getattr(exc, "code", None) == "23503":
            return {"status": "mock_updated", "interests": req.interests}
        raise HTTPException(status_code=500, detail="Failed to save interests")

@router.get("/profiles/interests")
def get_interests(user_id: str = Header(..., description="Supabase Auth User ID")):
    """Get user interests."""
    supabase = get_supabase_client()
    if not supabase:
        return {"interests": []}
    
    response = supabase.table("profiles").select("interests").eq("id", user_id).execute()
    if not response.data:
        return {"interests": []}
    
    return {"interests": response.data[0].get("interests", [])}

@router.get("/news/trending")
@cache(expire=1800)
def get_trending_news(limit: int = 20):
    """Fetch the latest AI-summarized trending news."""
    supabase = get_supabase_client()
    if not supabase:
        # Fallback Mock data for visual testing before DB setup
        return [
            {
                "id": "mock-1",
                "title": "Welcome to AI News! Set up your Supabase to see real data.",
                "summary": "This is a mock article because the Supabase URL or Key is missing from your .env file. Once you provide the credentials, the Python backend pipeline will automatically populate real trending AI summaries right here.",
                "url": "https://supabase.com",
                "category": "Technology",
                "source": "System",
                "created_at": "2026-04-02T12:00:00Z"
            }
        ]
        
    # Get latest articles chronologically
    response = supabase.table("articles").select("*").order("created_at", desc=True).limit(100).execute()
    import random
    articles = response.data
    if len(articles) > limit:
        articles = random.sample(articles, limit)
    return articles

@router.get("/news/foryou")
def get_for_you_news(user_id: str = Header(..., description="Supabase Auth User ID"), limit: int = 20):
    """Fetch news matching the user's specific interests."""
    if not user_id or not user_id.strip():
        # Let's fallback to trending if they don't have a valid user-id (like when unauthenticated but viewing For You)
        return get_trending_news(limit)

    supabase = get_supabase_client()
    if not supabase:
        # Fallback Mock
        return [
            {
                "id": "mock-2",
                "title": "Welcome to Your Personalized Feed",
                "summary": "This feed gets filtered based on the onboarding categories you select. Currently displaying in testing mock mode.",
                "url": "https://react.dev",
                "category": "Interests",
                "source": "System",
                "created_at": "2026-04-02T12:00:00Z"
            }
        ]

    # 1. Get User Interests
    user_response = supabase.table("profiles").select("interests").eq("id", user_id).execute()
    if not user_response.data:
        # Fallback to trending if user profile isn't found
        return get_trending_news(limit)
        
    interests = user_response.data[0].get("interests", [])

    # 2. Match Articles by Category
    # If no interests, fallback to trending
    if not interests:
        return get_trending_news(limit)
        
    response = (supabase.table("articles")
        .select("*")
        .in_("category", interests)
        .order("created_at", desc=True)
        .limit(100)
        .execute())
        
    import random
    articles = response.data
    if len(articles) > limit:
        articles = random.sample(articles, limit)
    return articles

@router.post("/bookmarks")
def toggle_bookmark(req: BookmarkRequest, user_id: str = Header(..., description="Supabase Auth User ID")):
    """Add or remove an article from bookmarks."""
    if not user_id or not user_id.strip():
        raise HTTPException(status_code=401, detail="Must be logged in to bookmark")

    supabase = get_supabase_client()
    if not supabase:
        return _toggle_local_bookmark(user_id, req.article_id, req.article)
        
    try:
        # Check if already bookmarked
        existing = supabase.table("bookmarks").select("*") \
            .eq("user_id", user_id).eq("article_id", req.article_id).execute()

        if existing.data:
            # Unsave
            supabase.table("bookmarks").delete() \
                .eq("user_id", user_id).eq("article_id", req.article_id).execute()
            return {"status": "removed", "article_id": req.article_id}

        # Save
        supabase.table("bookmarks").insert({"user_id": user_id, "article_id": req.article_id}).execute()
        return {"status": "added", "article_id": req.article_id}
    except APIError as exc:
        # Fall back to local persistence for local/dev cases where DB constraints are not satisfied.
        if getattr(exc, "code", None) in {"23503", "22P02"}:
            return _toggle_local_bookmark(user_id, req.article_id, req.article)
        raise HTTPException(status_code=500, detail="Failed to toggle bookmark")

@router.get("/bookmarks")
def get_bookmarks(user_id: str = Header(..., description="Supabase Auth User ID")):
    """Get all saved articles for a user."""
    if not user_id or not user_id.strip():
        # User not logged in, return empty bookmarks
        return []

    supabase = get_supabase_client()
    local_bookmarks = _get_local_bookmarks(user_id)

    if not supabase:
        return local_bookmarks

    try:
        response = (supabase.table("bookmarks")
            .select("created_at, articles(*)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute())
        db_bookmarks = [item["articles"] for item in response.data if item.get("articles")]
        return _merge_bookmarks(db_bookmarks, local_bookmarks)
    except APIError as exc:
        if getattr(exc, "code", None) == "23503":
            return local_bookmarks
        raise HTTPException(status_code=500, detail="Failed to fetch bookmarks")

@router.get("/news/category/{category_name}")
@cache(expire=1800)
def get_category_news(category_name: str, limit: int = 20):
    supabase = get_supabase_client()
    if not supabase:
        return []
        
    response = (supabase.table("articles")
        .select("*")
        .eq("category", category_name)
        .order("created_at", desc=True)
        .limit(100)
        .execute())
        
    import random
    articles = response.data
    if len(articles) > limit:
        articles = random.sample(articles, limit)
    return articles

