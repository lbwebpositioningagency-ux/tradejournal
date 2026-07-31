import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4">
      {/* Alone di accento discreto dietro la card, eredita il tema */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 to-transparent"
      />
      <div className="relative flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold tracking-tight text-primary-foreground shadow-raised">
          L&amp;B
        </div>
        <span className="text-xl font-semibold tracking-tight">
          L&amp;B TradingSpace
        </span>
      </div>
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
