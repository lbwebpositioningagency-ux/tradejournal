import { NotFoundState } from "@/components/not-found-state";

export default function DayNotFound() {
  return (
    <NotFoundState
      title="Questa data non esiste"
      description="L'indirizzo deve contenere una data reale nel formato anno-mese-giorno."
      secondary={{ href: "/day", label: "Apri il calendario" }}
    />
  );
}
