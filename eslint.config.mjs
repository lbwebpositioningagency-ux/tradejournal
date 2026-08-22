import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Client Prisma generato
    "src/generated/**",
    // Build di worktree annidati: non è codice del progetto
    ".claude/worktrees/**",
  ]),
  {
    // P0 — nessuno STATO A LIVELLO DI MODULO nel codice che serve richieste.
    //
    // Un `let` in cima a una pagina o a una server action vive nel processo,
    // non nella richiesta: più richieste di utenti diversi condividono lo
    // stesso modulo e si vedono lo stato a vicenda. È già successo una volta
    // (flag "filtro attivo" in analytics/page.tsx) e la lezione è che
    // correggere il singolo caso non basta.
    //
    // La regola vale dove non esiste un motivo legittimo per tenere stato di
    // processo. In `src/lib/**` restano leciti i casi valutati (rate limiter,
    // memoizzazioni non legate all'utente): lì decide chi scrive, con la
    // regola in AGENTS.md sotto gli occhi.
    files: ["src/app/**/*.{ts,tsx}", "src/server/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > VariableDeclaration[kind='let']",
          message:
            "Niente stato a livello di modulo qui: il modulo è condiviso fra le richieste e lo stato di un utente finirebbe nella pagina di un altro. Passa il valore come prop/argomento.",
        },
        {
          selector: "Program > VariableDeclaration[kind='var']",
          message:
            "Niente stato a livello di modulo qui: il modulo è condiviso fra le richieste e lo stato di un utente finirebbe nella pagina di un altro. Passa il valore come prop/argomento.",
        },
      ],
    },
  },
]);

export default eslintConfig;
