import { NotFoundState } from "@/components/not-found-state";

export default function MacroDeskNotFound() {
  return (
    <NotFoundState
      title="Questo report o questa sezione non esiste"
      description="Il collegamento potrebbe essere vecchio, o riferirsi a una sezione tolta dal desk. I report disponibili sono nell'archivio."
      secondary={{ href: "/macro-desk/report", label: "Archivio dei report" }}
    />
  );
}
