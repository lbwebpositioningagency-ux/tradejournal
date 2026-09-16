import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sniffMimeType } from "@/lib/file-signature";

/**
 * GET /api/notebook/images/[id] — byte di un'immagine del Notebook.
 * Solo il proprietario: il where filtra SEMPRE per userId. Stesse cautele
 * della route degli allegati (tipo riletto dai byte, nosniff).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await params;
  const image = await prisma.notebookImage.findFirst({
    where: { id, userId: session.user.id },
    select: { data: true, fileName: true },
  });
  if (!image) {
    return Response.json({ error: "Immagine non trovata" }, { status: 404 });
  }

  const body = new Uint8Array(image.data);
  const sniffed = sniffMimeType(body);
  if (!sniffed?.startsWith("image/")) {
    return Response.json({ error: "Immagine non valida" }, { status: 404 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": sniffed,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(image.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
