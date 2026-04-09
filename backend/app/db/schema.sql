-- Create users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    interests TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create articles table
CREATE TABLE public.articles (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    hash TEXT UNIQUE NOT NULL, -- To deduplicate articles
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT NOT NULL,
    image_url TEXT,
    category TEXT,
    source TEXT,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'articles'
          AND column_name = 'image_url'
    ) THEN
        ALTER TABLE public.articles ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- Create bookmarks table
CREATE TABLE public.bookmarks (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, article_id)
);

-- Create daily briefs table (one generated brief per day)
CREATE TABLE IF NOT EXISTS public.daily_briefs (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    brief_date DATE UNIQUE NOT NULL,
    categories JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    articles JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_briefs_brief_date ON public.daily_briefs(brief_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Articles: Anyone can read articles (anonymous or authenticated)
CREATE POLICY "Anyone can view articles" 
    ON public.articles FOR SELECT 
    USING (true);

-- (Backend API will need the service role key to insert articles, which bypasses RLS)

-- Bookmarks: Users can only manage their own bookmarks
CREATE POLICY "Users can view own bookmarks" 
    ON public.bookmarks FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks" 
    ON public.bookmarks FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks" 
    ON public.bookmarks FOR DELETE 
    USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view daily briefs"
    ON public.daily_briefs FOR SELECT
    USING (true);

-- Create notes table for users to add notes to articles
CREATE TABLE public.notes (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" 
    ON public.notes FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes" 
    ON public.notes FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes" 
    ON public.notes FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes" 
    ON public.notes FOR DELETE 
    USING (auth.uid() = user_id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id);
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
