// Simple build helper for Vercel
import { execSync } from 'child_process';
import fs from 'fs';

// Log environment for debugging
console.log('Node version:', process.version);
console.log('Environment variables:', Object.keys(process.env).filter(key => key.startsWith('VITE_')));

try {
  // Run TypeScript compiler
  console.log('Running TypeScript compiler...');
  execSync('npx tsc', { stdio: 'inherit' });
  
  // Run Vite build
  console.log('Running Vite build...');
  execSync('npx vite build', { stdio: 'inherit' });
  
  // Verify build output
  console.log('Verifying build output...');
  if (fs.existsSync('./dist') && fs.existsSync('./dist/index.html')) {
    console.log('Build completed successfully!');
    process.exit(0);
  } else {
    console.error('Build directory or index.html not found!');
    process.exit(1);
  }
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
} 