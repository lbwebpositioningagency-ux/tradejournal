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

/**
 * Rotte tolte che cadrebbero in un segmento dinamico, e per questo non
 * darebbero un 404 vero.
 *
 * `/macro-desk/trends` (uscita il 14/09/2026) combacia con `/macro-desk/[id]`:
 * la pagina del report chiama `notFound()`, ma dentro lo streaming aperto da
 * `(app)/loading.tsx` lo stato 200 è già partito e non si cambia più — chi
 * aveva il vecchio indirizzo vedeva la pagina 404 con uno stato 200. Riscritte
 * PRIMA del routing verso un percorso che nessuna rotta serve, rispondono 404
 * davvero, senza rendere niente.
 */
const ROTTE_RIMOSSE = ["/macro-desk/trends"];

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
  async rewrites() {
    return {
      beforeFiles: ROTTE_RIMOSSE.map((rotta) => ({
        source: `${rotta}/:resto*`,
        // Cartella privata (`_`): nessuna rotta la serve, quindi è un 404.
        destination: "/_rotta-rimossa",
      })),
    };
  },
};

export default nextConfig;
