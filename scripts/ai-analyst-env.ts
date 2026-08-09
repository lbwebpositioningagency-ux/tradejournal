/**
 * Caricamento dell'ambiente per gli script dell'AI Analyst.
 *
 * `import "dotenv/config"` legge SOLO `.env`. La chiave del modello però sta in
 * `.env.local` — è il file che Next.js carica da solo con precedenza su `.env`,
 * non viene sovrascritto quando si rigenera `.env`, ed è il posto dove il
 * progetto la cerca già altrove (vedi il commento in `cot-contesto-once.ts`).
 *
 * Qui si replica la precedenza di Next: prima `.env`, poi `.env.local` che
 * vince. Va importato per PRIMO negli script, prima di qualunque modulo che
 * legga `process.env`.
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: true, quiet: true });
