import os
import requests
from app.services.image import normalize_image_url, fetch_fallback_image_url

def fetch_newsdata_articles(query="technology", page_size=10):
    """
    Fetches articles from NewsData.io using explicit boolean/country targeting.
    Especially useful for localized Indian Defence/Economy topics.
    """
    api_key = os.getenv("NEWSDATA_API_KEY")
    if not api_key or api_key == "your_newsdata_api_key_here":
        print("Missing NEWSDATA_API_KEY")
        return []
        
    actual_query = query
    if query == "Indian Defence":
        actual_query = "defence OR military OR army"
    elif query == "Indian Economy":
        actual_query = "economy OR business OR finance OR market"
        
    url = f"https://newsdata.io/api/1/news?apikey={api_key}&q={actual_query}&country=in&language=en&size={page_size}"
    
    try:
        response = requests.get(url, timeout=(3, 10))
        response.raise_for_status()
        data = response.json()
        
        normalized_articles = []
        for article in data.get("results", []):
            title = article.get("title")
            link = article.get("link")
            summary = article.get("description") or article.get("content", "")
            image_url = normalize_image_url(
                article.get("image_url")
                or article.get("image")
                or article.get("imageUrl")
                or article.get("thumbnail")
            )
            if not image_url:
                image_url = fetch_fallback_image_url(link)
            
            if not title or not link:
                continue
                
            normalized_articles.append({
                "title": title,
                "url": link,
                "summary_raw": summary,
                "category": query,
                "source": "NewsData.io",
                "published_at": article.get("pubDate"),
                "image_url": image_url,
            })
        return normalized_articles
    except requests.exceptions.RequestException as e:
        print(f"Error fetching from NewsData: {e}")
        return []

def fetch_newsapi_articles(query="technology", page_size=10):
    """
    Fetches articles from NewsAPI.org based on a search query.
    """
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key or api_key == "your_news_api_key_here":
        print("Missing NEWS_API_KEY")
        return []
        
    actual_query = query
    if query == "Indian Defence":
        # Specialized boolean query to filter out irrelevant news
        actual_query = '("Indian Army" OR "Indian Navy" OR "Indian Air Force" OR "DRDO" OR "Indian Armed Forces")'
        
    url = f"https://newsapi.org/v2/everything?q={actual_query}&pageSize={page_size}&language=en&apiKey={api_key}"
    
    try:
        response = requests.get(url, timeout=(3, 10))
        response.raise_for_status()
        data = response.json()
        
        normalized_articles = []
        for article in data.get("articles", []):
            title = article.get("title")
            link = article.get("url")
            summary = article.get("description") or article.get("content", "")
            image_url = normalize_image_url(article.get("urlToImage") or article.get("image"))
            if not image_url:
                image_url = fetch_fallback_image_url(link)
            
            if not title or not link or "[Removed]" in title:
                continue
                
            normalized_articles.append({
                "title": title,
                "url": link,
                "summary_raw": summary,
                "category": query,
                "source": "NewsAPI",
                "published_at": article.get("publishedAt"),
                "image_url": image_url,
            })
        return normalized_articles
    except requests.exceptions.RequestException as e:
        print(f"Error fetching from NewsAPI: {e}")
        return []
