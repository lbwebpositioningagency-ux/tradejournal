import { NotFoundState } from "@/components/not-found-state";
import { calendarHref } from "@/lib/calendar";

export default function DayNotFound() {
  return (
    <NotFoundState
      title="Questa data non esiste"
      description="L'indirizzo deve contenere una data reale nel formato anno-mese-giorno."
      secondary={{ href: calendarHref(null, { anchor: true }), label: "Apri il calendario" }}
    />
  );
}
