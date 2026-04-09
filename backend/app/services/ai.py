import os
import requests
import json
from dotenv import load_dotenv
import hashlib
from typing import Optional
from supabase import create_client, Client

load_dotenv()

# We use facebook's BART model for fast, high-quality, zero-shot summarization.
# Alternative: "sshleifer/distilbart-cnn-12-6" for even faster inference
SUMMARIZATION_MODEL = "sshleifer/distilbart-cnn-12-6"
HF_API_URL = f"https://api-inference.huggingface.co/models/{SUMMARIZATION_MODEL}"
HF_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

def _fallback_summary(text: str, max_chars: int = 650) -> str:
    from app.services.rss import strip_html_tags
    cleaned = " ".join((strip_html_tags(text) or "").split())
    if not cleaned:
        return "Summary unavailable."
    if len(cleaned) <= max_chars:
        return cleaned
    truncated = cleaned[:max_chars].rsplit(" ", 1)[0]
    return f"{truncated}..."

def generate_summary(text: str) -> str:
    """
    Summarizes news articles for longer in-card readability using HuggingFace's free inference API.
    """
    if not HF_API_KEY or HF_API_KEY == "your_huggingface_key":
        print("Warning: Missing HuggingFace API Key. Returning fallback summary.")
        return _fallback_summary(text)

    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    payload = {
        "inputs": text,
        "parameters": {
            "max_length": 180,
            "min_length": 80,
            "do_sample": False
        }
    }
    
    try:
        response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        summary = response.json()[0]['summary_text']
        if not summary or len(summary.strip()) < 220:
            return _fallback_summary(text)
        return summary
    except Exception as e:
        print(f"Error calling HuggingFace API: {e}")
        return _fallback_summary(text)

def generate_article_hash(title: str, url: str) -> str:
    """Creates a unique hash to prevent saving duplicate articles."""
    hash_input = f"{title.lower()}{url.lower()}".encode('utf-8')
    return hashlib.sha256(hash_input).hexdigest()

def get_supabase_client() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_KEY or SUPABASE_URL == "your_supabase_url":
        print("Warning: Missing Supabase credentials. Cannot connect to DB.")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)
