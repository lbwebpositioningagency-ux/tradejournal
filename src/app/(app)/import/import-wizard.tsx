"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ArrowLeft, ArrowRight, FileUp, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  buildTradeInput,
  guessMapping,
  CSV_DATE_FORMATS,
  DATE_FORMAT_LABELS,
  FIELD_LABELS,
  IMPORT_TARGET_FIELDS,
  REQUIRED_FIELDS,
  type CsvDateFormat,
  type ImportMapping,
  type ImportTargetField,
} from "@/lib/csv-import";
import {
  importProfileMappingSchema,
  type ImportProfileMapping,
} from "@/lib/validations/import";
import { ASSET_CLASSES, tradeInputSchema, type TradeInput } from "@/lib/validations/trade";
import {
  deleteImportProfileAction,
  importTradesAction,
  saveImportProfileAction,
} from "@/server/import";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const NOT_MAPPED = "__none__";
const PREVIEW_ROWS = 15;
const PREVIEW_ERRORS = 10;

const ASSET_CLASS_LABELS: Record<(typeof ASSET_CLASSES)[number], string> = {
  STOCK: "Azioni",
  FUTURES: "Futures",
  FOREX: "Forex",
  CRYPTO: "Crypto",
  OPTION: "Opzioni",
};

type CsvData = {
  headers: string[];
  rows: Record<string, string | undefined>[];
};

type Profile = { id: string; name: string; mapping: unknown };

