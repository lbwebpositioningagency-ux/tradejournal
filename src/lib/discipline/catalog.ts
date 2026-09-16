/**
 * CATALOGO DELLE REGOLE DI DISCIPLINA — Progress Tracker.
 *
 * Insieme chiuso: ogni regola è verificabile dall'app leggendo i campi dei
 * trade, nessuna è dichiarata dall'utente. Il catalogo è l'unica fonte del
 * significato di un tipo: quale campo lo alimenta, a quale giornata si
 * attribuisce, con che soglia parte.
 *
 * Le soglie di partenza sono PUNTI DI PARTENZA misurati sul conto demo SIM1
 * (censimento del 16/09/2026), non valori imposti: l'utente le cambia dalla
 * configurazione, e la pagina lo dice.
 *
 * Modulo puro, importabile anche dai client component: i tipi ricalcano
 * l'enum Prisma `DisciplineRuleType` (un test controlla che coincidano).
 */

export const DISCIPLINE_RULE_TYPES = [
  "STOP_PRESENT",
  "STOP_RESPECTED",
  "MAX_LOSS_PER_TRADE",
  "MAX_DAILY_LOSS",
  "MAX_TRADES_PER_DAY",
  "MAX_PLANNED_RISK",
  "MIN_TARGET_R",
  "TRADING_HOURS",
  "COOLDOWN_AFTER_LOSS",
  "MAX_CONSECUTIVE_LOSSES",
  "MAX_OPEN_POSITIONS",
  "MAX_QUANTITY_PER_SYMBOL",
] as const;

export type DisciplineRuleType = (typeof DISCIPLINE_RULE_TYPES)[number];

/** Sessioni selezionabili per l'orario operativo (chiavi di `lib/sessions.ts`). */
export const RULE_SESSIONS = ["ASIA", "LONDON", "NEWYORK", "OFF"] as const;
export type RuleSession = (typeof RULE_SESSIONS)[number];

/**
 * Giornata a cui si attribuisce la regola (decisione del 16/09/2026):
 * - OPEN: giorno di APERTURA — è lì che si decide di entrare (stop, rischio,
 *   R/R, orario, numero di trade, pausa, posizioni, size);
 * - CLOSE: giorno di CHIUSURA — le regole sulle perdite, come il resto dell'app.
 */
export type RuleDayBasis = "OPEN" | "CLOSE";

/** Che parametro ha la regola: guida form, validazione e valutazione. */
export type RuleParamKind =
  | "none"
  | "r"
  | "count"
  | "minutes"
  | "currency"
  | "sessions"
  | "symbol";

export interface RuleDefinition {
  type: DisciplineRuleType;
  /** Nome breve (tabella «Regole correnti»). */
  label: string;
  /** Cosa verifica, in una frase, con il campo che la alimenta. */
  description: string;
  /** Campo del trade da cui si legge. */
  field: string;
  dayBasis: RuleDayBasis;
  paramKind: RuleParamKind;
  /** Attiva senza che l'utente l'abbia configurata. */
  activeByDefault: boolean;
  /**
   * La regola è DEFINITA sul risultato (una perdita): confrontarla con i
   * rendimenti è circolare, la violazione è una perdita per costruzione. La
   * sezione comportamento→rendimenti la esclude dai confronti e lo dichiara.
   */
  outcomeBased: boolean;
  /** Quando la giornata non conta per la regola. */
  notApplicable: string;
  /** Avvertenza di lettura, se serve. */
  note?: string;
}

export interface RuleDefaults {
  isActive: boolean;
  rValue: string | null;
  countValue: number | null;
  minutesValue: number | null;
  sessions: RuleSession[];
  allowWeekend: boolean;
  /** Soglie per valuta (importi come stringhe decimali). */
  currencyLimits: { currency: string; amount: string }[];
  symbolLimits: { symbol: string; quantity: string }[];
}

