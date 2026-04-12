"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { api, fetcher } from "@/utils/fetcher";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import NewsCard, { Article } from "@/components/NewsCard";
import DailyBriefCard, { DailyBriefData } from "@/components/DailyBriefCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Settings, Save, RefreshCw, Star, Edit3 } from "lucide-react";


const CATEGORIES = [
  "Technology",
  "International",
  "India",
  "Business",
  "Sports",
  "Science",
  "Startups",
  "Entertainment",
  "Travel",
  "Automobile",
  "Hatke",
  "Fashion",
  "Politics",
  "Education",
  "Miscellaneous",
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("trending");
  
  const [savingInterests, setSavingInterests] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "hi">("en");

  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setUserId(user.id);
      } catch (e) {
        console.error(e);
      } finally {
        setIsAuthLoaded(true);
      }
    };
    fetchUser();
  }, []);

  // Fetch current tab data
  const endpoint =
    activeTab === "dailybrief" ? "/daily-brief" :
    activeTab === "bookmarks" ? "/bookmarks" :
    activeTab === "interests" ? "/profiles/interests" :
    `/news/${activeTab === "trending" ? "trending" : activeTab === "foryou" ? "foryou" : `category/${activeTab}`}`;

  const fetcherWithAuth = ([url, uid]: [string, string | null]) =>
    api.get(url, { headers: { "user-id": uid || "" } }).then((res) => res.data);

  const { data, error, isLoading, mutate } = useSWR(
    isAuthLoaded ? [endpoint, userId] : null,
    fetcherWithAuth
  );

  // Fetch bookmarks globally so we can optimistic update across tabs
  const { data: bookmarksData, mutate: mutateBookmarks } = useSWR<Article[]>(
    isAuthLoaded ? ["/bookmarks", userId] : null,
    fetcherWithAuth
  );

  // Map fetched data to rendering variables
  const loading = !isAuthLoaded || isLoading;
  const articles: Article[] = (activeTab !== "dailybrief" && activeTab !== "interests" && data) ? data : [];
  const dailyBrief: DailyBriefData | null = activeTab === "dailybrief" && data ? data : null;
  const userInterests: string[] = activeTab === "interests" && data?.interests ? data.interests : [];
  const bookmarkedIds = new Set((bookmarksData || []).map((a) => a.id));

  useEffect(() => {
    const match = document.cookie.match(/googtrans=\/en\/([^;]+)/);
    if (match && match[1] === "hi") {
      setSelectedLanguage("hi");
    }
  }, []);

  const handleLanguageChange = (lang: "en" | "hi") => {
    setSelectedLanguage(lang);
    const domain = window.location.hostname;
    if (lang === "en") {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
    } else {
      document.cookie = `googtrans=/en/${lang}; path=/;`;
      document.cookie = `googtrans=/en/${lang}; path=/; domain=${domain}`;
    }

    const select = document.querySelector(
      ".goog-te-combo",
    ) as HTMLSelectElement | null;
    if (select) {
      select.value = lang;
      select.dispatchEvent(new Event("change"));
    } else {
      window.location.reload();
    }
  };

    // 🔹 Toggle Bookmark (with optimistic SWR mutate)
  const toggleBookmark = async (article: Article) => {
    if (!bookmarksData) return;
    const articleId = article.id;
    const isCurrentlyBookmarked = bookmarkedIds.has(articleId);
    
    // Optimistically update
    const newBookmarks = isCurrentlyBookmarked
      ? bookmarksData.filter((a: Article) => a.id !== articleId)
      : [...bookmarksData, article];
      
    mutateBookmarks(newBookmarks, false);

    try {
      await api.post(
        "/bookmarks",
        { article_id: articleId, article },
        { headers: { "user-id": userId || "" } },
      );
      // Revalidate
      mutateBookmarks();
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      // Rollback
      mutateBookmarks(bookmarksData, false);
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  // 🔹 Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([mutate(), mutateBookmarks()]);
    // Small artificial delay to ensure the user gets visual feedback even on fast connections
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <main className="h-[100dvh] w-full bg-gray-50 dark:bg-[#121212] flex flex-col relative overflow-hidden transition-colors">
      {/* 🔹 Navbar */}
      <nav className="absolute top-0 w-full pt-8 pb-4 px-6 flex justify-between items-center z-50 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="flex gap-6 overflow-x-auto whitespace-nowrap no-scrollbar w-full pr-4">
          {[
            "trending",
            "dailybrief",
            "Technology",
            "Indian Defence",
            "Indian Economy",
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`font-semibold tracking-wide transition-all shrink-0 pb-1 ${
                activeTab === tab
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {tab === "trending"
                ? "Trending"
                : tab === "dailybrief"
                  ? "Daily Brief"
                  : tab}
              {tab === "dailybrief" && (
                <span className="ml-1 inline-flex align-middle">
                  <Star
                    size={12}
                    className={
                      activeTab === tab
                        ? "fill-blue-600 dark:fill-blue-400"
                        : "fill-current"
                    }
                  />
                </span>
              )}
            </button>
          ))}
          <Link

            href="/saved"
            className="font-semibold tracking-wide transition-all shrink-0 pb-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            Saved
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/notes"
            className="hidden sm:flex items-center gap-2 mr-2 px-4 py-2 shrink-0 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-semibold text-sm whitespace-nowrap"
            title="My Notes"
          >
            <Edit3 size={16} /> My Notes
          </Link>
          <Link
            href="/notes"
            className="sm:hidden p-2 shrink-0 rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            title="My Notes"
          >
            <Edit3 size={20} />
          </Link>

          <ThemeToggle />
          <button
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="p-2 shrink-0 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={20} className={loading || isRefreshing ? "animate-spin" : ""} />
          </button>
          <Link
            href="/settings"
            className="p-2 shrink-0 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </Link>
        </div>
      </nav>

      {/* 🔹 Content */}
      <div className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth bg-white dark:bg-[#121212] transition-colors">
        {loading ? (
          <div className="h-full flex items-center justify-center flex-col text-gray-500 dark:text-gray-400">
            <Loader2 className="animate-spin mb-4" size={40} />
            <p>Loading...</p>
          </div>
        ) : activeTab === "dailybrief" ? (
          dailyBrief ? (
            <DailyBriefCard brief={dailyBrief} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 text-center pt-24 px-6 transition-colors">
              <p>No daily brief available right now.</p>
            </div>
          )
        ) : articles.length > 0 ? (
          articles.map((article) => (
            <NewsCard
              key={article.id}
              article={article}
              isBookmarked={
                bookmarkedIds.has(article.id) || activeTab === "bookmarks"
              }
              onBookmarkToggle={toggleBookmark}
            />
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 text-center pt-24 px-6 transition-colors">
            {activeTab === "bookmarks" ? (
              "You haven't saved any articles yet."
            ) : activeTab === "foryou" ? (
              <>
                <Settings
                  size={48}
                  className="mb-4 text-gray-300 dark:text-gray-600"
                />
                <p>No personalized news found.</p>
                <button
                  onClick={() => setActiveTab("interests")}
                  className="mt-6 px-6 py-2 bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white rounded-full transition-colors"
                >
                  Choose Interests
                </button>
              </>
            ) : (
              "No news available right now."
            )}
          </div>
        )}
      </div>
    </main>
  );
}
