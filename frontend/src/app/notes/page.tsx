import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NoteItem from "@/components/NoteItem";

export default async function NotesDashboard() {
  const supabase = await createClient();

  // 1. Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2. Fetch the user's notes
  // We join with the articles table so we know which article the note belongs to!
  const { data: notes, error } = await supabase
    .from("notes")
    .select(`
      id,
      content,
      created_at,
      articles (
        id,
        title,
        url,
        image_url
      )
    `)
    .order("created_at", { ascending: false });

  // 3. Create a sign out action
  const signOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#171717] px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Notes</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Logged in as {user.email}</p>
          </div>
          <div className="flex gap-4">
            <Link 
              href="/"
              className="px-4 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Back to News
            </Link>
            <form action={signOut}>
              <button 
                type="submit"
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
              >
                Sign Out
              </button>
            </form>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md mb-8">
            Failed to load notes: {error.message}
          </div>
        )}

        {notes?.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No notes yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              You haven't added any notes to articles yet.
            </p>
            <Link 
              href="/"
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition inline-block"
            >
              Read some news
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {notes?.map((note: any) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}