export const RULE_CATALOG: Record<DisciplineRuleType, RuleDefinition> = {
  STOP_PRESENT: {
    type: "STOP_PRESENT",
    label: "Stop presente",
    description: "Ogni trade aperto nella giornata ha uno stop pianificato valido (dal lato giusto dell'ingresso).",
    field: "plannedStop",
    dayBasis: "OPEN",
    paramKind: "none",
    activeByDefault: true,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti.",
    note: "Un trade reale può risultare senza stop anche perché l'import MT5 non esporta lo stop loss, non solo per una scelta di comportamento: in quel caso la violazione si toglie inserendo lo stop nel trade.",
  },
  STOP_RESPECTED: {
    type: "STOP_RESPECTED",
    label: "Perdita entro lo stop",
    description: "Nessun trade in perdita è uscito oltre lo stop pianificato di più della tolleranza, misurata in R sui prezzi.",
    field: "avgExitPrice · plannedStop",
    dayBasis: "CLOSE",
    paramKind: "r",
    activeByDefault: true,
    outcomeBased: true,
    notApplicable: "Giornata senza trade chiusi in perdita con uno stop valido: con soli trade in utile non c'è uno stop da rispettare.",
    note: "Dai dati non si distingue lo stop spostato dal gap che lo salta: entrambi contano come stop non rispettato.",
  },
  MAX_LOSS_PER_TRADE: {
    type: "MAX_LOSS_PER_TRADE",
    label: "Perdita massima per trade",
    description: "Nessun trade chiuso nella giornata ha perso più della soglia, al netto di commissioni e swap.",
    field: "netPnl",
    dayBasis: "CLOSE",
    paramKind: "currency",
    activeByDefault: true,
    outcomeBased: true,
    notApplicable: "Giornata senza trade chiusi, o valuta senza soglia impostata.",
  },
  MAX_DAILY_LOSS: {
    type: "MAX_DAILY_LOSS",
    label: "Perdita massima giornaliera",
    description: "Il P&L netto dei trade chiusi nella giornata non scende sotto la soglia.",
    field: "netPnl (somma del giorno)",
    dayBasis: "CLOSE",
    paramKind: "currency",
    activeByDefault: true,
    outcomeBased: true,
    notApplicable: "Giornata senza trade chiusi, o valuta senza soglia impostata.",
  },
  MAX_TRADES_PER_DAY: {
    type: "MAX_TRADES_PER_DAY",
    label: "Trade massimi al giorno",
    description: "Il numero di trade aperti nella giornata non supera il massimo.",
    field: "openedAt",
    dayBasis: "OPEN",
    paramKind: "count",
    activeByDefault: true,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti.",
  },
  MAX_PLANNED_RISK: {
    type: "MAX_PLANNED_RISK",
    label: "Rischio pianificato massimo",
    description: "Nessun trade aperto nella giornata ha un rischio pianificato superiore alla soglia.",
    field: "initialRisk",
    dayBasis: "OPEN",
    paramKind: "currency",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti con rischio pianificato, o valuta senza soglia impostata.",
  },
  MIN_TARGET_R: {
    type: "MIN_TARGET_R",
    label: "R/R minimo del piano",
    description: "Ogni trade aperto con stop e target ha un rapporto rendimento/rischio pianificato almeno pari al minimo.",
    field: "targetR",
    dayBasis: "OPEN",
    paramKind: "r",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti con stop e target validi.",
  },
  TRADING_HOURS: {
    type: "TRADING_HOURS",
    label: "Orario operativo",
    description: "Ogni trade è aperto in una delle sessioni ammesse (ora italiana) e, salvo diversa scelta, non nel weekend.",
    field: "openedAt",
    dayBasis: "OPEN",
    paramKind: "sessions",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti.",
  },
  COOLDOWN_AFTER_LOSS: {
    type: "COOLDOWN_AFTER_LOSS",
    label: "Pausa dopo una perdita",
    description: "Nessun trade è aperto entro i minuti di pausa dalla chiusura di un trade in perdita.",
    field: "openedAt · closedAt · netPnl",
    dayBasis: "OPEN",
    paramKind: "minutes",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata in cui nessuna apertura segue una perdita chiusa lo stesso giorno o entro la pausa.",
  },
  MAX_CONSECUTIVE_LOSSES: {
    type: "MAX_CONSECUTIVE_LOSSES",
    label: "Perdite consecutive nel giorno",
    description: "Nella giornata i trade chiusi in perdita uno dopo l'altro non superano il massimo.",
    field: "closedAt · netPnl",
    dayBasis: "CLOSE",
    paramKind: "count",
    activeByDefault: false,
    outcomeBased: true,
    notApplicable: "Giornata senza trade chiusi.",
  },
  MAX_OPEN_POSITIONS: {
    type: "MAX_OPEN_POSITIONS",
    label: "Posizioni aperte insieme",
    description: "Al momento di ogni apertura, le posizioni aperte contemporaneamente (compresa la nuova) non superano il massimo.",
    field: "openedAt · closedAt",
    dayBasis: "OPEN",
    paramKind: "count",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti.",
  },
  MAX_QUANTITY_PER_SYMBOL: {
    type: "MAX_QUANTITY_PER_SYMBOL",
    label: "Size massima per simbolo",
    description: "Nessun trade aperto supera la quantità massima impostata per il suo simbolo.",
    field: "quantity · symbol",
    dayBasis: "OPEN",
    paramKind: "symbol",
    activeByDefault: false,
    outcomeBased: false,
    notApplicable: "Giornata senza trade aperti su simboli con una quantità massima impostata.",
    note: "Contratti e lotti non si confrontano fra simboli diversi: la soglia è per simbolo, e nessun simbolo ne ha una finché non la imposti.",
  },
};

