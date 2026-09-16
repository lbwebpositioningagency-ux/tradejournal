import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookPen, Plus, Search, SearchX } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NOTEBOOK_PAGE_SIZE } from "@/lib/constants";
import { noteDisplayTitle, noteExcerpt } from "@/lib/notebook/excerpt";
import { formatNoteDateTimeShort } from "@/lib/notebook/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedNav } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";

export const metadata: Metadata = { title: "Notebook" };

type Order = "recenti" | "vecchie";

/**
 * NOTEBOOK — elenco delle note libere (tavola Claude Design «Journal -
 * Notebook e Day View, disposizione», 1b). Ricerca in titolo e testo nel
 * database; la data di creazione è il riferimento della nota e sta in colonna.
 */
export default async function NotebookPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ordine?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // Le note sono PERSONALI come il journal: sempre dell'utente vero.
  const userId = session.user.id;

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const order: Order = params.ordine === "vecchie" ? "vecchie" : "recenti";

  const where = {
    userId,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { content: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [user, total, anyNote] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    prisma.notebookNote.count({ where }),
    q ? prisma.notebookNote.count({ where: { userId } }) : null,
  ]);
  const totalPages = Math.max(1, Math.ceil(total / NOTEBOOK_PAGE_SIZE));
  const page = parsePage(params.page, totalPages);

  const notes = await prisma.notebookNote.findMany({
    where,
    orderBy: [{ createdAt: order === "recenti" ? "desc" : "asc" }, { id: "asc" }],
    skip: (page - 1) * NOTEBOOK_PAGE_SIZE,
    take: NOTEBOOK_PAGE_SIZE,
    select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
  });

  const hrefWith = (next: { ordine?: Order; page?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const nextOrder = next.ordine ?? order;
    if (nextOrder !== "recenti") sp.set("ordine", nextOrder);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const s = sp.toString();
    return s ? `/notebook?${s}` : "/notebook";
  };

  const hasNotes = (anyNote ?? total) > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader
        title="Notebook"
        description="Note libere, datate nel momento in cui inizi a scriverle"
        actions={
          <Button asChild>
            <Link href="/notebook/new">
              <Plus className="size-4" />
              Nuova nota
            </Link>
          </Button>
        }
      />

      {!hasNotes ? (
        <EmptyState
          icon={NotebookPen}
          title="Nessuna nota ancora"
          description="Idee, piani, lezioni imparate: una nota prende la data e l'ora in cui cominci a scriverla, e si salva da sola."
        >
          <Button asChild>
            <Link href="/notebook/new">
              <Plus className="size-4" />
              Nuova nota
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <form action="/notebook" role="search" className="relative min-w-0 flex-1 basis-60">
              {order !== "recenti" ? <input type="hidden" name="ordine" value={order} /> : null}
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label htmlFor="notebook-search" className="sr-only">
                Cerca nelle note
              </label>
              <Input
                id="notebook-search"
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Cerca in titolo e testo"
                className="h-9 pl-8"
              />
            </form>
            <SegmentedNav
              label="Ordine delle note"
              items={[
                { key: "recenti", href: hrefWith({ ordine: "recenti" }), label: "Più recenti", active: order === "recenti" },
                { key: "vecchie", href: hrefWith({ ordine: "vecchie" }), label: "Meno recenti", active: order === "vecchie" },
              ]}
            />
          </div>

          {q ? (
            <p className="text-sm text-muted-foreground" role="status">
              {total === 0
                ? `Nessuna nota contiene «${q}».`
                : `${total} ${total === 1 ? "nota contiene" : "note contengono"} «${q}».`}{" "}
              <Link href={hrefWith({})} className="font-medium text-foreground underline underline-offset-2">
                Mostra tutte
              </Link>
            </p>
          ) : null}

          {notes.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title="Nessun risultato"
              description="La ricerca guarda il titolo e il testo delle note, senza distinguere maiuscole e minuscole."
            />
          ) : (
            <Card className="gap-0 py-0">
              <ul className="divide-y">
                {notes.map((note) => {
                  const excerpt = noteExcerpt(note.content);
                  const edited = note.updatedAt.getTime() - note.createdAt.getTime() > 60_000;
                  return (
                    <li key={note.id} className="relative px-4 py-3 hover:bg-muted/40 sm:px-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                        <time
                          dateTime={note.createdAt.toISOString()}
                          className="shrink-0 text-sm font-medium tabular-nums text-foreground sm:w-40"
                        >
                          {formatNoteDateTimeShort(note.createdAt, user.timezone)}
                        </time>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/notebook/${note.id}`}
                            className={cn(
                              "font-semibold after:absolute after:inset-0",
                              note.title.trim() === "" && "text-muted-foreground",
                            )}
                          >
                            {noteDisplayTitle(note.title)}
                          </Link>
                          {excerpt ? (
                            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{excerpt}</p>
                          ) : null}
                          {edited ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Modificata il {formatNoteDateTimeShort(note.updatedAt, user.timezone)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Pagination page={page} totalPages={totalPages} hrefFor={(n) => hrefWith({ page: n })} />
        </>
      )}
    </div>
  );
}
