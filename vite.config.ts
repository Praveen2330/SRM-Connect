import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: '/',
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
      'process.env': env,
      global: 'globalThis',
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
      sourcemap: true,
    },
    server: {
      host: true,
      port: 3000,
    },
  }
});