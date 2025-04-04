/*
  # Add exec_sql function for migrations

  1. Changes
    - Create a function to execute SQL statements
    - Grant necessary permissions
*/

-- Create the function to execute SQL
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void AS $$
BEGIN
  EXECUTE sql;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated; 