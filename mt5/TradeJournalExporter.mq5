//+------------------------------------------------------------------+
//|                                        TradeJournalExporter.mq5  |
//|  Esporta ogni posizione CHIUSA in NDJSON per L&B TradingSpace.   |
//|                                                                  |
//|  - Una riga JSON per posizione completamente chiusa (append).    |
//|  - File in Common\Files\tradejournal\<login>.ndjson: la cartella |
//|    Common e' condivisa tra tutte le istanze MT5 della macchina,  |
//|    il nome file separa i conti da solo.                          |
//|  - Orari convertiti in UTC stimando l'offset del server broker   |
//|    (TimeTradeServer - TimeGMT arrotondato alla mezz'ora); input  |
//|    manuale di override per broker anomali.                       |
//|  - Nessuna DLL, nessun permesso extra: solo file nel sandbox.    |
//|  - Ri-esportare righe gia' scritte e' innocuo: l'app deduplica   |
//|    per ticket (posizione) e conto.                               |
//+------------------------------------------------------------------+
#property copyright "L&B TradingSpace"
#property link      ""
#property version   "1.00"
#property strict

// Giorni di storico esportati al primo avvio (poi riparte dall'ultimo export)
input int InpBackfillDays       = 30;
// Offset server->UTC in MINUTI, solo se l'auto-rilevazione sbaglia (-99999 = auto)
input int InpManualGmtOffsetMin = -99999;

string g_fileName;
string g_gvLastExport;

//+------------------------------------------------------------------+
int OnInit()
  {
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   g_fileName     = "tradejournal\\" + (string)login + ".ndjson";
   g_gvLastExport = "TJ_LastExport_" + (string)login;

   datetime from = TimeCurrent() - (datetime)InpBackfillDays * 86400;
   if(GlobalVariableCheck(g_gvLastExport))
     {
      datetime last = (datetime)(long)GlobalVariableGet(g_gvLastExport);
      // Piccolo overlap di sicurezza: la dedup dell'app scarta i doppioni.
      if(last - 3600 > from) from = last - 3600;
     }
   BackfillClosedPositions(from);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Offset server broker -> UTC in secondi                           |
//+------------------------------------------------------------------+
int ServerGmtOffsetSeconds()
  {
   if(InpManualGmtOffsetMin != -99999)
      return InpManualGmtOffsetMin * 60;
   long diff = (long)TimeTradeServer() - (long)TimeGMT();
   long rounded = (long)MathRound((double)diff / 1800.0) * 1800; // mezz'ore
   return (int)rounded;
  }

//+------------------------------------------------------------------+
//| datetime (ora server) -> stringa ISO UTC                         |
//+------------------------------------------------------------------+
string IsoUtc(datetime serverTime, int offsetSec)
  {
   datetime utc = serverTime - offsetSec;
   MqlDateTime dt;
   TimeToStruct(utc, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
  }

//+------------------------------------------------------------------+
//| Append di una riga al file NDJSON (crea cartella/file se manca)  |
//+------------------------------------------------------------------+
bool AppendLine(const string line)
  {
   int handle = FileOpen(g_fileName,
                         FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI |
                         FILE_COMMON | FILE_SHARE_READ);
   if(handle == INVALID_HANDLE)
     {
      Print("TJ: FileOpen fallita (", GetLastError(), ") su ", g_fileName);
      return false;
     }
   FileSeek(handle, 0, SEEK_END);
   FileWriteString(handle, line + "\n");
   FileClose(handle);
   return true;
  }

//+------------------------------------------------------------------+
//| Esporta una posizione completamente chiusa (aggrega i deal)      |
//+------------------------------------------------------------------+
bool ExportPosition(long positionId)
  {
   if(!HistorySelectByPosition(positionId))
      return false;
   int total = HistoryDealsTotal();
   if(total <= 0)
      return false;

   double volIn = 0.0, volOut = 0.0;
   double sumInPV = 0.0, sumOutPV = 0.0; // somma prezzo*volume (media pesata)
   double commission = 0.0, swap = 0.0, profit = 0.0;
   datetime firstIn = 0, lastOut = 0;
   long dirType = -1;
   string symbol = "";
   bool hasInOut = false;

   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long dtype = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL)
         continue; // salta balance/credit/commissioni pure
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      double vol   = HistoryDealGetDouble(deal, DEAL_VOLUME);
      double price = HistoryDealGetDouble(deal, DEAL_PRICE);
      datetime t   = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      commission  += HistoryDealGetDouble(deal, DEAL_COMMISSION);
      swap        += HistoryDealGetDouble(deal, DEAL_SWAP);
      symbol       = HistoryDealGetString(deal, DEAL_SYMBOL);

      if(entry == DEAL_ENTRY_IN)
        {
         if(dirType < 0)
            dirType = dtype;
         volIn   += vol;
         sumInPV += price * vol;
         if(firstIn == 0 || t < firstIn)
            firstIn = t;
        }
      else if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_OUT_BY)
        {
         volOut   += vol;
         sumOutPV += price * vol;
         profit   += HistoryDealGetDouble(deal, DEAL_PROFIT);
         if(t > lastOut)
            lastOut = t;
        }
      else if(entry == DEAL_ENTRY_INOUT)
         hasInOut = true;
     }

   if(hasInOut)
     {
      Print("TJ: posizione ", positionId,
            " con reversal (INOUT): non esportata (limite v1)");
      return false;
     }
   if(volIn <= 0.0 || volOut <= 0.0)
      return false;
   if(MathAbs(volIn - volOut) > 0.0000001)
      return false; // non completamente chiusa
   if(dirType < 0 || firstIn == 0 || lastOut == 0 || symbol == "")
      return false;

   int    digits   = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double contract = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
   if(contract <= 0.0)
      contract = 1.0;
   int offsetSec = ServerGmtOffsetSeconds();
   string dir = (dirType == DEAL_TYPE_BUY) ? "buy" : "sell";

   string line = StringFormat(
      "{\"v\":1,\"ticket\":%I64d,\"login\":%I64d,\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"volume\":\"%s\",\"openPrice\":\"%s\",\"openTimeUtc\":\"%s\","
      "\"closePrice\":\"%s\",\"closeTimeUtc\":\"%s\","
      "\"commission\":\"%s\",\"swap\":\"%s\",\"profit\":\"%s\","
      "\"accountCurrency\":\"%s\",\"contractSize\":\"%s\","
      "\"digits\":%d,\"serverGmtOffsetMin\":%d}",
      positionId,
      AccountInfoInteger(ACCOUNT_LOGIN),
      symbol,
      dir,
      DoubleToString(volIn, 2),
      DoubleToString(sumInPV / volIn, digits),
      IsoUtc(firstIn, offsetSec),
      DoubleToString(sumOutPV / volOut, digits),
      IsoUtc(lastOut, offsetSec),
      DoubleToString(commission, 2),
      DoubleToString(swap, 2),
      DoubleToString(profit, 2),
      AccountInfoString(ACCOUNT_CURRENCY),
      DoubleToString(contract, 2),
      digits,
      offsetSec / 60);

   return AppendLine(line);
  }

