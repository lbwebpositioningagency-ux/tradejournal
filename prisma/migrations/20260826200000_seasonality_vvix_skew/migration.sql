-- VVIX e SKEW: il clima di copertura sull'azionario passa alle fonti
-- automatiche.
--
-- Arrivavano dal report giornaliero, copiati a mano dalle pagine
-- historical-data di Investing.com con due-tre giorni di ritardo dichiarato.
-- Il CDN del CBOE li pubblica per intero e senza chiave (verificato il
-- 26/08/2026: VVIX 200 in 566 ms con 5.090 sedute dal 03/06/2006, SKEW 200 in
-- 527 ms con 9.213 sedute dal 02/01/1990).
--
-- Come VIX9D e VIX3M restano FUORI dalle schede della Stagionalita: sono
-- serie di contesto, non strumenti su cui si studia un calendario.
--
-- Nessuna riserva, ed e dichiarato nel registro: FRED non ridistribuisce ne
-- l'una ne l'altra (VVIXCLS e SKEWCLS rispondono 404).
ALTER TYPE "SeasonalityInstrument" ADD VALUE IF NOT EXISTS 'VVIX';
ALTER TYPE "SeasonalityInstrument" ADD VALUE IF NOT EXISTS 'SKEW';