/**
 * Soglie di partenza (decisione del 16/09/2026, sui numeri misurati su SIM1).
 * Le soglie in valuta partono solo in USD: per un'altra valuta la regola
 * resta senza soglia — quindi non applicabile — finché non la imposti.
 */
export const RULE_DEFAULTS: Record<DisciplineRuleType, RuleDefaults> = {
  STOP_PRESENT: base(true),
  STOP_RESPECTED: { ...base(true), rValue: "0.1" },
  MAX_LOSS_PER_TRADE: { ...base(true), currencyLimits: [{ currency: "USD", amount: "700.00" }] },
  MAX_DAILY_LOSS: { ...base(true), currencyLimits: [{ currency: "USD", amount: "1000.00" }] },
  MAX_TRADES_PER_DAY: { ...base(true), countValue: 5 },
  MAX_PLANNED_RISK: { ...base(false), currencyLimits: [{ currency: "USD", amount: "500.00" }] },
  MIN_TARGET_R: { ...base(false), rValue: "1" },
  TRADING_HOURS: { ...base(false), sessions: ["ASIA", "LONDON", "NEWYORK"] },
  COOLDOWN_AFTER_LOSS: { ...base(false), minutesValue: 15 },
  MAX_CONSECUTIVE_LOSSES: { ...base(false), countValue: 3 },
  MAX_OPEN_POSITIONS: { ...base(false), countValue: 2 },
  MAX_QUANTITY_PER_SYMBOL: base(false),
};

function base(isActive: boolean): RuleDefaults {
  return {
    isActive,
    rValue: null,
    countValue: null,
    minutesValue: null,
    sessions: [],
    allowWeekend: false,
    currencyLimits: [],
    symbolLimits: [],
  };
}

/** Regola effettiva: catalogo + eventuale configurazione salvata. */
export interface EffectiveRule extends RuleDefaults {
  type: DisciplineRuleType;
  /** False = l'utente non l'ha mai toccata: valgono i valori di partenza. */
  customized: boolean;
}

/** Riga salvata, già serializzata (Decimal → stringa). */
export interface StoredRule {
  type: DisciplineRuleType;
  isActive: boolean;
  rValue: string | null;
  countValue: number | null;
  minutesValue: number | null;
  sessions: string[];
  allowWeekend: boolean;
  currencyLimits: { currency: string; amount: string }[];
  symbolLimits: { symbol: string; quantity: string }[];
}

function isRuleSession(value: string): value is RuleSession {
  return (RULE_SESSIONS as readonly string[]).includes(value);
}

/** Le dodici regole nell'ordine del catalogo, con la configurazione dell'utente sopra i default. */
export function effectiveRules(stored: StoredRule[]): EffectiveRule[] {
  const byType = new Map(stored.map((s) => [s.type, s]));
  return DISCIPLINE_RULE_TYPES.map((type) => {
    const saved = byType.get(type);
    if (!saved) return { type, customized: false, ...RULE_DEFAULTS[type] };
    return {
      type,
      customized: true,
      isActive: saved.isActive,
      rValue: saved.rValue,
      countValue: saved.countValue,
      minutesValue: saved.minutesValue,
      sessions: saved.sessions.filter(isRuleSession),
      allowWeekend: saved.allowWeekend,
      currencyLimits: [...saved.currencyLimits].sort((a, b) => a.currency.localeCompare(b.currency)),
      symbolLimits: [...saved.symbolLimits].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    };
  });
}
