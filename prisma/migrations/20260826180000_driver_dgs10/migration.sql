-- Nominale USA a dieci anni nel Driver Desk.
--
-- Serve allo spread contro il Bund: il differenziale fra i due decennali e il
-- canale con cui i tassi si trasmettono all'euro, e da li agli esportatori del
-- DAX. Il Bund c'era gia (Bundesbank), il Treasury no.
ALTER TYPE "DriverDeskSeries" ADD VALUE IF NOT EXISTS 'DGS10';
