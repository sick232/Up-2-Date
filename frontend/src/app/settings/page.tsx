"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, ArrowLeft, LogOut, User } from "lucide-react";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api").replace(/\/$/, "");
const api = axios.create({ baseURL: API_BASE_URL });

const CATEGORIES = [
  "Technology", "International", "India", "Business", "Sports",
  "Science", "Startups", "Entertainment", "Travel", "Automobile",
  "Hatke", "Fashion", "Politics", "Education", "Miscellaneous"
];

export default function SettingsPage() {
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [savingInterests, setSavingInterests] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "hi">("en");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();
  
  // Using the same mock ID approach from page.tsx for the python backend api
  const mockUserId = "42a3a8e9-d12c-4740-8b1d-df2cf5ac5b3b";

  useEffect(() => {
    // 1. Fetch User Session from Supabase
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
      } else {
        router.push("/login");
      }
    };
    getUser();

    // 2. Fetch Language Cookie
    const match = document.cookie.match(/googtrans=\/en\/([^;]+)/);
    if (match && match[1] === "hi") {
      setSelectedLanguage("hi");
    }
    
    // 3. Fetch Interests from Backend
    const fetchInterests = async () => {
      try {
        const response = await api.get("/profiles/interests", {
          headers: { "user-id": mockUserId } 
        });
        setUserInterests(response.data.interests || []);
      } catch (error) {
        console.error("Error fetching interests:", error);
      }
    };
    fetchInterests();
  }, [router, supabase]);

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
    
    const select = document.querySelector(".goog-te-combo") as HTMLSelectElement | null;
    if (select) {
      select.value = lang;
      select.dispatchEvent(new Event("change"));
    } else {
      window.location.reload();
    }
  };

  const toggleInterest = (category: string) => {
    setUserInterests((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const saveInterests = async () => {
    setSavingInterests(true);
    try {
      await api.put(
        "/profiles/interests",
        { interests: userInterests },
        { headers: { "user-id": mockUserId } }
      );
      router.push("/?tab=foryou"); // Optionally load foryou tab
    } catch (error) {
      console.error("Error saving interests:", error);
    } finally {
      setSavingInterests(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#121212] flex flex-col transition-colors">
      <header className="pt-8 pb-4 px-6 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition">
              <ArrowLeft size={24} />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          </div>
          <button
            onClick={saveInterests}
            disabled={savingInterests}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full transition-colors disabled:opacity-50 font-medium shadow-sm"
          >
            {savingInterests ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto p-6 pb-24">
        
        {/* Account Section */}
        <section className="mb-10 p-6 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
              <User size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Account</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage your session details.</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Logged in as</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{userEmail || "Loading..."}</p>
            </div>
            <button 
              onClick={handleSignOut}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition font-medium"
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </section>

        {/* Language Preference Section */}
        <section className="mb-10 p-6 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Your Preferred Language</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Choose your preferred language for news summaries.</p>
          
          <div className="flex gap-4">
            <button
              onClick={() => handleLanguageChange("en")}
              className={`flex-1 py-3 px-4 rounded-xl border-2 font-medium transition-colors ${
                selectedLanguage === "en"
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200"
                  : "border-gray-300 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700"
              }`}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange("hi")}
              className={`flex-1 py-3 px-4 rounded-xl border-2 font-medium transition-colors ${
                selectedLanguage === "hi"
                  ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200"
                  : "border-gray-300 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700"
              }`}
            >
              हिंदी (Hindi)
            </button>
          </div>
        </section>

        {/* Topic Preference Section */}
        <section className="p-6 bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800">
          <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Your Preferred Topics</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Select topics to personalize your feed.</p>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((category) => {
              const isSelected = userInterests.includes(category);
              return (
                <div
                  key={category}
                  onClick={() => toggleInterest(category)}
                  className={`flex justify-center items-center p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200"
                      : "border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-200 hover:border-blue-300 dark:hover:border-blue-700"
                  }`}
                >
                  <span className="text-sm font-semibold">{category}</span>
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}