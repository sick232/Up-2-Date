"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Trash2, Edit2, Loader2, X, Check } from "lucide-react";

export default function NoteItem({ note }: { note: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteContent, setNoteContent] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleUpdate = async () => {
    if (!noteContent.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from("notes").update({ content: noteContent }).eq("id", note.id);
    if (!error) {
      setIsEditing(false);
      router.refresh();
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;
    setIsDeleting(true);
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (!error) {
      router.refresh();
    } else {
      setIsDeleting(false);
    }
  };

  if (isDeleting) {
    return <div className="hidden"></div>; // hide optimistically
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
      {note.articles?.image_url && (
        <img 
          src={note.articles.image_url} 
          alt={note.articles.title}
          className="w-full h-32 object-cover"
        />
      )}
      <div className="p-5 flex-1 flex flex-col">
        <a 
          href={note.articles?.url || "#"} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mb-2 line-clamp-2"
        >
          {note.articles?.title || "Unknown Article"}
        </a>

        {isEditing ? (
          <div className="flex-1 flex flex-col gap-2">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full h-full min-h-[100px] p-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-1">
              <button 
                onClick={() => { setIsEditing(false); setNoteContent(note.content); }} 
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-md transition"
              >
                <X size={16} /> Cancel
              </button>
              <button 
                onClick={handleUpdate} 
                disabled={isSaving} 
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md transition"
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-700 dark:text-gray-300 flex-1 whitespace-pre-wrap">
            {note.content}
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs text-gray-500 dark:text-gray-500">
          <span>{new Date(note.created_at).toLocaleDateString()}</span>
          {!isEditing && (
            <div className="flex gap-4">
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition" title="Edit Note">
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={handleDelete} className="flex items-center gap-1 hover:text-red-600 dark:hover:text-red-400 transition" title="Delete Note">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}