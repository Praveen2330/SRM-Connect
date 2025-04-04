import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Polyfills for Node.js built-ins
      stream: 'stream-browserify',
      crypto: 'crypto-browserify',
      util: 'util/',
      process: 'process/browser',
      buffer: 'buffer/',
      global: resolve(__dirname, './src/global.js'),
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  }
});