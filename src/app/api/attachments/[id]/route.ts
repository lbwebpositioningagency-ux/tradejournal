import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sniffMimeType } from "@/lib/file-signature";

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

  /*
   * P1-6 — il Content-Type si ricava dai byte anche qui, non solo in upload.
   * Dalla correzione in poi `mimeType` a database è già verificato, ma le
   * righe caricate PRIMA portano ancora il valore dichiarato dal client:
   * ri-annusare qui copre anche quelle, senza migrazione dei dati.
   * Firma non riconosciuta → `application/octet-stream` + download forzato:
   * il browser non interpreta nulla di ciò che non abbiamo riconosciuto.
   */
  const sniffed = sniffMimeType(body);
  const contentType = sniffed ?? "application/octet-stream";
  const disposition = sniffed ? "inline" : "attachment";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      // Il browser non deve indovinare il tipo: vale quello dichiarato qui.
      "X-Content-Type-Options": "nosniff",
      // Privato ma cacheabile dal browser: i byte di un allegato non cambiano.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
