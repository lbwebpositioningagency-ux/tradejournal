"use client";

import { useState, useTransition } from "react";
import { Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteMt5SourceAction, saveMt5SourceAction } from "@/server/mt5";
import type { Mt5LastResult } from "@/lib/validations/mt5";
import { ASSET_CLASSES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Mt5SourceView {
  id: string;
  accountName: string;
  tradingAccountId: string;
  filePath: string;
  assetClass: string;
  enabled: boolean;
  lastSyncAtLabel: string | null;
  lastResult: Mt5LastResult | null;
}

export interface AccountOption {
  id: string;
  name: string;
}

function ResultSummary({ result }: { result: Mt5LastResult | null }) {
  if (!result) return <span className="text-muted-foreground">mai sincronizzato</span>;
  if (result.error) return <span className="text-loss">{result.error}</span>;
  const parts = [
    `${result.imported ?? 0} importati`,
    `${result.duplicates ?? 0} duplicati skippati`,
  ];
  const scarti = (result.failed?.length ?? 0) + (result.malformed?.length ?? 0);
  if (scarti > 0) parts.push(`${scarti} scarti`);
  return (
    <>
      <span>{parts.join(" · ")}</span>
      {(result.divergences?.length ?? 0) > 0 ? (
        <span
          className="ml-2 text-warning"
          title="Netto calcolato ≠ profit broker (probabile conversione valuta): il trade è importato col calcolo della pipeline"
        >
          ⚠ {result.divergences!.length} divergenze P&L
        </span>
      ) : null}
    </>
  );
}

export function Mt5SyncSettings({
  sources,
  availableAccounts,
}: {
  sources: Mt5SourceView[];
  /** Conti senza sorgente: selezionabili per una nuova. */
  availableAccounts: AccountOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [accountId, setAccountId] = useState("");
  const [filePath, setFilePath] = useState("");
  const [assetClass, setAssetClass] = useState<string>("FOREX");

  function save(input: {
    tradingAccountId: string;
    filePath: string;
    assetClass: string;
    enabled: boolean;
  }) {
    startTransition(async () => {
      const result = await saveMt5SourceAction({
        tradingAccountId: input.tradingAccountId,
        filePath: input.filePath,
        assetClass: input.assetClass as (typeof ASSET_CLASSES)[number],
        enabled: input.enabled,
      });
      if (result.error) toast.error(result.error);
      else toast.success("Sorgente MT5 salvata");
    });
  }

  function remove(sourceId: string) {
    startTransition(async () => {
      const result = await deleteMt5SourceAction(sourceId);
      if (result.error) toast.error(result.error);
      else toast.success("Sorgente rimossa");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync MetaTrader 5</CardTitle>
        <CardDescription>
          L&apos;Expert Advisor (cartella <code className="font-mono text-xs">mt5/</code> del
          progetto) scrive un file per conto; l&apos;app lo osserva e importa da sola
          i trade chiusi nuovi. Ticket già importati non vengono mai duplicati.
          {/* S-01: il watcher legge percorsi del filesystem locale — dal
              cloud quei file non esistono e il sync non può funzionare. */}
          <span className="mt-1 block">
            Il sync richiede l&apos;app in esecuzione <strong>locale o self-hosted</strong>{" "}
            sulla stessa macchina di MetaTrader: sull&apos;istanza cloud i file
            dell&apos;EA non sono raggiungibili e le sorgenti restano su &laquo;file
            non trovato&raquo;.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {sources.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Plug className="size-4 text-muted-foreground" />
                    {source.accountName}
                    <Badge variant={source.enabled ? "default" : "secondary"}>
                      {source.enabled ? "Attiva" : "In pausa"}
                    </Badge>
                    <Badge variant="outline">{source.assetClass}</Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        save({
                          tradingAccountId: source.tradingAccountId,
                          filePath: source.filePath,
                          assetClass: source.assetClass,
                          enabled: !source.enabled,
                        })
                      }
                    >
                      {source.enabled ? "Metti in pausa" : "Riattiva"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rimuovi sorgente ${source.accountName}`}
                      disabled={pending}
                      onClick={() => remove(source.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {source.filePath}
                </p>
                <p className="text-xs">
                  {source.lastSyncAtLabel ? (
                    <span className="text-muted-foreground">
                      Ultimo sync {source.lastSyncAtLabel} ·{" "}
                    </span>
                  ) : null}
                  <ResultSummary result={source.lastResult} />
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessuna sorgente configurata.
          </p>
        )}

        {availableAccounts.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Aggiungi sorgente</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="mt5-account">Conto di trading</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="mt5-account">
                    <SelectValue placeholder="Seleziona conto" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mt5-asset">Asset class di default</Label>
                <Select value={assetClass} onValueChange={setAssetClass}>
                  <SelectTrigger id="mt5-asset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CLASSES.map((ac) => (
                      <SelectItem key={ac} value={ac}>
                        {ac}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mt5-path">Percorso del file scritto dall&apos;EA</Label>
              <Input
                id="mt5-path"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="C:\Users\tu\AppData\Roaming\MetaQuotes\Terminal\Common\Files\tradejournal\51234567.ndjson"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Default EA: <code className="font-mono">…\MetaQuotes\Terminal\Common\Files\tradejournal\&lt;login&gt;.ndjson</code>{" "}
                — un file per conto MT5.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={pending || !accountId || filePath.trim().length < 3}
                onClick={() =>
                  save({
                    tradingAccountId: accountId,
                    filePath: filePath.trim(),
                    assetClass,
                    enabled: true,
                  })
                }
              >
                {pending ? "Salvataggio…" : "Aggiungi sorgente"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
