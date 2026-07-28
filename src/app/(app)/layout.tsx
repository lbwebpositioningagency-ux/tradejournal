import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACTIVE_ACCOUNT_COOKIE, ALL_ACCOUNTS } from "@/lib/constants";
import { getDemoAccount } from "@/lib/demo-account";
import { Button } from "@/components/ui/button";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { AccountSwitcher } from "@/components/layout/account-switcher";
import { GlobalShortcuts } from "@/components/layout/global-shortcuts";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Conti dell'utente + il conto DEMO globale SIM1, che tutti vedono in sola
  // lettura (appartiene a un utente di sistema, quindi non entra mai in
  // "Tutti i conti": si seleziona solo esplicitamente).
  const [ownAccounts, demoAccount] = await Promise.all([
    prisma.tradingAccount.findMany({
      where: { userId: session.user.id, isArchived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, currency: true },
    }),
    getDemoAccount(),
  ]);
  const accounts = [
    ...ownAccounts.map((a) => ({ ...a, isDemo: false })),
    ...(demoAccount
      ? [
          {
            id: demoAccount.id,
            name: demoAccount.name,
            currency: demoAccount.currency,
            isDemo: true,
          },
        ]
      : []),
  ];

  const cookieValue = (await cookies()).get(ACTIVE_ACCOUNT_COOKIE)?.value;
  const activeAccountId =
    cookieValue && accounts.some((a) => a.id === cookieValue)
      ? cookieValue
      : ALL_ACCOUNTS;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <MobileNav />
            <AccountSwitcher accounts={accounts} activeAccountId={activeAccountId} />
          </div>
          <div className="flex items-center gap-1">
            {/* F47 — quick-add: il gesto più frequente sempre a un click ("n") */}
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="max-lg:size-11"
            >
              <Link
                href="/trades/new"
                aria-label="Nuovo trade (scorciatoia: n)"
                title="Nuovo trade (n)"
              >
                <Plus className="size-4" />
              </Link>
            </Button>
            <ThemeToggle />
            <UserMenu
              name={session.user.name ?? null}
              email={session.user.email ?? ""}
              image={session.user.image ?? null}
            />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <GlobalShortcuts />
      </div>
    </div>
  );
}
