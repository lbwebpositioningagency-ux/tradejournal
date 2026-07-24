import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/attachments/[id] — serve i byte di un allegato (F16b).
 * Solo il proprietario: il where filtra SEMPRE per userId. I byte stanno in
 * Postgres (Attachment.data): questa è l'unica query che li seleziona.
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
  const attachment = await prisma.attachment.findFirst({
    where: { id, userId: session.user.id },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!attachment) {
    return Response.json({ error: "Allegato non trovato" }, { status: 404 });
  }

  // filename* RFC 5987: gestisce accenti e spazi senza rompere l'header.
  const encodedName = encodeURIComponent(attachment.fileName);
  const body = new Uint8Array(attachment.data);
  return new Response(body, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      // Privato ma cacheabile dal browser: i byte di un allegato non cambiano.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
