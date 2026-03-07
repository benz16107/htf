import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      { source: "/dashboard/settings", destination: "/dashboard/logs?settings=1", permanent: true },
      { source: "/dashboard/settings/autonomous", destination: "/dashboard/logs?settings=1", permanent: true },
      { source: "/dashboard/autonomous", destination: "/dashboard/logs?settings=1", permanent: true },
    ];
  },
};

export default nextConfig;
