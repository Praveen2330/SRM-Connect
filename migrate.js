const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Read and execute the migration files
    const migrationDir = path.join(__dirname, 'supabase', 'migrations');
    const files = await fs.readdir(migrationDir);
    
    // Sort files to ensure correct order
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
      await pool.query(sql);
      console.log(`Completed migration: ${file}`);
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigrations(); 