export function ImportWizard({
  accounts,
  profiles,
  defaultAccountId,
}: {
  accounts: { id: string; name: string; currency: string }[];
  profiles: Profile[];
  defaultAccountId: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [csv, setCsv] = useState<CsvData | null>(null);
  const [pastedText, setPastedText] = useState("");

  const [columns, setColumns] = useState<Partial<Record<ImportTargetField, string>>>({});
  const [dateFormat, setDateFormat] = useState<CsvDateFormat>("iso");
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [assetClass, setAssetClass] =
    useState<(typeof ASSET_CLASSES)[number]>("FUTURES");
  const [pointValue, setPointValue] = useState("1");
  const [profileName, setProfileName] = useState("");

  const [pending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: { row: number; error: string }[];
  } | null>(null);

  // ── Step 1: sorgente ──────────────────────────────────────────────────

  function loadCsv(text: string) {
    const parsed = Papa.parse<Record<string, string>>(text.trim(), {
      header: true,
      skipEmptyLines: true,
    });
    const headers = parsed.meta.fields ?? [];
    if (headers.length < 2 || parsed.data.length === 0) {
      toast.error("CSV non riconosciuto: servono un'intestazione e almeno una riga");
      return;
    }
    setCsv({ headers, rows: parsed.data });
    setColumns(guessMapping(headers));
    setImportResult(null);
    setStep(2);
  }

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  // ── Step 2: mapping ───────────────────────────────────────────────────

  const currentMapping: ImportMapping = useMemo(
    () => ({ columns, dateFormat }),
    [columns, dateFormat],
  );

  const mappingComplete = REQUIRED_FIELDS.every((field) => columns[field]);

  function applyProfile(profile: Profile) {
    const parsed = importProfileMappingSchema.safeParse(profile.mapping);
    if (!parsed.success) {
      toast.error("Profilo corrotto: impossibile applicarlo");
      return;
    }
    const mapping: ImportProfileMapping = parsed.data;
    // Applica solo le colonne realmente presenti in questo CSV.
    const available = new Set(csv?.headers ?? []);
    const filtered: Partial<Record<ImportTargetField, string>> = {};
    for (const field of IMPORT_TARGET_FIELDS) {
      const column = mapping.columns[field];
      if (column && available.has(column)) filtered[field] = column;
    }
    setColumns(filtered);
    setDateFormat(mapping.dateFormat);
    setAssetClass(mapping.options.assetClass);
    setPointValue(mapping.options.pointValue);
    setProfileName(profile.name);
    toast.success(`Profilo «${profile.name}» applicato`);
  }

  function saveProfile() {
    if (!profileName.trim()) {
      toast.error("Dai un nome al profilo prima di salvarlo");
      return;
    }
    startTransition(async () => {
      const result = await saveImportProfileAction({
        name: profileName,
        mapping: { columns, dateFormat, options: { assetClass, pointValue } },
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Profilo salvato");
        router.refresh();
      }
    });
  }

  function deleteProfile(profile: Profile) {
    startTransition(async () => {
      const result = await deleteImportProfileAction(profile.id);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Profilo eliminato");
        router.refresh();
      }
    });
  }

  // ── Step 3: anteprima + import ────────────────────────────────────────

  const preview = useMemo(() => {
    if (!csv || !mappingComplete) return null;
    const valid: TradeInput[] = [];
    const errors: { row: number; error: string }[] = [];

    csv.rows.forEach((row, index) => {
      const built = buildTradeInput(row, currentMapping, {
        tradingAccountId: accountId,
        assetClass,
        pointValue,
      });
      if (!built.ok) {
        errors.push({ row: index + 1, error: built.error });
        return;
      }
      const parsed = tradeInputSchema.safeParse(built.input);
      if (!parsed.success) {
        errors.push({
          row: index + 1,
          error: parsed.error.issues[0]?.message ?? "Riga non valida",
        });
        return;
      }
      valid.push(built.input);
    });

    return { valid, errors };
  }, [csv, currentMapping, mappingComplete, accountId, assetClass, pointValue]);

  function runImport() {
    if (!preview || preview.valid.length === 0) return;
    startTransition(async () => {
      const result = await importTradesAction(accountId, preview.valid);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setImportResult({ imported: result.imported, failed: result.failed });
      toast.success(`Importati ${result.imported} trade`);
      router.refresh();
    });
  }

  const accountLabel =
    accounts.find((a) => a.id === accountId)?.name ?? "conto selezionato";

  // ───────────────────────────────────────────────────────────────────────

  if (importResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import completato</CardTitle>
          <CardDescription>
            {importResult.imported} trade importati in «{accountLabel}»
            {importResult.failed.length > 0
              ? ` · ${importResult.failed.length} righe scartate`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {importResult.failed.length > 0 ? (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {importResult.failed.slice(0, PREVIEW_ERRORS).map((f) => (
                <li key={f.row}>
                  Riga {f.row}: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-3">
            <Button onClick={() => router.push("/trades")}>Vai ai trade</Button>
            <Button
              variant="outline"
              onClick={() => {
                setImportResult(null);
                setCsv(null);
                setPastedText("");
                setStep(1);
              }}
            >
              Nuovo import
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1 — sorgente */}
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1 · Sorgente CSV</CardTitle>
            <CardDescription>
              Carica il file esportato dal broker oppure incolla il contenuto. La prima
              riga deve contenere le intestazioni; una riga = un trade.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFileSelected(e.target.files?.[0])}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="size-4" />
                Scegli file CSV
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="csv-paste">…oppure incolla qui</Label>
              <Textarea
                id="csv-paste"
                rows={8}
                className="font-mono text-xs"
                placeholder={
                  "Symbol,Side,Qty,Entry Price,Exit Price,Entry Time,Exit Time,Fee\nES,long,2,5000.25,5010.25,2026-07-15 09:30,2026-07-15 10:15,8.40"
                }
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
              />
              <Button
                className="self-start"
                disabled={!pastedText.trim()}
                onClick={() => loadCsv(pastedText)}
              >
                <ArrowRight className="size-4" />
                Continua con il testo incollato
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 2 — mapping */}
      {step === 2 && csv ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2 · Mappa le colonne</CardTitle>
              <CardDescription>
                {csv.rows.length} righe lette · colonne trovate:{" "}
                {csv.headers.join(", ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {IMPORT_TARGET_FIELDS.map((field) => (
                <div key={field} className="grid gap-2">
                  <Label>
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </Label>
                  <Select
                    value={columns[field] ?? NOT_MAPPED}
                    onValueChange={(v) =>
                      setColumns((prev) => ({
                        ...prev,
                        [field]: v === NOT_MAPPED ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_MAPPED}>— non mappata —</SelectItem>
                      {csv.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opzioni</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Conto di destinazione</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Formato date</Label>
                <Select
                  value={dateFormat}
                  onValueChange={(v) => setDateFormat(v as CsvDateFormat)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CSV_DATE_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {DATE_FORMAT_LABELS[format]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Asset class</Label>
                <Select
                  value={assetClass}
                  onValueChange={(v) => setAssetClass(v as (typeof ASSET_CLASSES)[number])}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CLASSES.map((ac) => (
                      <SelectItem key={ac} value={ac}>
                        {ASSET_CLASS_LABELS[ac]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="import-point-value">Valore punto</Label>
                <Input
                  id="import-point-value"
                  inputMode="decimal"
                  value={pointValue}
                  onChange={(e) => setPointValue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Applicato a tutte le righe (ES=50, lotto forex=100000…)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profili di mapping</CardTitle>
              <CardDescription>
                Salva questa configurazione per riusarla al prossimo export dello stesso
                broker.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {profiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profiles.map((profile) => (
                    <span key={profile.id} className="inline-flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => applyProfile(profile)}
                        disabled={pending}
                      >
                        {profile.name}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Elimina profilo ${profile.name}`}
                        onClick={() => deleteProfile(profile)}
                        disabled={pending}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun profilo salvato.</p>
              )}
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="profile-name">Nome profilo</Label>
                  <Input
                    id="profile-name"
                    placeholder="Es. Export NinjaTrader"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={saveProfile} disabled={pending}>
                  <Save className="size-4" />
                  Salva profilo
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" />
              Indietro
            </Button>
            <Button onClick={() => setStep(3)} disabled={!mappingComplete}>
              Anteprima
              <ArrowRight className="size-4" />
            </Button>
          </div>
          {!mappingComplete ? (
            <p className="text-right text-sm text-muted-foreground">
              Mappa tutte le colonne obbligatorie (*) per continuare.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Step 3 — anteprima */}
      {step === 3 && csv && preview ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3 · Anteprima</CardTitle>
              <CardDescription>
                <Badge variant="secondary" className="mr-2">
                  {preview.valid.length} righe valide
                </Badge>
                {preview.errors.length > 0 ? (
                  <Badge variant="outline" className="text-loss">
                    {preview.errors.length} righe con errori (verranno saltate)
                  </Badge>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {preview.errors.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {preview.errors.slice(0, PREVIEW_ERRORS).map((e) => (
                    <li key={e.row}>
                      Riga {e.row}: {e.error}
                    </li>
                  ))}
                  {preview.errors.length > PREVIEW_ERRORS ? (
                    <li>…e altre {preview.errors.length - PREVIEW_ERRORS}</li>
                  ) : null}
                </ul>
              ) : null}

              {preview.valid.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Simbolo</TableHead>
                        <TableHead>Direzione</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead>Ingresso</TableHead>
                        <TableHead>Uscita</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.valid.slice(0, PREVIEW_ROWS).map((trade, i) => {
                        const entry = trade.executions[0];
                        const exit = trade.executions[1];
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              {trade.symbol.toUpperCase()}
                            </TableCell>
                            <TableCell>
                              {entry.side === "BUY" ? "LONG" : "SHORT"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {entry.quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {entry.price}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {exit?.price ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {entry.executedAt.replace("T", " ")}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {exit?.executedAt.replace("T", " ") ?? "— (aperto)"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {entry.fee}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {preview.valid.length > PREVIEW_ROWS ? (
                    <p className="border-t p-2 text-center text-xs text-muted-foreground">
                      …e altre {preview.valid.length - PREVIEW_ROWS} righe
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessuna riga valida: controlla mapping e formato date.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(2)} disabled={pending}>
              <ArrowLeft className="size-4" />
              Torna al mapping
            </Button>
            <Button
              onClick={runImport}
              disabled={pending || preview.valid.length === 0}
            >
              <Upload className="size-4" />
              {pending
                ? "Import in corso…"
                : `Importa ${preview.valid.length} trade in «${accountLabel}»`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
