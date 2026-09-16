import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NotebookEditor } from "@/components/notebook/notebook-editor";

export const metadata: Metadata = { title: "Nota" };

/**
 * Una nota del Notebook. Nessun `loading.tsx` in questo segmento: la nota
 * inesistente (o di un altro utente) deve rispondere 404 vero, prima che parta
 * lo streaming.
 */
export default async function NotebookNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { id } = await params;

  const [note, user] = await Promise.all([
    prisma.notebookNote.findFirst({
      where: { id, userId },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
  ]);
  if (!note) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader back={{ href: "/notebook", label: "Notebook" }} title="Nota" />
      <NotebookEditor
        key={note.id}
        timezone={user.timezone}
        note={{
          id: note.id,
          title: note.title,
          content: note.content,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        }}
      />
    </div>
  );
}
