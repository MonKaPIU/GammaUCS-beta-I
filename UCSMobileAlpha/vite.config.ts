import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.ico",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "icons/maskable-512.png",
      ],
      manifest: {
        name: "UCS Mobile Alpha",
        short_name: "UCS Mobile",
        description: "Pump It Up UCS 모바일 편집기",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webp,mp3,wav,ogg,m4a,webm}"
        ],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "ucs-images"
            }
          },
          {
            urlPattern: ({ request }) => request.destination === "audio",
            handler: "CacheFirst",
            options: {
              cacheName: "ucs-audio"
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});