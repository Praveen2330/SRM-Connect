-- Ensure all reporting and analytics tables/columns exist and are correct
DO $$
BEGIN
  -- report_statistics table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'report_statistics'
  ) THEN
    CREATE TABLE public.report_statistics (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      total_reports integer DEFAULT 0,
      pending_reports integer DEFAULT 0,
      resolved_reports integer DEFAULT 0,
      last_updated timestamp DEFAULT NOW()
    );
  END IF;

  -- video_sessions table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'video_sessions'
  ) THEN
    CREATE TABLE public.video_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user1_id uuid REFERENCES public.profiles(id),
      user2_id uuid REFERENCES public.profiles(id),
      started_at timestamp DEFAULT NOW(),
      ended_at timestamp,
      duration integer,
      status text DEFAULT 'active'
    );
  END IF;

  -- user_reports table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'user_reports'
  ) THEN
    CREATE TABLE public.user_reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id uuid REFERENCES public.profiles(id),
      reported_user_id uuid REFERENCES public.profiles(id),
      chat_session_id uuid,
      reported_at timestamp DEFAULT NOW(),
      reason text,
      status text DEFAULT 'pending'
    );
  END IF;

  -- Add missing columns if not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reports' AND column_name = 'reported_at'
  ) THEN
    ALTER TABLE public.user_reports ADD COLUMN reported_at timestamp DEFAULT NOW();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'user_reports' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.user_reports ADD COLUMN status text DEFAULT 'pending';
  END IF;

  -- Seed minimal data for testing
  IF NOT EXISTS (
    SELECT 1 FROM public.report_statistics
  ) THEN
    INSERT INTO public.report_statistics (total_reports, pending_reports, resolved_reports)
    VALUES (1, 1, 0);
  END IF;
END $$;
