import { NotFoundState } from "@/components/not-found-state";
import { calendarHref } from "@/lib/calendar";

export default function WeekNotFound() {
  return (
    <NotFoundState
      title="Questa settimana non esiste"
      description="L'indirizzo deve contenere una data reale nel formato anno-mese-giorno."
      secondary={{ href: calendarHref(null, { anchor: true }), label: "Apri il calendario" }}
    />
  );
}
