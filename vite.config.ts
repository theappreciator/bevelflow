import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      // The site sits behind Cloudflare Access. A manifest fetched without
      // cookies gets redirected to the Access login and the app can't install,
      // so the manifest link must send credentials.
      useCredentials: true,
      pwaAssets: { config: true },
      manifest: {
        name: "Bevelflow",
        short_name: "Bevelflow",
        description: "Bevelflow",
        theme_color: "#1f2937",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // Never serve the cached app shell for Cloudflare Access routes
        // (login, logout, auth callback); they must reach the network.
        navigateFallbackDenylist: [/^\/cdn-cgi\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/cdn-cgi/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
