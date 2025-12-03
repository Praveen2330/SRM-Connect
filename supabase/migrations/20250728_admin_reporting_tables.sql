-- Migration: Create all missing admin/reporting/analytics tables for SRM-Connect
-- Created on 2025-07-28

-- 1. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    allow_new_registrations BOOLEAN DEFAULT TRUE,
    allowed_email_domains TEXT[],
    maintenance_mode BOOLEAN DEFAULT FALSE,
    maintenance_message TEXT,
    max_reports_before_auto_suspend INTEGER DEFAULT 3,
    max_reports_allowed_per_day INTEGER DEFAULT 5,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID
);

-- 2. user_reports (for both video and chat reports)
CREATE TABLE IF NOT EXISTS user_reports (
    id SERIAL PRIMARY KEY,
    reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending',
    report_type VARCHAR(20) DEFAULT 'video_chat', -- 'video_chat' or 'chat'
    reporter_email TEXT,
    extra JSONB
);

-- 3. system_announcements
CREATE TABLE IF NOT EXISTS system_announcements (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_users TEXT DEFAULT 'all',
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 4. user_statistics (for analytics dashboard)
CREATE TABLE IF NOT EXISTS user_statistics (
    id SERIAL PRIMARY KEY,
    total_users INTEGER DEFAULT 0,
    new_users_today INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. report_statistics (for analytics dashboard)
CREATE TABLE IF NOT EXISTS report_statistics (
    id SERIAL PRIMARY KEY,
    total_reports INTEGER DEFAULT 0,
    open_reports INTEGER DEFAULT 0,
    resolved_reports INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. video_sessions (for video chat logs)
CREATE TABLE IF NOT EXISTS video_sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    user1_id UUID REFERENCES profiles(id),
    user2_id UUID REFERENCES profiles(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    status VARCHAR(20) DEFAULT 'completed',
    transcript TEXT,
    report_id INTEGER REFERENCES user_reports(id)
);

-- 7. chat_messages (for chat monitoring)
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES profiles(id),
    recipient_id UUID REFERENCES profiles(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    flagged BOOLEAN DEFAULT FALSE,
    report_id INTEGER REFERENCES user_reports(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_session_id ON video_sessions(session_id);
