-- Create a table for user reports in the video chat application
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id),
  reported_user_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Prevent duplicate reports in a short time period
  CONSTRAINT unique_report_within_timeframe UNIQUE (reporter_id, reported_user_id, (DATE_TRUNC('day', reported_at)))
);

-- Create index on status to quickly find pending reports
CREATE INDEX idx_user_reports_status ON user_reports(status);

-- Row Level Security policies
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Users can only view their own reports
CREATE POLICY "Users can view their own reports" 
  ON user_reports 
  FOR SELECT 
  USING (auth.uid() = reporter_id);

-- Users can only create reports for other users, not themselves
CREATE POLICY "Users can create reports" 
  ON user_reports 
  FOR INSERT 
  WITH CHECK (auth.uid() = reporter_id AND auth.uid() != reported_user_id);

-- Only admins can update reports
CREATE POLICY "Only admins can update reports" 
  ON user_reports 
  FOR UPDATE 
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- Trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_reports_updated_at
BEFORE UPDATE ON user_reports
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
