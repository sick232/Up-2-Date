"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import NewsCard, { Article } from "@/components/NewsCard";
import DailyBriefCard, { DailyBriefData } from "@/components/DailyBriefCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Settings, Save, RefreshCw, Star, Edit3 } from "lucide-react";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"
).replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
});

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
  const [articles, setArticles] = useState<Article[]>([]);
  const [dailyBrief, setDailyBrief] = useState<DailyBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("bookmarks");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [savingInterests, setSavingInterests] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "hi">("en");

  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
      setIsAuthLoaded(true);
    };
    fetchUser();
  }, []);

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

  // 🔹 Fetch News
  const fetchNews = async (endpoint: string) => {
    setLoading(true);
    setDailyBrief(null);
    try {
      const url = `/news/${endpoint}`;
      const response = await api.get<Article[]>(url, {
        headers: { "user-id": userId || "" },
      });
      setArticles(response.data);
    } catch (error) {
      console.error("Error fetching news:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Fetch Bookmarks
  const fetchBookmarks = async () => {
    setLoading(true);
    setDailyBrief(null);
    try {
      const response = await api.get<Article[]>("/bookmarks", {
        headers: { "user-id": userId || "" },
      });

      setArticles(response.data);
      const ids = new Set(response.data.map((b) => b.id));
      setBookmarkedIds(ids);
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Fetch Interests
  const fetchInterests = async () => {
    setLoading(true);
    setDailyBrief(null);
    try {
      const response = await api.get("/profiles/interests", {
        headers: { "user-id": userId || "" },
      });
      setUserInterests(response.data.interests || []);
    } catch (error) {
      console.error("Error fetching interests:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Save Interests
  const saveInterests = async () => {
    setSavingInterests(true);
    try {
      await api.put(
        "/profiles/interests",
        { interests: userInterests },
        { headers: { "user-id": userId || "" } },
      );
      setActiveTab("foryou");
    } catch (error) {
      console.error("Error saving interests:", error);
    } finally {
      setSavingInterests(false);
    }
  };

  const fetchDailyBrief = async () => {
    setLoading(true);
    setArticles([]);
    try {
      const response = await api.get<DailyBriefData>("/daily-brief", {
        headers: { "user-id": userId || "" },
      });
      setDailyBrief(response.data);
    } catch (error) {
      console.error("Error fetching daily brief:", error);
      setDailyBrief(null);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Toggle Interest (SAFE)
  const toggleInterest = (category: string) => {
    setUserInterests((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  // 🔹 Toggle Bookmark (with rollback)
  const toggleBookmark = async (article: Article) => {
    const articleId = article.id;
    const prev = new Set(bookmarkedIds);
    const updated = new Set(prev);

    if (updated.has(articleId)) updated.delete(articleId);
    else updated.add(articleId);

    setBookmarkedIds(updated);

    try {
      await api.post(
        "/bookmarks",
        { article_id: articleId, article },
        { headers: { "user-id": userId || "" } },
      );

      if (activeTab === "bookmarks" && !updated.has(articleId)) {
        setArticles((prevArticles) =>
          prevArticles.filter((a) => a.id !== articleId),
        );
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      setBookmarkedIds(prev); // rollback
    }
  };

  // 🔹 Manual Refresh
  const handleRefresh = () => {
    if (activeTab === "trending") fetchNews("trending");
    else if (activeTab === "dailybrief") fetchDailyBrief();
    else if (activeTab === "foryou") fetchNews("foryou");
    else if (activeTab === "bookmarks") fetchBookmarks();
    else if (activeTab === "interests") fetchInterests();
    else fetchNews(`category/${activeTab}`);
  };

  // 🔹 Tab Effect
  useEffect(() => {
    if (!isAuthLoaded) return;

    if (activeTab === "trending") fetchNews("trending");
    else if (activeTab === "dailybrief") fetchDailyBrief();
    else if (activeTab === "foryou") fetchNews("foryou");
    else if (activeTab === "bookmarks") fetchBookmarks();
    else if (activeTab === "interests") fetchInterests();
    else fetchNews(`category/${activeTab}`);
  }, [activeTab, isAuthLoaded, userId]);

  return (
    <main className="h-[100dvh] w-full bg-gray-50 dark:bg-[#121212] flex flex-col relative overflow-hidden transition-colors">
      {/* 🔹 Navbar */}
      <nav className="absolute top-0 w-full pt-8 pb-4 px-6 flex justify-between items-center z-50 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="flex gap-6 overflow-x-auto whitespace-nowrap no-scrollbar w-full pr-4">
          {[
            { id: "trending", label: "Trending", href: "/" },
            { id: "dailybrief", label: "Daily Brief", href: "/" },
            { id: "Technology", label: "Technology", href: "/" },
            { id: "Indian Defence", label: "Indian Defence", href: "/" },
            { id: "Indian Economy", label: "Indian Economy", href: "/" },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`font-semibold tracking-wide transition-all shrink-0 pb-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100`}
            >
              {tab.label}
            </Link>
          ))}

          <button className="font-semibold tracking-wide transition-all shrink-0 pb-1 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400">
            Saved
          </button>
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
            disabled={loading}
            className="p-2 shrink-0 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
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
