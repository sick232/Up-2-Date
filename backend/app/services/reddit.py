import os
import praw
import re
from dotenv import load_dotenv

load_dotenv()

# Simple common stop words to filter out noise from Reddit titles
STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "with",
    "by", "about", "like", "through", "over", "before", "between", "after", "since",
    "without", "under", "within", "along", "following", "across", "behind", "beyond",
    "plus", "except", "but", "up", "out", "around", "down", "off", "above", "near", "this",
    "that", "these", "those", "have", "has", "had", "been", "are", "is", "was", "were",
    "they", "their", "them", "he", "his", "she", "her", "it", "its", "from", "what", "which",
    "who", "how", "why", "when", "where", "all", "any", "both", "each", "few", "more", "most",
    "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "can", "will", "just", "should", "now", "says", "said", "new", "year", "years"
}

def get_trending_keywords(limit: int = 25) -> list[str]:
    """
    Fetches trending topics from top subreddits and extracts keywords from titles.
    """
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    
    if not client_id or not client_secret or client_id == "your_reddit_client_id":
        print("Warning: Missing Reddit API credentials. Returning generic keywords.")
        return ["ai", "tech", "technology", "sports", "politics"]

    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent="news_aggregator_bot_1.0"
        )
        
        subreddits = ["news", "worldnews", "technology"]
        keywords = set()
        
        for sub in subreddits:
            for submission in reddit.subreddit(sub).hot(limit=limit):
                # Extract words length >= 4
                words = re.findall(r'\b[A-Za-z]{4,}\b', submission.title)
                for word in words:
                    lowercase_word = word.lower()
                    if lowercase_word not in STOP_WORDS:
                        keywords.add(lowercase_word)
                        
        return list(keywords)
    except Exception as e:
        print(f"Error fetching Reddit trends: {e}")
        return []
