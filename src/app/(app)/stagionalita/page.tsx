import { permanentRedirect } from "next/navigation";

/**
 * La Stagionalità è entrata sotto il Macro Desk (`/macro-desk/stagionalita`),
 * accanto a Trends e Scorecard. Questa rotta resta come reindirizzamento
 * permanente: era pubblicata, e i segnalibri o i link già scambiati non
 * devono rompersi per una riorganizzazione di navigazione.
 */
export default function StagionalitaRedirect() {
  permanentRedirect("/macro-desk/stagionalita");
}
