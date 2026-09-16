import { PageHeader } from "@/components/layout/page-header";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NotebookEditor } from "@/components/notebook/notebook-editor";

export const metadata: Metadata = { title: "Nuova nota" };

/**
 * Nota nuova: la pagina si apre VUOTA e non crea nulla. La riga nasce al primo
 * salvataggio automatico, ed è in quel momento che il server le dà la data.
 */
export default async function NewNotebookNotePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <PageHeader back={{ href: "/notebook", label: "Notebook" }} title="Nuova nota" />
      <NotebookEditor note={{ title: "", content: "" }} timezone={user.timezone} />
    </div>
  );
}
