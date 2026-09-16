import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEffectiveRules } from "@/lib/queries/discipline-rules";
import { PageHeader } from "@/components/layout/page-header";
import { ProgressNav } from "../progress-nav";
import { RuleEditor } from "./rule-editor";

export const metadata: Metadata = { title: "Progress Tracker" };

export default async function ProgressRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Regole dell'utente della SESSIONE, anche quando il conto attivo è SIM1.
  const rules = await getEffectiveRules(session.user.id);
  const attive = rules.filter((r) => r.isActive).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        nav={<ProgressNav active="regole" />}
        title="Progress Tracker"
        description={`Regole di disciplina: ${attive} attive su ${rules.length}. Ognuna si verifica dai dati dei trade, nessuna si dichiara a mano.`}
      />

      <p className="rounded-lg border bg-card px-4 py-3 text-sm text-pretty text-muted-foreground">
        Le soglie di partenza sono <span className="font-medium text-foreground">punti di partenza</span>,
        misurati sul conto demo SIM1: non sono valori consigliati né imposti. Cambiale sui tuoi numeri. Le
        regole sono tue e valgono su tutti i conti che guardi, compreso il demo, che resta in sola lettura.
      </p>

      <div className="flex flex-col gap-3">
        {rules.map((rule) => (
          <RuleEditor key={`${rule.type}-${rule.customized}`} rule={rule} />
        ))}
      </div>
    </div>
  );
}
