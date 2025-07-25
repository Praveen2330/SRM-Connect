import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      nodePolyfills({
        // Whether to polyfill specific globals
        globals: {
          Buffer: true,
          global: true,
          process: true
        },
        // Whether to polyfill `node:` protocol imports
        protocolImports: true,
      }),
    ],
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
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        ...(mode === 'development' ? {
          '/socket.io': {
            target: 'http://localhost:3002',
            ws: true
          }
        } : {})
      }
    },
  }
});