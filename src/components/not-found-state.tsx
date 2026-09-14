import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Stato «non trovato» (404) di tutta l'app.
 *
 * Prima non esisteva: si vedeva la pagina di Next, in inglese, e in tema
 * scuro il suo testo nero su fondo quasi nero rendeva illeggibile anche il
 * selettore conto della topbar. Qui usa solo i token dell'app, quindi segue
 * i due temi da sé.
 *
 * Composizione decisa nella tavola «Correzioni P0» di Claude Design: card
 * allineata in alto a sinistra come il contenuto di ogni pagina (non un
 * messaggio centrato su uno schermo vuoto), occhiello, titolo che dice COSA
 * manca, una frase sul perché, al massimo due azioni — la Dashboard sempre,
 * più un'uscita legata al contesto.
 */
export function NotFoundState({
  title = "Questa pagina non esiste",
  description = "L'indirizzo potrebbe essere sbagliato, o la pagina è stata tolta.",
  secondary,
}: {
  title?: string;
  description?: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section
      aria-labelledby="non-trovato-titolo"
      className="flex w-full max-w-xl flex-col items-start gap-2 rounded-xl border bg-card p-5 text-card-foreground sm:p-6"
    >
      <p className="stat-label">Non trovato · 404</p>
      <h1 id="non-trovato-titolo" className="text-base font-semibold">
        {title}
      </h1>
      <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard">Vai alla Dashboard</Link>
        </Button>
        {secondary ? (
          <Button asChild variant="outline">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
