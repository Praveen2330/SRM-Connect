import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  // For debugging
  console.log('Build mode:', mode);
  console.log('Environment variables:', Object.keys(env).filter(key => key.startsWith('VITE_')));
  
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
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
      sourcemap: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false, // Keep console.logs for debugging
        },
      },
    },
    server: {
      host: true,
      port: 3000,
      cors: true,
    },
  }
});