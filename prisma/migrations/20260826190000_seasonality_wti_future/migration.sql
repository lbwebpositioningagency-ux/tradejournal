-- WTI dal future front-month, ACCANTO allo spot Cushing e non al suo posto.
--
-- Misurato il 26/08/2026 sulle 6.506 sedute sovrapposte: la correlazione dei
-- rendimenti fra spot e future e 0,9376, non 1. Sostituire avrebbe spostato
-- ogni statistica stagionale gia pubblicata, e perso 14 anni di storia (lo
-- spot parte dal 1986, il future dal 2000). Le due serie convivono: lo spot
-- resta la base della Stagionalita, il future porta OHLC e freschezza alla
-- sezione Volatilita.
ALTER TYPE "SeasonalityInstrument" ADD VALUE IF NOT EXISTS 'WTIFUT';
