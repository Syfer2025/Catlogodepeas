import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    // Remove restrictive CSP in dev mode so Vite HMR websocket works
    {
      name: 'dev-remove-csp',
      transformIndexHtml(html, ctx) {
        if (ctx.server) {
          return html.replace(
            /<meta http-equiv="Content-Security-Policy"[^>]*>/,
            '<!-- CSP disabled in dev mode for HMR -->'
          );
        }
        return html;
      },
    },
    // Bundle analysis — generates stats.html after `vite build`
    // Open stats.html in browser to see chunk sizes and dependencies
    visualizer({
      filename: 'stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    // Generate source maps for production builds — helps debug errors in
    // production and eliminates the "Missing source maps" Lighthouse warning.
    // Using 'hidden' to avoid exposing .map files to end users via devtools
    // sourceMappingURL comment, while still making them available for error
    // tracking services (Sentry, LogRocket, etc.).
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        manualChunks: function manualChunks(id) {
          // Only split node_modules
          if (!id.includes('node_modules')) return undefined;

          // 1. Core React runtime — changes rarely
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }

          // 2. React Router — changes rarely
          if (id.includes('/react-router/')) {
            return 'vendor-router';
          }

          // 3. Recharts + D3 — heavy, only used by AdminDashboard
          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/') ||
            id.includes('/decimal.js-light/')
          ) {
            return 'vendor-recharts';
          }

          // 4. Radix UI primitives — many small packages, group them
          if (id.includes('/@radix-ui/')) {
            return 'vendor-radix';
          }

          // 5. Supabase client
          if (
            id.includes('/@supabase/') ||
            id.includes('/supabase-js/')
          ) {
            return 'vendor-supabase';
          }

          // 6. Animation (motion/framer-motion)
          if (id.includes('/motion/')) {
            return 'vendor-motion';
          }

          // 7. Date utilities
          if (id.includes('/date-fns/')) {
            return 'vendor-date';
          }

          // Lucide icons are NOT grouped into a single chunk.
          // Instead, they are distributed naturally into each page's chunk
          // so admin-only icons don't load on public pages.
        },
      },
    },
  },
})