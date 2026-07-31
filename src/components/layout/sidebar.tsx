"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChartScatter,
  CalendarDays,
  Globe,
  LayoutDashboard,
  Menu,
  Settings,
  Table2,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* D-02 — patto voce ↔ titolo: ogni label DEVE coincidere col titolo (h1 e
   metadata) della pagina di destinazione. Lingua della nav: italiano; i nomi
   inglesi restanti (Dashboard, Trade View, Reports, Analytics, Macro Desk)
   sono nomi canonici di prodotto, identici nel titolo pagina — mai ibridi
   voce/titolo in lingue diverse. */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/day", label: "Calendario", icon: CalendarDays },
  { href: "/trades", label: "Trade View", icon: Table2 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/analytics", label: "Analytics", icon: ChartScatter },
  { href: "/macro-desk", label: "Macro Desk", icon: Globe },
  { href: "/strategies", label: "Strategie", icon: Target },
  { href: "/settings", label: "Impostazioni", icon: Settings },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-md bg-primary text-2xs font-bold tracking-tight text-primary-foreground">
        L&amp;B
      </div>
      <span className="font-semibold tracking-tight text-sidebar-foreground">
        L&amp;B TradeJournal
      </span>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
              active
                ? "bg-sidebar-primary/15 text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar fissa da lg in su. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Brand />
      </div>
      <NavLinks />
    </aside>
  );
}

/** Menu di navigazione mobile (sotto lg): hamburger → Sheet. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* F28 — touch target ≥44px su mobile (linea guida) */}
        <Button
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          aria-label="Apri il menu di navigazione"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-0">
        <SheetHeader className="border-b border-sidebar-border px-4 py-3">
          <SheetTitle asChild>
            <Brand />
          </SheetTitle>
        </SheetHeader>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
