-- Struttura a termine della volatilita: VIX a 9 giorni e a 3 mesi.
--
-- Entrano nell'enum degli strumenti perche riusano tutto cio che esiste gia —
-- catena di fonti, contabilita OHLC, copertura, verifica di esito del job —
-- ma restano FUORI dalle schede della Stagionalita: sono serie di confronto,
-- non strumenti su cui si studia un calendario.
ALTER TYPE "SeasonalityInstrument" ADD VALUE IF NOT EXISTS 'VIX9D';
ALTER TYPE "SeasonalityInstrument" ADD VALUE IF NOT EXISTS 'VIX3M';
