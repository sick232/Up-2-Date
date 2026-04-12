"use client";

import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, ExternalLink, Share2, Sparkles, Edit3, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export interface Article {
  id: string;
  title: string;
  summary: string;
  url: string;
  image_url?: string;
  category: string;
  source: string;
  created_at: string;
  published_at?: string;
}

function timeAgo(dateString: string | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  let seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 0) seconds = 0; // Handle clock mismatches that put articles slightly in the 'future'

  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return `Just now`;
  else if (minutes < 60) return `${minutes}m ago`;
  else if (hours < 24) return `${hours}h ago`;
  else return `${days}d ago`;
}

const SUMMARY_ARTIFACT_RE = /(htmlelements|tickerdata|numberformat|pricediff|text-green|text-red|\+\=|<script|<\/script>|function\s*\(|var\s+\w+\s*=)/i;
const SUMMARY_FALLBACK_TEXT = "Summary currently unavailable. Open the source to read more.";

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#8216;": "‘",
    "&#8217;": "’",
    "&#8220;": "“",
    "&#8221;": "”",
    "&#8211;": "–",
    "&#8212;": "—",
    "&apos;": "'",
  };
  return text.replace(/&(#\d+|[a-zA-Z]+);/g, (match) => {
    return entities[match] || match;
  });
}

function sanitizeSummary(text: string): string {
  let normalized = (text || "").replace(/\s+/g, " ").trim();
  normalized = decodeHtmlEntities(normalized);
  if (!normalized) return SUMMARY_FALLBACK_TEXT;

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const filtered = sentences.filter((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return false;
    if (SUMMARY_ARTIFACT_RE.test(trimmed)) return false;

    const symbolCount = (trimmed.match(/[{};<>[\]=+|$]/g) || []).length;
    return symbolCount <= Math.max(8, Math.floor(trimmed.length / 7));
  });

  const cleaned = filtered.join(" ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 45) {
    return SUMMARY_FALLBACK_TEXT;
  }

  return cleaned;
}

function isCorruptedSummary(text: string): boolean {
  return SUMMARY_ARTIFACT_RE.test(text || "");
}

interface NewsCardProps {
  article: Article;
  isBookmarked: boolean;
  onBookmarkToggle: (article: Article) => void;
}

