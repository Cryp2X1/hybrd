import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project sites live under /<repo>/. Override with VITE_BASE=/other-name/ when building.
const base = process.env.VITE_BASE || '/hybrd/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'HYBRD — Hybrid Athlete Training',
        short_name: 'HYBRD',
        description: 'Train, track, fuel. Calisthenics, running, cycling, HYROX and hybrid training with GPS, timers, nutrition and a Hybrid Score.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['*.{html,js,css}', 'assets/**/*.{js,css,woff2}', 'icons/*.png', 'data/*.json', 'manifest.webmanifest'],
        globIgnores: ['config.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /config\.js$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'hybrd-config', networkTimeoutSeconds: 3 },
          },
          {
            // Record map: OpenFreeMap style JSON, vector tiles, fonts and sprites (keyless, OSM data)
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ofm-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Record map satellite: EOX Sentinel-2 cloudless 2016 + USGS imagery
            urlPattern: /^https:\/\/(tiles\.maps\.eox\.at|basemap\.nationalmap\.gov)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sat-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    // MapLibre (~1 MB min, ~280 KB gzip) is its own lazy chunk, loaded only by the Record map
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // The MapLibre worker ships as .mjs; give it a .js name so every static host serves it as JavaScript.
      output: { assetFileNames: (a) => (/\.mjs$/.test(a.names?.[0] || a.name || '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]') },
    },
  },
});
