import Link from "next/link";
import { NotFoundState } from "@/components/not-found-state";

/**
 * 404 per gli indirizzi che non corrispondono a nessuna rotta: sta fuori
 * dalla cornice dell'app (non c'è un layout di sezione da cui ereditarla),
 * quindi la stessa card su fondo pagina, con il marchio sopra.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-16 text-foreground">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[0.625rem] font-bold text-primary-foreground">
            L&amp;B
          </span>
          L&amp;B TradingSpace
        </Link>
        <NotFoundState />
      </div>
    </main>
  );
}
