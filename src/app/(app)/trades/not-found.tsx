import { NotFoundState } from "@/components/not-found-state";

export default function TradeNotFound() {
  return (
    <NotFoundState
      title="Questo trade non esiste o non appartiene ai tuoi conti"
      description="Il collegamento potrebbe essere vecchio: un trade eliminato non lascia traccia."
      secondary={{ href: "/trades", label: "Torna a Trade View" }}
    />
  );
}
