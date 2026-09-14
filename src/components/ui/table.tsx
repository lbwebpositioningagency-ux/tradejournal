import * as React from "react"

import { cn } from "@/lib/utils"

/*
 * Niente "use client": il componente non ha stato né effetti, e da server può
 * leggere i figli prima del render — serve al riconoscimento delle celle
 * numeriche qui sotto. Resta utilizzabile anche dai componenti client.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        // Cifre tabulari su TUTTA la tabella, non cella per cella: in Geist
        // «1» è largo la metà di «0», e una colonna di importi proporzionali
        // non si confronta a colpo d'occhio.
        className={cn("w-full caption-bottom text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

/** Il testo che una cella mostrerà, ricostruito dai figli prima del render. */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ""
}

/*
 * Un numero come lo scrive il formattatore unico (src/lib/format-number.ts):
 * segno, cifre col punto delle migliaia e la virgola, un'eventuale unità
 * («€», «$», «%», «R», un codice valuta). Date («14/07/26») e orari hanno
 * separatori che qui non passano, e restano testo.
 */
const NUMERIC_TEXT =
  /^(?:[+\-−<>≈]\s?)?[€$£¥]?\s?\d[\d.,\s  ]*(?:\s?(?:%|R|pp|x|×|€|\$|£|¥|[A-Z]{3}))?$|^[+\-−]?∞$/

const EXPLICIT_ALIGN = /(?:^|\s)(?:[a-z0-9]+:)*text-(?:left|center|right|start|end)(?:\s|$)/

/**
 * Cella di tabella. Una cella il cui contenuto è un numero si allinea a destra
 * DA SOLA (e marca `data-numeric`, che fa allineare anche l'intestazione della
 * sua colonna: vedi globals.css). Chi vuole altro lo dichiara con una classe
 * `text-*` esplicita, che vince sempre.
 */
function TableCell({
  className,
  children,
  ...props
}: React.ComponentProps<"td">) {
  const numeric =
    !EXPLICIT_ALIGN.test(className ?? "") &&
    NUMERIC_TEXT.test(textOf(children).trim())
  return (
    <td
      data-slot="table-cell"
      data-numeric={numeric ? "" : undefined}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
