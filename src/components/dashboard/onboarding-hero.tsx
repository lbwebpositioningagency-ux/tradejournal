import Link from "next/link";
import { FileUp, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * F15 — Onboarding: finché non c'è nessun trade, al posto della griglia di
 * metriche a trattini si mostra una hero a 3 passi guidati. Riusa lo stile del
 * design system (card, accento blu, EmptyState-like) e porta l'utente al primo
 * dato reale.
 */

const STEPS = [
  {
    icon: Wallet,
    title: "Configura conto e saldo",
    description:
      "Imposta valuta e saldo iniziale del conto: le percentuali e il rischio partiranno corretti.",
    href: "/settings/accounts",
    cta: "Vai ai conti",
    variant: "outline" as const,
  },
  {
    icon: Plus,
    title: "Aggiungi il primo trade",
    description:
      "Inserisci un'operazione a mano — ingresso, uscita, size — e vedi subito le metriche prendere vita.",
    href: "/trades/new",
    cta: "Nuovo trade",
    variant: "default" as const,
  },
  {
    icon: FileUp,
    title: "Oppure importa lo storico",
    description:
      "Hai già uno storico? Importa il CSV del broker e popola il journal in un colpo solo.",
    href: "/import",
    cta: "Importa CSV",
    variant: "outline" as const,
  },
];

export function OnboardingHero({ accountBalanceLabel }: { accountBalanceLabel: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-8 px-6 py-10 text-center">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            Inizia da qui
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Il tuo journal è pronto
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ancora nessun trade: in tre passi vedrai la dashboard riempirsi di
            numeri onesti sul tuo trading. Saldo di partenza:{" "}
            <span className="font-medium text-foreground">{accountBalanceLabel}</span>.
          </p>
        </div>

        <ol className="grid w-full gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.href}
              className="flex flex-col items-center gap-3 rounded-lg border bg-card p-5 text-center"
            >
              <div className="relative">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="size-5 text-primary" aria-hidden />
                </div>
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-2xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
              <Button asChild variant={step.variant} size="sm" className="w-full">
                <Link href={step.href}>{step.cta}</Link>
              </Button>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
