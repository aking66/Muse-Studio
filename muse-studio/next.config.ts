import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages (file: deps); webpack bundler resolves these reliably on all platforms.
  transpilePackages: ["@muse/plugin-sdk", "@muse/plugin-host"],
  // Tell Next.js not to bundle these native modules — they run server-side only
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
