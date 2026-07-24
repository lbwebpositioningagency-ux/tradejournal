import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Upload allegati (F16b): file fino a 4 MB + overhead multipart.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
