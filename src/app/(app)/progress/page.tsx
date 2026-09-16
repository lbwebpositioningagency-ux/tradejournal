import { redirect } from "next/navigation";

/** Fase 1: il tracker non esiste ancora, la sezione apre sulle regole. */
export default function ProgressPage() {
  redirect("/progress/regole");
}
