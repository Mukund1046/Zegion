import type { NextConfig } from "next";

const isDesktopBuild = process.env.ZEGION_DESKTOP_BUILD === "1";

const nextConfig: NextConfig = {
  // Keep the normal web build/start workflow unchanged. The desktop release
  // pipeline opts into standalone output only for its own packaging build.
  ...(isDesktopBuild ? { output: "standalone" as const } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
