import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronRight, Landmark } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  ACCENT_COOKIE,
  ACCENTS,
  DEFAULT_ACCENT,
  DEFAULT_PNL_PALETTE,
  PNL_COOKIE,
  PNL_PALETTES,
  type Accent,
  type PnlPalette,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { parseMt5LastResult } from "@/lib/validations/mt5";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccentPicker } from "./accent-picker";
import { ChecklistForm } from "./checklist-form";
import { Mt5SyncSettings } from "./mt5-sync-settings";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      timezone: true,
      baseCurrency: true,
      // F39 — null = account solo-Google: il form "imposta password".
      passwordHash: true,
    },
  });

  const [mt5Sources, accounts, checklistItems] = await Promise.all([
    prisma.mt5SyncSource.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { account: { select: { name: true } } },
    }),
    prisma.tradingAccount.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    // F3 — modello di checklist pre-trade: voci ATTIVE, nell'ordine scelto.
    prisma.checklistItem.findMany({
      where: { userId, isArchived: false },
      orderBy: [{ position: "asc" }, { label: "asc" }],
      select: { id: true, label: true },
    }),
  ]);
  const withSource = new Set(mt5Sources.map((s) => s.tradingAccountId));

  const store = await cookies();
  const accentCookie = store.get(ACCENT_COOKIE)?.value;
  const accent: Accent = (ACCENTS as readonly string[]).includes(
    accentCookie ?? "",
  )
    ? (accentCookie as Accent)
    : DEFAULT_ACCENT;
  const pnlCookie = store.get(PNL_COOKIE)?.value;
  const pnlPalette: PnlPalette = (PNL_PALETTES as readonly string[]).includes(
    pnlCookie ?? "",
  )
    ? (pnlCookie as PnlPalette)
    : DEFAULT_PNL_PALETTE;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="page-title">Impostazioni</h1>
        <p className="page-subtitle">
          Profilo, preferenze e gestione dei conti di trading
        </p>
      </div>

      <ProfileForm
        name={user.name ?? ""}
        email={user.email}
        timezone={user.timezone}
        baseCurrency={user.baseCurrency}
      />

      {/* F39 — sicurezza account */}
      <PasswordForm hasPassword={user.passwordHash !== null} />

      <ChecklistForm initial={checklistItems} />

      <AccentPicker currentAccent={accent} currentPnl={pnlPalette} />

      <Mt5SyncSettings
        sources={mt5Sources.map((source) => ({
          id: source.id,
          accountName: source.account.name,
          tradingAccountId: source.tradingAccountId,
          filePath: source.filePath,
          assetClass: source.assetClass,
          enabled: source.enabled,
          lastSyncAtLabel: source.lastSyncAt
            ? formatDateTime(source.lastSyncAt, user.timezone)
            : null,
          lastResult: parseMt5LastResult(source.lastResult),
        }))}
        availableAccounts={accounts.filter((a) => !withSource.has(a.id))}
      />

      <Link href="/settings/accounts" className="group">
        <Card className="transition-colors group-hover:border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Landmark className="size-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Conti di trading</CardTitle>
                <CardDescription>
                  Aggiungi, modifica o archivia i tuoi conti
                </CardDescription>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="hidden" />
        </Card>
      </Link>
    </div>
  );
}
