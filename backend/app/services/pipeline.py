from apscheduler.schedulers.background import BackgroundScheduler
from app.services.reddit import get_trending_keywords
from app.services.rss import fetch_rss_articles
from app.services.news import fetch_newsapi_articles, fetch_newsdata_articles
from app.services.ai import generate_summary, generate_article_hash, get_supabase_client
from app.services.image import fetch_fallback_image_url
from app.services.daily_brief import generate_and_store_daily_brief, IST
import sys

def run_news_pipeline():
    """
    Main job that fetches keywords from Reddit, matches them against latest RSS articles,
    generates AI summaries, and saves deduplicated final articles to Supabase.
    """
    print("Running news pipeline...")
    
    # 1. Get trending Reddit keywords (returns empty list if keys aren't ready)
    try:
        keywords = set(get_trending_keywords())
        print(f"Discovered {len(keywords)} trending Reddit keywords.")
    except Exception:
        keywords = set()
        print("Skipping Reddit keywords (waiting for API approval). Using default topics.")
    
    # 2. Fetch raw RSS articles & NewsAPI
    import random
    raw_articles = fetch_rss_articles()
    print(f"Fetched {len(raw_articles)} total articles from RSS feeds.")
    
    categories = ["Technology", "International", "India", "Business", "Sports", "Science", "Startups", "Entertainment", "Travel", "Automobile", "Hatke", "Fashion", "Politics", "Education", "Miscellaneous", "Indian Defence", "Indian Economy"]
    # Pick 2 random categories to fetch from NewsAPI each run to avoid rate limits
    always_include = ["India", "Indian Defence", "Indian Economy"]
    other_cats = [c for c in categories if c not in always_include]
    selected_cats = always_include + random.sample(other_cats, 2)
    
    news_articles = []
    for cat in selected_cats:
        if cat in ["Indian Defence", "Indian Economy", "India"]:
            news_articles.extend(fetch_newsdata_articles(cat, page_size=10))
        else:
            query = "quirky OR weird" if cat == "Hatke" else cat
            news_articles.extend(fetch_newsapi_articles(query, page_size=10))
    
    print(f"Fetched {len(news_articles)} total articles from API providers for {selected_cats}.")
    
    raw_articles.extend(news_articles)
    
    # 3. Filter articles matching trending keywords to ensure relevance
    # If no keywords (e.g., API issues), we'll keep the articles.
    trending_articles = raw_articles
        
    print(f"Filtered down to {len(trending_articles)} trending articles.")
    
    # 4. Integrate AI Summarization, Deduplication and Save to Supabase
    supabase = get_supabase_client()
    if not supabase:
        print("Skipping DB save due to missing Supabase client.")
        return

    saved_count = 0
    for article in trending_articles:
        try:
            # Hash URL and Title for deduplication
            article_hash = generate_article_hash(article["title"], article["url"])
            
            # Check if exists (fast fail via API)
            existing = supabase.table("articles").select("id").eq("hash", article_hash).execute()
            
            if not existing.data:
                # 5. Summarize using HuggingFace Inference API (Free tier)
                print(f"Summarizing article: {article['title']}")
                ai_summary = generate_summary(article["summary_raw"] or article["title"])
                image_url = article.get("image_url") or fetch_fallback_image_url(article.get("url"))
                
                # Insert to Supabase DB
                data = {
                    "hash": article_hash,
                    "title": article["title"],
                    "summary": ai_summary,
                    "url": article["url"],
                    "category": article["category"],
                    "source": article["source"],
                    "published_at": article.get("published_at"),
                    "image_url": image_url,
                }
                
                # Save
                try:
                    supabase.table("articles").insert(data).execute()
                except Exception as insert_e:
                    if 'PGRST204' in str(insert_e):
                        # Schema cache issue or missing optional columns; retry with reduced payload.
                        reduced_data = dict(data)
                        for key in ["image_url", "published_at"]:
                            if key in reduced_data:
                                del reduced_data[key]
                                try:
                                    supabase.table("articles").insert(reduced_data).execute()
                                    break
                                except Exception as reduced_insert_e:
                                    if 'PGRST204' in str(reduced_insert_e):
                                        continue
                                    raise reduced_insert_e
                        else:
                            raise insert_e
                    else:
                        raise insert_e
                
                saved_count += 1
                
        except Exception as e:
            print(f"Error processing article {article.get('title')}: {e}", file=sys.stderr)

    print(f"Successfully processed and stored {saved_count} new AI-summarized articles.")


def run_daily_brief_pipeline():
    """Generate and store the daily brief once per day."""
    print("Running daily brief pipeline...")
    payload = generate_and_store_daily_brief(force=False)
    print(f"Daily brief ready for {payload.get('date')}")


from datetime import datetime

scheduler = BackgroundScheduler()
# Run immediately on startup, then every 2 minutes mapped for real-time aggregation
scheduler.add_job(run_news_pipeline, "interval", minutes=2, next_run_time=datetime.now())
scheduler.add_job(run_daily_brief_pipeline, "cron", hour=9, minute=0, timezone=IST)

def start_pipeline():
    scheduler.start()
