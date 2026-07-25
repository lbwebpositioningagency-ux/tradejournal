/**
 * F39 — rate limiting delle azioni di autenticazione.
 *
 * Sliding window in memoria di processo: zero dipendenze esterne (regola del
 * piano). Limite NOTO: su serverless ogni istanza ha la sua memoria, quindi il
 * tetto effettivo è per-istanza — comunque un freno reale al brute force
 * seriale, e sull'istanza singola (dev/self-hosted) è esatto.
 */

interface Bucket {
  /** Timestamp (ms) dei tentativi dentro la finestra. */
  attempts: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Tentativi ammessi nella finestra. */
  max: number;
  windowMs: number;
  /** Iniettabile nei test. */
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Secondi da attendere prima del prossimo tentativo (0 se ammesso). */
  retryAfterSec: number;
}

/**
 * Registra un tentativo per `key` e dice se è ammesso. I tentativi oltre il
 * limite NON vengono registrati (non allungano la punizione da soli).
 */
export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = options.now ?? Date.now();
  const windowStart = now - options.windowMs;

  const bucket = buckets.get(key) ?? { attempts: [] };
  bucket.attempts = bucket.attempts.filter((t) => t > windowStart);

  if (bucket.attempts.length >= options.max) {
    const oldest = bucket.attempts[0];
    buckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
    };
  }

  bucket.attempts.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

/** Azzera il contatore (login riuscito: i tentativi legittimi non pesano). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Solo per i test. */
export function clearAllRateLimits(): void {
  buckets.clear();
}

/** Preset condivisi: un posto solo per le soglie. */
export const AUTH_LIMITS = {
  /** Login: 10 tentativi per email ogni 15 minuti. */
  login: { max: 10, windowMs: 15 * 60 * 1000 },
  /** Registrazione: 5 per email ogni 15 minuti. */
  register: { max: 5, windowMs: 15 * 60 * 1000 },
  /** Cambio password: 5 per utente ogni 15 minuti. */
  changePassword: { max: 5, windowMs: 15 * 60 * 1000 },
} as const;
