-- Admin/Reporting Schema and Seed Fixes for SRM Connect
-- Regenerated: 2025-07-29 00:20 IST

-- 0. Ensure chat_sessions table exists for chat reporting
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user2_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);

-- 1. Ensure video_sessions table exists and is correct
CREATE TABLE IF NOT EXISTS public.video_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user2_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    signal_data jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user1_id ON public.video_sessions(user1_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user2_id ON public.video_sessions(user2_id);

-- 2. Ensure user_reports table exists and is correct
CREATE TABLE IF NOT EXISTS public.user_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    chat_session_id uuid REFERENCES chat_sessions(id),
    reported_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL,
    description text,
    transcript jsonb,
    status text NOT NULL DEFAULT 'pending',
    reviewed_by uuid REFERENCES admin_users(user_id),
    reviewed_at timestamptz,
    admin_notes text,
    action_taken text
);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id ON public.user_reports(reported_user_id);

-- 3. Ensure admin_users table exists and has required columns
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'viewer',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
    id serial PRIMARY KEY,
    setting_key text UNIQUE NOT NULL,
    setting_value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Ensure report_statistics table exists
CREATE TABLE IF NOT EXISTS public.report_statistics (
    id serial PRIMARY KEY,
    total_reports integer NOT NULL DEFAULT 0,
    resolved_reports integer NOT NULL DEFAULT 0,
    pending_reports integer NOT NULL DEFAULT 0,
    last_updated timestamptz NOT NULL DEFAULT now()
);

-- 6. Ensure chat_messages table exists (minimal for reporting)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content text,
    media_url text,
    type text DEFAULT 'text',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_session_id ON public.chat_messages(chat_session_id);

-- 7. Seed minimum admin user if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users) THEN
    INSERT INTO public.admin_users (user_id, role)
    SELECT id, 'super_admin' FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;
END $$;

-- 8. Seed minimum system setting if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_settings WHERE setting_key = 'platform') THEN
    INSERT INTO public.system_settings (setting_key, setting_value)
    VALUES ('platform', '{"maintenance_mode": false, "support_email": "support@srmconnect.com"}');
  END IF;
END $$;

-- 9. Seed minimum report_statistics row if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.report_statistics) THEN
    INSERT INTO public.report_statistics (total_reports, resolved_reports, pending_reports)
    VALUES (0, 0, 0);
  END IF;
END $$;

-- 10. Add missing columns to profiles for admin panel compatibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='status') THEN
    ALTER TABLE public.profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='display_name') THEN
    ALTER TABLE public.profiles ADD COLUMN display_name text;
  END IF;
END $$;


-- Ensure chat_sessions table exists for chat reporting
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user2_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);

-- 1. Ensure video_sessions table exists and is correct
CREATE TABLE IF NOT EXISTS public.video_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user2_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    signal_data jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user1_id ON public.video_sessions(user1_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_user2_id ON public.video_sessions(user2_id);

-- 2. Ensure user_reports table exists and is correct
CREATE TABLE IF NOT EXISTS public.user_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    chat_session_id uuid REFERENCES chat_sessions(id),
    reported_at timestamptz NOT NULL DEFAULT now(),
    reason text NOT NULL,
    description text,
    transcript jsonb,
    status text NOT NULL DEFAULT 'pending',
    reviewed_by uuid REFERENCES admin_users(user_id),
    reviewed_at timestamptz,
    admin_notes text,
    action_taken text
);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id ON public.user_reports(reported_user_id);

-- 3. Ensure admin_users table exists and has required columns
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'viewer',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS public.system_settings (
    id serial PRIMARY KEY,
    setting_key text UNIQUE NOT NULL,
    setting_value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Ensure report_statistics table exists
CREATE TABLE IF NOT EXISTS public.report_statistics (
    id serial PRIMARY KEY,
    total_reports integer NOT NULL DEFAULT 0,
    resolved_reports integer NOT NULL DEFAULT 0,
    pending_reports integer NOT NULL DEFAULT 0,
    last_updated timestamptz NOT NULL DEFAULT now()
);

-- 6. Ensure chat_messages table exists (minimal for reporting)
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id uuid NOT NULL,
    sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content text,
    media_url text,
    type text DEFAULT 'text',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_session_id ON public.chat_messages(chat_session_id);

-- 7. Seed minimum admin user if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users) THEN
    INSERT INTO public.admin_users (user_id, role)
    SELECT id, 'super_admin' FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  END IF;
END $$;

-- 8. Seed minimum system setting if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.system_settings WHERE setting_key = 'platform') THEN
    INSERT INTO public.system_settings (setting_key, setting_value)
    VALUES ('platform', '{"maintenance_mode": false, "support_email": "support@srmconnect.com"}');
  END IF;
END $$;

-- 9. Seed minimum report_statistics row if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.report_statistics) THEN
    INSERT INTO public.report_statistics (total_reports, resolved_reports, pending_reports)
    VALUES (0, 0, 0);
  END IF;
END $$;

-- 10. Add missing columns to profiles for admin panel compatibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='status') THEN
    ALTER TABLE public.profiles ADD COLUMN status text NOT NULL DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='display_name') THEN
    ALTER TABLE public.profiles ADD COLUMN display_name text;
  END IF;
END $$;
