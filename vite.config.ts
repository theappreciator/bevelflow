import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// App version shown in the UI: package.json version + commit + build time.
// Cloudflare Pages provides CF_PAGES_COMMIT_SHA / CF_PAGES_BRANCH during builds;
// locally we ask git, and mark the build "-dirty" if there are uncommitted changes.
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const commit = (process.env.CF_PAGES_COMMIT_SHA ?? git("rev-parse HEAD")).slice(0, 7) || "unknown";
const branch = process.env.CF_PAGES_BRANCH ?? (git("rev-parse --abbrev-ref HEAD") || "unknown");
const dirty = !process.env.CF_PAGES && git("status --porcelain") !== "";

const appVersion = {
  version: pkg.version,
  commit: dirty ? `${commit}-dirty` : commit,
  branch,
  builtAt: new Date().toISOString(),
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    // `npm run dev:api` runs the Pages Functions API locally on 8788.
    proxy: { "/api": "http://localhost:8788" },
  },
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
        // Same for the API: always live data from the network.
        navigateFallbackDenylist: [/^\/cdn-cgi\//, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/cdn-cgi/") || url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
