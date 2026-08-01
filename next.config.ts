import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // Receipt uploads arrive as multipart bodies; the default 1 MB action
    // limit is too small even after client-side downscaling.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default config;
