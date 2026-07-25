"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Card con contenuto collassabile SOLO su mobile (< lg): coerente col layout
 * F26 della dashboard. Su desktop il contenuto è sempre visibile e il toggle
 * non esiste. Il contenuto resta server-rendered (arriva via children).
 */
export function CollapsibleCard({
  title,
  titleExtra,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Nodo extra accanto al titolo (es. MetricInfo). */
  titleExtra?: React.ReactNode;
  /** Stato iniziale su mobile (desktop sempre aperto). */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="stat-label flex items-center gap-1">
          {title}
          {titleExtra}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-my-1.5 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Comprimi ${title}` : `Espandi ${title}`}
        >
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent className={cn(!open && "max-lg:hidden")}>
        {children}
      </CardContent>
    </Card>
  );
}
