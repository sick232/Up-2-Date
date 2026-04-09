"use client";

import { motion } from "framer-motion";
import { Sparkles, Edit3, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export interface DailyBriefCategory {
  title: string;
  bullets: string[];
  article_count?: number;
}

export interface DailyBriefSourceLink {
  title: string;
  url: string;
  source: string;
}

export interface DailyBriefArticleCard {
  title: string;
  url: string;
  source: string;
  published_at?: string;
  content: string;
  image_url?: string;
}

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

export interface DailyBriefData {
  date: string;
  updated_at?: string;
  categories: Record<string, DailyBriefCategory>;
  source_links?: Record<string, DailyBriefSourceLink[]>;
  articles?: Record<string, DailyBriefArticleCard[]>;
}

function synthesizeArticlesFromBullets(
  bullets: string[],
  sources: DailyBriefSourceLink[],
  categoryTitle: string,
): DailyBriefArticleCard[] {
  if (bullets.length === 0) return [];

  return bullets.map((bullet, idx) => {
    const bulletContent = bullet.trim();
    // Try to extract title (first sentence) and content
    const titleEnd = Math.min(bulletContent.indexOf(". ") + 1, 80);
    const title =
      titleEnd > 1
        ? bulletContent.substring(0, titleEnd).trim()
        : bulletContent.substring(0, 80);
    const content =
      bulletContent.length > 150
        ? bulletContent.substring(0, 150) + "..."
        : bulletContent;

    // Cycle through available sources
    const source = sources.length > 0 ? sources[idx % sources.length] : null;

    return {
      title: title.replace(/^[•\-\*]\s*/, ""),
      content: content,
      source: source?.source || categoryTitle,
      url: source?.url || "#",
      published_at: undefined,
      image_url: undefined,
    };
  });
}

function formatDisplayDate(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatUpdatedAt(updatedAt?: string): string {
  if (!updatedAt) {
    return "Updated at 9:00 AM IST";
  }

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "Updated at 9:00 AM IST";
  }

  return `Updated ${date.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  })}`;
}

function formatArticleTime(publishedAt?: string): string {
  if (!publishedAt) {
    return "Latest";
  }
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return "Latest";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DailyBriefArticleItem({
  article,
  variant,
}: {
  article: DailyBriefArticleCard;
  variant: "hero" | "stack-top" | "stack-normal" | "sidebar";
}) {
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | undefined>(
    article.image_url,
  );
  const [resolvingImage, setResolvingImage] = useState(false);

  // States for Note Taking
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const handleSaveNote = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigating to article URL
    e.stopPropagation();
    if (!noteText.trim()) return;

    setSavingNote(true);
    setSaveStatus("idle");
    try {
      const client = createClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        alert("Please log in to save notes!");
        setSaveStatus("error");
        setSavingNote(false);
        return;
      }

      const { error } = await client.from("notes").insert({
        user_id: user.id,
        article_id: null, // Since these are synthesized brief articles without permanent db IDs, we can link them to url or leave null for 'General Note'
        content: `[Daily Brief: ${article.title}] - ${noteText}`,
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

  const toggleNote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsNoteOpen(!isNoteOpen);
  };

  useEffect(() => {
    setResolvedImageUrl(article.image_url);

    if (article.image_url || variant === "stack-normal") {
      return;
    }

    let cancelled = false;
    const resolveImage = async () => {
      setResolvingImage(true);
      try {
        const apiBaseUrl = (
          process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
        ).replace(/\/$/, "");
        const response = await fetch(
          `${apiBaseUrl}/news/resolve-image?url=${encodeURIComponent(article.url)}`,
        );
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
  }, [article.image_url, article.url, variant]);

  if (variant === "hero") {
    return (
      <div className="md:col-span-2 flex flex-col group">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus:outline-none"
        >
          {resolvedImageUrl ? (
            <div className="relative w-full aspect-[3/2] mb-4">
              <div className="absolute inset-0 overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-800/50 group-hover:opacity-90 transition-all">
                <img
                  src={resolvedImageUrl}
                  alt={decodeHtmlEntities(article.title)}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <button
                onClick={toggleNote}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-white dark:hover:bg-gray-800 ${isNoteOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`}
                title="Add Note"
              >
                <Edit3 size={18} />
              </button>
            </div>
          ) : resolvingImage ? (
            <div className="w-full aspect-[3/2] bg-gray-100 dark:bg-gray-800 mb-4 animate-pulse transition-colors relative">
              <button
                onClick={toggleNote}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors z-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-white dark:hover:bg-gray-800 ${isNoteOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`}
                title="Add Note"
              >
                <Edit3 size={18} />
              </button>
            </div>
          ) : (
            <div className="w-full h-2 mb-4 bg-[#a82121] relative">
              <button
                onClick={toggleNote}
                className={`absolute top-4 right-0 p-2 rounded-full transition-colors z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${isNoteOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"}`}
                title="Add Note"
              >
                <Edit3 size={18} />
              </button>
            </div>
          )}

          <div className="flex items-start justify-between gap-2 mb-2 relative">
            {article.published_at && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                {formatArticleTime(article.published_at)}
              </span>
            )}

            {/* Note Dropdown */}
            {isNoteOpen && (
              <div
                className="absolute top-10 right-0 w-[300px] bg-white dark:bg-gray-900 shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4 z-40 transition-all cursor-default"
                onClick={(e) => e.preventDefault()}
              >
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    Brief Note
                  </h4>
                  <button
                    onClick={toggleNote}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Note on this brief..."
                  className="w-full h-20 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 mb-3 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex justify-between items-center h-8">
                  <span className="text-xs">
                    {saveStatus === "success" && (
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        Saved!
                      </span>
                    )}
                    {saveStatus === "error" && (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        Failed.
                      </span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={toggleNote}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveNote}
                      disabled={savingNote || !noteText.trim()}
                      className="flex items-center justify-center min-w-[60px] px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                    >
                      {savingNote ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <h4 className="text-3xl md:text-4xl font-extrabold text-black dark:text-gray-100 font-serif leading-tight mb-4 group-hover:text-[#a82121] transition-colors">
            {decodeHtmlEntities(article.title)}
          </h4>

          <p className="text-base text-gray-800 dark:text-gray-300 font-serif leading-relaxed line-clamp-4 transition-colors">
            {decodeHtmlEntities(article.content)}
          </p>
        </a>
      </div>
    );
  }

  if (variant === "stack-top" || variant === "stack-normal") {
    return (
      <article
        className={`py-4 ${variant === "stack-top" ? "pt-0" : ""} group relative`}
      >
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus:outline-none pr-8"
        >
          {variant === "stack-top" && resolvedImageUrl ? (
            <div className="w-full aspect-video overflow-hidden bg-gray-100 dark:bg-gray-800 mb-3 border border-gray-200 dark:border-gray-800/50 group-hover:opacity-90 transition-all">
              <img
                src={resolvedImageUrl}
                alt={decodeHtmlEntities(article.title)}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ) : variant === "stack-top" && resolvingImage ? (
            <div className="w-full aspect-video bg-gray-100 dark:bg-gray-800 mb-3 animate-pulse transition-colors"></div>
          ) : null}
          <h4 className="text-lg md:text-xl font-bold text-black dark:text-gray-100 font-serif leading-snug mb-2 group-hover:text-[#a82121] transition-colors">
            {decodeHtmlEntities(article.title)}
          </h4>
          <p className="text-sm text-gray-700 dark:text-gray-300 font-serif leading-relaxed line-clamp-3 transition-colors">
            {decodeHtmlEntities(article.content)}
          </p>
        </a>

        {/* Edit Button overlay */}
        <button
          onClick={toggleNote}
          className={`absolute top-4 right-0 p-1.5 rounded-full transition-colors z-20 hover:bg-gray-200 dark:hover:bg-gray-800 ${isNoteOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
          title="Add Note"
        >
          <Edit3 size={14} />
        </button>

        {/* Note Dropdown */}
        {isNoteOpen && (
          <div
            className="absolute top-10 right-0 w-[280px] bg-white dark:bg-gray-900 shadow-2xl rounded-2xl border border-gray-200 dark:border-gray-700 p-4 z-40 transition-all cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                Brief Note
              </h4>
              <button
                onClick={toggleNote}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Note on this brief..."
              className="w-full h-20 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 mb-3 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-between items-center h-8">
              <span className="text-xs">
                {saveStatus === "success" && (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Saved!
                  </span>
                )}
                {saveStatus === "error" && (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    Failed.
                  </span>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={toggleNote}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={savingNote || !noteText.trim()}
                  className="flex items-center justify-center min-w-[60px] px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
                >
                  {savingNote ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  }

  if (variant === "sidebar") {
    return (
      <article className="py-3 flex gap-3 items-start group relative">
        <div className="flex-1 pr-6 relative w-full">
          {/* Note overlay button */}
          <button
            onClick={toggleNote}
            className={`absolute -top-1 right-0 p-1 rounded-full transition-colors z-20 hover:bg-gray-200 dark:hover:bg-gray-800 ${isNoteOpen ? "text-blue-600 dark:text-blue-400" : "text-gray-400 opacity-0 group-hover:opacity-100 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
            title="Add Note"
          >
            <Edit3 size={12} />
          </button>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block focus:outline-none group-hover:underline decoration-[#a82121] decoration-2 underline-offset-2 w-full pr-2"
          >
            <h4 className="text-sm font-semibold text-black dark:text-gray-100 font-serif leading-snug transition-colors line-clamp-3">
              {decodeHtmlEntities(article.title)}
            </h4>
          </a>
          {article.published_at && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
              {formatArticleTime(article.published_at)}
            </p>
          )}

          {/* Note Dropdown */}
          {isNoteOpen && (
            <div
              className="absolute top-6 right-0 w-[240px] bg-white dark:bg-gray-900 shadow-2xl rounded-xl border border-gray-200 dark:border-gray-700 p-3 z-40 transition-all cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs">
                  Brief Note
                </h4>
                <button
                  onClick={toggleNote}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-base leading-none"
                >
                  &times;
                </button>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Note on this brief..."
                className="w-full h-16 p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 mb-2 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex justify-between items-center h-6">
                <span className="text-[10px]">
                  {saveStatus === "success" && (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      Saved!
                    </span>
                  )}
                  {saveStatus === "error" && (
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      Failed.
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={toggleNote}
                    className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                    className="flex items-center justify-center min-w-[40px] px-2 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors shadow-sm"
                  >
                    {savingNote ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {resolvedImageUrl ? (
          <div className="w-16 h-16 shrink-0 bg-gray-100 dark:bg-gray-800 overflow-hidden border border-gray-200 dark:border-gray-800/50 rounded-sm group-hover:opacity-90 transition-all">
            <img
              src={resolvedImageUrl}
              alt={decodeHtmlEntities(article.title)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : resolvingImage ? (
          <div className="w-16 h-16 shrink-0 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-800/50 rounded-sm animate-pulse transition-colors"></div>
        ) : null}
      </article>
    );
  }

  return null;
}

export default function DailyBriefCard({ brief }: { brief: DailyBriefData }) {
  const categoryEntries = Object.entries(brief.categories || {});

  return (
    <div className="w-full min-h-screen px-2 md:px-6 pt-24 pb-12 bg-gray-100 dark:bg-[#121212] transition-colors">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-7xl mx-auto bg-white dark:bg-[#1a1a1a] border border-gray-300 dark:border-gray-800 shadow-md transition-colors"
      >
        <div className="p-6 md:p-10 border-b-4 border-black dark:border-gray-700 text-center transition-colors">
          <p className="text-xs md:text-sm font-bold text-[#a82121] tracking-[0.2em] uppercase">
            AI-Powered Daily Brief
          </p>
          <h2
            className="mt-3 text-4xl md:text-6xl font-extrabold text-black dark:text-gray-100 font-serif tracking-tight transition-colors"
            style={{ fontVariantLigatures: "common-ligatures" }}
          >
            The Daily Brief
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs md:text-sm text-gray-800 dark:text-gray-400 font-serif border-t border-b border-gray-300 dark:border-gray-700 py-2 transition-colors">
            <span className="font-semibold uppercase tracking-widest">
              {formatDisplayDate(brief.date)}
            </span>
            <span className="hidden md:inline px-2">|</span>
            <span className="flex items-center gap-1">
              <Sparkles size={14} className="text-[#a82121]" /> Top Stories That
              Matter
            </span>
            <span className="hidden md:inline px-2">|</span>
            <span>{formatUpdatedAt(brief.updated_at)}</span>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-12">
          {categoryEntries.map(([key, category]) => {
            const sources = brief.source_links?.[key] || [];
            const articles = brief.articles?.[key] || [];

            const displayCards =
              articles.length > 0
                ? articles
                : synthesizeArticlesFromBullets(
                    category.bullets,
                    sources,
                    category.title,
                  );

            if (displayCards.length === 0) return null;

            const heroArticle = displayCards[0];
            const stackArticles = displayCards.slice(1, 4);
            const sidebarArticles = displayCards.slice(4, 9);

            return (
              <section key={key} className="border-t-2 border-black pt-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl md:text-3xl font-black text-[#a82121] uppercase tracking-tight">
                    {category.title}
                  </h3>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                    {category.article_count ?? 0} Articles
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 md:divide-x md:divide-gray-300 gap-y-8 md:gap-y-0 gap-x-6">
                  {/* Hero Section (Cols 1-2) */}
                  <DailyBriefArticleItem article={heroArticle} variant="hero" />

                  {/* The Stack (Col 3) */}
                  <div className="md:col-span-1 md:pl-6 flex flex-col divide-y divide-gray-300">
                    {stackArticles.map((article, idx) => (
                      <DailyBriefArticleItem
                        key={`${key}-stack-${idx}`}
                        article={article}
                        variant={idx === 0 ? "stack-top" : "stack-normal"}
                      />
                    ))}
                  </div>

                  {/* The Sidebar (Col 4) */}
                  <div className="md:col-span-1 md:pl-6 flex flex-col">
                    <h5 className="text-xs font-black text-black uppercase tracking-widest border-b border-gray-300 pb-2 mb-4">
                      In Brief
                    </h5>
                    <div className="flex flex-col divide-y divide-gray-200">
                      {sidebarArticles.length > 0 ? (
                        sidebarArticles.map((article, idx) => (
                          <DailyBriefArticleItem
                            key={`${key}-sidebar-${idx}`}
                            article={article}
                            variant="sidebar"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 font-serif italic py-2">
                          No more articles for this section.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