//+------------------------------------------------------------------+
//| Backfill: esporta le posizioni chiuse dal timestamp indicato     |
//+------------------------------------------------------------------+
void BackfillClosedPositions(datetime from)
  {
   datetime to = TimeCurrent() + 86400;
   if(!HistorySelect(from, to))
      return;

   long done[];
   ArrayResize(done, 0);
   int doneCount = 0;
   int exported = 0;

   int totalDeals = HistoryDealsTotal();
   for(int i = 0; i < totalDeals; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0)
         continue;
      long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
         continue;
      long posId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);

      bool already = false;
      for(int j = 0; j < doneCount; j++)
         if(done[j] == posId) { already = true; break; }
      if(already)
         continue;
      ArrayResize(done, doneCount + 1);
      done[doneCount++] = posId;

      if(PositionSelectByTicket(posId))
         continue; // ancora aperta (parziale): la esporta la chiusura finale

      if(ExportPosition(posId))
         exported++;

      // HistorySelectByPosition (dentro ExportPosition) cambia la selezione:
      // la ripristiniamo per continuare il giro sui deal del periodo.
      HistorySelect(from, to);
      totalDeals = HistoryDealsTotal();
     }

   GlobalVariableSet(g_gvLastExport, (double)(long)TimeCurrent());
   Print("TJ: backfill completato, ", exported, " posizioni esportate su ",
         g_fileName, " (Common Files)");
  }

//+------------------------------------------------------------------+
//| Live: esporta quando una posizione arriva a volume zero          |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD)
      return;
   ulong deal = trans.deal;
   if(deal == 0 || !HistoryDealSelect(deal))
      return;
   long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
      return;
   long posId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
   if(PositionSelectByTicket(posId))
      return; // chiusura parziale: la posizione esiste ancora

   if(ExportPosition(posId))
      GlobalVariableSet(g_gvLastExport, (double)(long)TimeCurrent());
  }
//+------------------------------------------------------------------+
