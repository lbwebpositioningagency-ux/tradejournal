"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

/**
 * Stato di errore delle pagine dell'app (FASE 10): leggibile, con retry —
 * mai una pagina bianca o uno stack trace.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Qualcosa è andato storto"
      description="Il caricamento della pagina è fallito. Riprova: se il problema persiste, verifica che il database sia raggiungibile."
    >
      <Button onClick={reset} variant="outline">
        Riprova
      </Button>
    </EmptyState>
  );
}
