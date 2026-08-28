/**
 * FIXTURE REALE — il report DAILY del 31 luglio 2026 come sta in Neon:
 * `synthesis` è una STRINGA di 533 caratteri invece dell'oggetto
 * {pills, risks, conclusion}. Estratta il 28/08/2026, non ritoccata.
 *
 * Fino al 28/08 quel campo cadeva intero — niente quadro, niente Radar
 * rischi, niente Verdetto — senza che nulla lo segnalasse. Il parser ora la
 * legge come verdetto e la sentinella la rileva: due cose diverse, e servono
 * entrambe. Le due notizie sono un estratto, servono solo a completare il
 * payload per il controllo sulla provenienza.
 */
export const REPORT_0731 = {
  "synthesis": "Regime a tinte stagflazionistiche: crescita in rallentamento (PIL Q2 +1,5%, NFP +57k) con inflazione elevata e trainata dall'energia (PCE 3,7%), Fed in attesa ma hawkish (hold 3,50-3,75% con 3 dissensi pro-rialzo; il mercato prezza ~60% di rialzo a settembre) e conflitto Iran-USA che aggiunge premio safe-haven e rischio d'offerta. Oro RIALZISTA moderato (safe-haven + pavimento CB vs reali ai massimi da post-pandemia); petrolio e indici NEUTRALI per conflitto genuino dei pilastri. Run di ponte: track record formale dal 2 agosto.",
  "news": [
    {
      "src": "Bloomberg",
      "impl": "Segnale hawkish: la porta è al rialzo, non al taglio. Headwind per oro (reali) e multipli azionari.",
      "tags": [
        "fed",
        "macro"
      ],
      "when": "2 giorni fa",
      "title": "La Fed lascia i tassi al 3,50-3,75%: voto 9-3 con tre dissensi a favore di un rialzo"
    },
    {
      "src": "FX Leaders",
      "impl": "Il presidente Fed valida il pricing di mercato di un rialzo a settembre: dollaro e reali sostenuti.",
      "tags": [
        "fed",
        "macro"
      ],
      "when": "Ieri",
      "title": "Warsh: inflazione elevata da costi energetici, 'tassi più alti parte della soluzione'"
    }
  ]
} as const;