export default function NewsCard({ article, isBookmarked, onBookmarkToggle }: NewsCardProps) {
  const [localBookmark, setLocalBookmark] = useState(isBookmarked);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | undefined>(article.image_url);
  const [resolvingImage, setResolvingImage] = useState(false);
  const [resolvedSummary, setResolvedSummary] = useState(sanitizeSummary(article.summary));
  const [resolvingSummary, setResolvingSummary] = useState(false);
  // Prevent SSR Hydration mismatches by only rendering time on the client
  const [mounted, setMounted] = useState(false);

  // States for Note Taking
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Run on mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalBookmark(isBookmarked);
  }, [isBookmarked]);

  useEffect(() => {
    setResolvedImageUrl(article.image_url);

    if (article.image_url) {
      return;
    }

    let cancelled = false;
    const resolveImage = async () => {
      setResolvingImage(true);
      try {
        const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");
        const response = await fetch(`${apiBaseUrl}/news/resolve-image?url=${encodeURIComponent(article.url)}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (!cancelled && data?.image_url) {
          setResolvedImageUrl(data.image_url);
        }
      } catch (error) {
        console.error("Error resolving image:", error);
      } finally {
        if (!cancelled) {
          setResolvingImage(false);
        }
      }
    };

    resolveImage();

    return () => {
      cancelled = true;
    };
  }, [article.image_url, article.url]);

  useEffect(() => {
    setResolvedSummary(sanitizeSummary(article.summary));

    const rawSummary = (article.summary || "").trim();
    if (!isCorruptedSummary(rawSummary) && rawSummary.length >= 260) {
      return;
    }

    let cancelled = false;
    const resolveSummary = async () => {
      setResolvingSummary(true);
      try {
        const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");
        const response = await fetch(`${apiBaseUrl}/news/resolve-summary?url=${encodeURIComponent(article.url)}`);
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (!cancelled && data?.summary) {
          setResolvedSummary(sanitizeSummary(data.summary));
        }
      } catch (error) {
        console.error("Error resolving summary:", error);
      } finally {
        if (!cancelled) {
          setResolvingSummary(false);
        }
      }
    };

    resolveSummary();

    return () => {
      cancelled = true;
    };
  }, [article.summary, article.url]);

  const handleBookmark = () => {
    setLocalBookmark(!localBookmark);
    onBookmarkToggle(article);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    setSaveStatus("idle");
    try {
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        alert("Please log in to save notes!");
        setSaveStatus("error");
        setSavingNote(false);
        return;
      }
      
      const { error } = await client.from("notes").insert({
        user_id: user.id,
        article_id: article.id,
        content: noteText,
      });

      if (error) throw error;
      
      setSaveStatus("success");
      setTimeout(() => {
        setIsNoteOpen(false);
        setNoteText("");
        setSaveStatus("idle");
      }, 1500);
    } catch (error) {
      console.error("Error saving note:", error);
      setSaveStatus("error");
    } finally {
      setSavingNote(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: decodeHtmlEntities(article.title),
        text: decodeHtmlEntities(article.summary),
        url: article.url,
      });
    }
  };

  const displayDate = article.published_at || article.created_at;

  return (
    <div className="w-full h-screen snap-start shrink-0 flex items-center justify-center px-4 pt-24 pb-4 bg-gray-50 dark:bg-[#171717] flex-col transition-colors">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden flex flex-col h-[82vh] md:h-[76vh] relative transition-colors"
      >
        {/* Category & AI Badge */}
        <div className="absolute top-4 left-4 right-4 flex justify-between z-10">
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-black/80 dark:bg-black/60 backdrop-blur-md text-white text-xs font-bold rounded-full uppercase tracking-wider">
              {article.category || "General"}
            </span>
            {mounted && displayDate && (
              <span className="px-3 py-1 bg-gray-800/80 dark:bg-gray-700/80 backdrop-blur-md text-white text-xs font-medium rounded-full tracking-wide flex items-center">
                {timeAgo(displayDate)}
              </span>
            )}
          </div>
          <span className="px-3 py-1 bg-[#595963] text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-sm">
  <img src="/icon.svg" width={14} height={14} alt="Up-2-Date Icon" className="mt-[-1px]" />
  Up-2-Date
</span>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 pt-20 relative">
          <div className="h-full min-h-0 grid grid-cols-1 md:grid-cols-[35%_65%] gap-4 md:gap-6">
            <div className="h-40 md:h-full w-full overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-800/50 shrink-0 transition-colors">
              {resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt={decodeHtmlEntities(article.title)}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  {resolvingImage ? "Loading image..." : "No image available"}
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-hidden flex flex-col">
              <h1 className="text-2xl md:text-[2rem] font-extrabold text-gray-900 dark:text-gray-100 leading-tight mb-3 line-clamp-4 transition-colors">
                {decodeHtmlEntities(article.title)}
              </h1>

              <div className="flex items-start gap-2 min-h-0 flex-1 overflow-hidden">
                <div className="h-10 w-1 bg-blue-600 rounded-full shrink-0"></div>
                <div className="min-h-0 max-h-full overflow-y-auto pr-1">
                  <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed transition-colors">
                    {decodeHtmlEntities(resolvedSummary)}
                  </p>
                  {resolvingSummary && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Expanding summary...</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between mt-auto shrink-0 transition-colors relative">
          <div className="flex gap-4 text-gray-400 dark:text-gray-500">
            <button onClick={handleShare} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors group">
              <Share2 size={24} className="group-hover:text-gray-900 dark:group-hover:text-gray-200" />
            </button>
            <button onClick={handleBookmark} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors group">
              {localBookmark ? (
                <BookmarkCheck size={24} className="text-blue-600 dark:text-blue-500 fill-blue-600 dark:fill-blue-500" />
              ) : (
                <Bookmark size={24} className="group-hover:text-gray-900 dark:group-hover:text-gray-200" />
              )}
            </button>
            <button onClick={() => setIsNoteOpen(!isNoteOpen)} className={`p-2 rounded-full transition-colors group ${isNoteOpen ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Edit3 size={24} className={isNoteOpen ? 'text-blue-600 dark:text-blue-400' : 'group-hover:text-gray-900 dark:group-hover:text-gray-200'} />
            </button>
          </div>

          {/* Note Dropdown Panel */}
          {isNoteOpen && (
            <div className="absolute bottom-[110%] left-4 mb-2 w-[calc(100vw-32px)] sm:w-96 bg-white dark:bg-gray-900 shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4 z-40 transition-all">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-gray-900 dark:text-gray-100">Take a Note</h4>
                <button onClick={() => setIsNoteOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">&times;</button>
              </div>
              <textarea 
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="What are your thoughts on this article?"
                className="w-full h-24 p-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 mb-3 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex justify-between items-center h-10">
                <span className="text-xs">
                  {saveStatus === "success" && <span className="text-green-600 dark:text-green-400 font-medium">✨ Saved!</span>}
                  {saveStatus === "error" && <span className="text-red-600 dark:text-red-400 font-medium">Failed to save.</span>}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setIsNoteOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Cancel</button>
                  <button onClick={handleSaveNote} disabled={savingNote || !noteText.trim()} className="flex items-center justify-center min-w-[70px] px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">
                    {savingNote ? <Loader2 size={16} className="animate-spin" /> : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-white transition-colors"
          >
            Read Source <ExternalLink size={18} />
          </a>
        </div>
      </motion.div>
      <div className="mt-4 text-gray-400 text-sm font-medium animate-pulse flex flex-col items-center">
        <span>Swipe up for more</span>
        <span>↓</span>
      </div>
    </div>
  );
}
