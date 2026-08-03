import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* dukascopy-node è una libreria Node con accesso al filesystem e
     dipendenze binarie: il bundler non deve provare a impacchettarla dentro
     la route del job. Resta esterna e viene richiesta a runtime. */
  serverExternalPackages: ["dukascopy-node"],
  experimental: {
    serverActions: {
      // Upload allegati (F16b): file fino a 4 MB + overhead multipart.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
