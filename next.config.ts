import type { NextConfig } from "next";

/**
 * Security header applicati a ogni risposta (SECURITY_AUDIT P1-4a).
 *
 * HSTS NON è qui: su *.vercel.app lo aggiunge già la piattaforma
 * (`max-age=63072000; includeSubDomains; preload`, verificato in produzione).
 * Riscriverlo a mano rischierebbe solo di indebolirlo.
 *
 * La CSP è deliberatamente FUORI da questo blocco: Next inietta script inline
 * e una CSP scritta di fretta rompe la pagina invece di proteggerla. Va
 * introdotta a parte, prima in report-only.
 */
const SECURITY_HEADERS = [
  // L'app non va mai incorniciata: niente clickjacking sui pulsanti di
  // eliminazione trade.
  { key: "X-Frame-Options", value: "DENY" },
  // Il browser deve rispettare il Content-Type dichiarato e non indovinarlo
  // dal contenuto: è la difesa che rende innocuo un allegato con MIME
  // mentito (vedi P1-6).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Verso siti esterni non esce nulla; entro l'app l'URL completo serve alla
  // navigazione (gli id trade stanno nel path).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Un diario di trading non usa nessuna di queste API: negarle tutte
  // riduce la superficie se un giorno finisse in pagina codice di terzi.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  /* dukascopy-node è una libreria Node con accesso al filesystem e
     dipendenze binarie: il bundler non deve provare a impacchettarla dentro
     la route del job. Resta esterna e viene richiesta a runtime. */
  serverExternalPackages: ["dukascopy-node"],
  // Nessun motivo di annunciare il framework a chi cerca bersagli per versione.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Upload allegati (F16b): file fino a 4 MB + overhead multipart.
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
