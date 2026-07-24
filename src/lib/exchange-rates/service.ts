import { getDbForBindings } from "@/lib/db";
import { exchangeRates, settings } from "@/lib/db/schema";
import { SETTINGS_KEYS, SYSTEM_DEFAULTS } from "@/lib/app-config";

export type FxSource = "paralelo" | "bcv" | "manual";
export type FxCurrencyCode = "USD" | "EUR";

type DbLike = ReturnType<typeof getDbForBindings>;

type DolarApiCurrentResponse = {
  fuente?: string | null;
  nombre?: string | null;
  moneda?: string | null;
  compra?: number | null;
  venta?: number | null;
  promedio?: number | null;
  fechaActualizacion?: string | null;
};

type DolarApiHistoricalResponse = {
  fuente?: string | null;
  moneda?: string | null;
  compra?: number | null;
  venta?: number | null;
  promedio?: number | null;
  fecha?: string | null;
};

type ExchangeRateRow = typeof exchangeRates.$inferSelect;

type FxSnapshotInput = {
  date: string;
  currencyCode: FxCurrencyCode;
  source: FxSource;
  rate: number;
  provider: string;
  displayName: string;
  buy?: number | null;
  sell?: number | null;
  average?: number | null;
  externalUpdatedAt?: string | null;
};

const DOLAR_API_BASE_URL = "https://ve.dolarapi.com";
const HISTORY_LIMIT = 60;

const QUOTES: Array<{
  currencyCode: FxCurrencyCode;
  source: Exclude<FxSource, "manual">;
  currentPath: string;
  historyPath: string;
  displayName: string;
}> = [
  {
    currencyCode: "USD",
    source: "paralelo",
    currentPath: "/v1/dolares/paralelo",
    historyPath: "/v1/historicos/dolares/paralelo",
    displayName: "Dolar Paralelo",
  },
  {
    currencyCode: "USD",
    source: "bcv",
    currentPath: "/v1/dolares/oficial",
    historyPath: "/v1/historicos/dolares/oficial",
    displayName: "Dolar BCV",
  },
  {
    currencyCode: "EUR",
    source: "paralelo",
    currentPath: "/v1/euros/paralelo",
    historyPath: "/v1/historicos/euros/paralelo",
    displayName: "Euro Paralelo",
  },
  {
    currencyCode: "EUR",
    source: "bcv",
    currentPath: "/v1/euros/oficial",
    historyPath: "/v1/historicos/euros/oficial",
    displayName: "Euro BCV",
  },
];

function toDateOnly(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function resolveRateValue(input: {
  promedio?: number | null;
  venta?: number | null;
  compra?: number | null;
}) {
  const candidates = [input.promedio, input.venta, input.compra]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (candidates.length === 0) {
    throw new Error("La respuesta de DolarAPI no contiene una tasa valida.");
  }

  return candidates[0];
}

function getRateSettingKey(currencyCode: FxCurrencyCode, source: Exclude<FxSource, "manual">) {
  if (currencyCode === "USD" && source === "paralelo") return SETTINGS_KEYS.parallelRate;
  if (currencyCode === "USD" && source === "bcv") return SETTINGS_KEYS.bcvRate;
  if (currencyCode === "EUR" && source === "paralelo") return SETTINGS_KEYS.euroParallelRate;
  return SETTINGS_KEYS.euroBcvRate;
}

function getFallbackRate(currencyCode: FxCurrencyCode, source: Exclude<FxSource, "manual">) {
  if (currencyCode === "USD" && source === "paralelo") return SYSTEM_DEFAULTS.rates.paralelo;
  if (currencyCode === "USD" && source === "bcv") return SYSTEM_DEFAULTS.rates.bcv;
  if (currencyCode === "EUR" && source === "paralelo") return SYSTEM_DEFAULTS.rates.euroParalelo;
  return SYSTEM_DEFAULTS.rates.euroBcv;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DOLAR_API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`DolarAPI respondio ${res.status} al consultar ${path}.`);
  }

  return res.json() as Promise<T>;
}

function getSnapshotKey(snapshot: FxSnapshotInput) {
  return [
    snapshot.date,
    snapshot.currencyCode,
    snapshot.source,
    snapshot.provider,
    snapshot.rate.toFixed(6),
  ].join("|");
}

function formatSyncStatus(status: "ok" | "fallback" | "error", detail: string) {
  return `${status}:${detail}`.slice(0, 240);
}

function mapCurrentResponse(
  quote: (typeof QUOTES)[number],
  input: DolarApiCurrentResponse
): FxSnapshotInput {
  return {
    date: toDateOnly(input.fechaActualizacion),
    currencyCode: quote.currencyCode,
    source: quote.source,
    rate: resolveRateValue(input),
    provider: "dolarapi",
    displayName: quote.displayName,
    buy: input.compra ?? null,
    sell: input.venta ?? null,
    average: input.promedio ?? null,
    externalUpdatedAt: input.fechaActualizacion ?? null,
  };
}

function mapHistoricalResponse(
  quote: (typeof QUOTES)[number],
  input: DolarApiHistoricalResponse
): FxSnapshotInput {
  return {
    date: toDateOnly(input.fecha),
    currencyCode: quote.currencyCode,
    source: quote.source,
    rate: resolveRateValue(input),
    provider: "dolarapi",
    displayName: quote.displayName,
    buy: input.compra ?? null,
    sell: input.venta ?? null,
    average: input.promedio ?? null,
    externalUpdatedAt: input.fecha ?? null,
  };
}

async function loadExistingRateKeys(db: DbLike) {
  const rows = await db.select().from(exchangeRates);
  return new Set(
    rows.map((row: ExchangeRateRow) =>
      getSnapshotKey({
        date: row.date,
        currencyCode: row.currencyCode as FxCurrencyCode,
        source: row.source as FxSource,
        rate: row.rate,
        provider: row.provider,
        displayName: row.displayName,
      })
    )
  );
}

async function persistSnapshots(db: DbLike, snapshots: FxSnapshotInput[]) {
  if (snapshots.length === 0) return 0;

  const existingKeys = await loadExistingRateKeys(db);
  let inserted = 0;

  for (const snapshot of snapshots) {
    if (!Number.isFinite(snapshot.rate) || snapshot.rate <= 0) continue;

    const dedupeKey = getSnapshotKey(snapshot);
    if (existingKeys.has(dedupeKey)) continue;

    await db.insert(exchangeRates).values({
      date: snapshot.date,
      rate: snapshot.rate,
      source: snapshot.source,
      currencyCode: snapshot.currencyCode,
      provider: snapshot.provider,
      displayName: snapshot.displayName,
      buy: snapshot.buy ?? null,
      sell: snapshot.sell ?? null,
      average: snapshot.average ?? null,
      externalUpdatedAt: snapshot.externalUpdatedAt ?? null,
    });
    existingKeys.add(dedupeKey);
    inserted += 1;
  }

  return inserted;
}

async function upsertSetting(db: DbLike, key: string, value: string) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    });
}

async function updateRateSettings(db: DbLike, snapshots: FxSnapshotInput[]) {
  for (const quote of QUOTES) {
    const currentSnapshot = snapshots.find(
      (snapshot) =>
        snapshot.currencyCode === quote.currencyCode &&
        snapshot.source === quote.source &&
        snapshot.provider !== "manual"
    );
    if (!currentSnapshot) continue;

    await upsertSetting(
      db,
      getRateSettingKey(quote.currencyCode, quote.source),
      String(currentSnapshot.rate)
    );
  }
}

export async function fetchCurrentDolarApiSnapshots() {
  const responses = await Promise.all(
    QUOTES.map(async (quote) => mapCurrentResponse(quote, await fetchJson<DolarApiCurrentResponse>(quote.currentPath)))
  );

  return responses;
}

export async function fetchHistoricalDolarApiSnapshots(limit = HISTORY_LIMIT) {
  const responses = await Promise.all(
    QUOTES.map(async (quote) => {
      const series = await fetchJson<DolarApiHistoricalResponse[]>(quote.historyPath);
      return series.slice(-limit).map((row) => mapHistoricalResponse(quote, row));
    })
  );

  return responses.flat();
}

export async function getLatestStoredRates(bindings?: { DB?: unknown } | null) {
  const db = getDbForBindings(bindings);
  const rows = await db.select().from(exchangeRates);
  const latestMap = new Map<string, ExchangeRateRow>();

  for (const row of rows as ExchangeRateRow[]) {
    const key = `${row.currencyCode}:${row.source}`;
    const current = latestMap.get(key);
    if (!current || row.id > current.id) {
      latestMap.set(key, row);
    }
  }

  return latestMap;
}

export async function getExchangeRatesOverview(bindings?: { DB?: unknown } | null) {
  const db = getDbForBindings(bindings);
  const [ratesRows, settingsRows] = await Promise.all([
    db.select().from(exchangeRates),
    db.select().from(settings),
  ]);

  const settingsMap = new Map<string, string>(
    settingsRows.map((row: typeof settings.$inferSelect) => [row.key, row.value])
  );
  const latestMap = new Map<string, ExchangeRateRow>();
  const dateMap = new Map<string, Record<string, number>>();
  const sortedRows = [...(ratesRows as ExchangeRateRow[])].sort((a, b) => a.id - b.id);

  for (const row of sortedRows) {
    const currentKey = `${row.currencyCode}:${row.source}`;
    latestMap.set(currentKey, row);

    const dayRecord = dateMap.get(row.date) || {};
    dayRecord[currentKey] = row.rate;
    dateMap.set(row.date, dayRecord);
  }

  const current = {
    USD: {
      paralelo: latestMap.get("USD:paralelo") || null,
      bcv: latestMap.get("USD:bcv") || null,
    },
    EUR: {
      paralelo: latestMap.get("EUR:paralelo") || null,
      bcv: latestMap.get("EUR:bcv") || null,
    },
  };

  for (const quote of QUOTES) {
    const key = `${quote.currencyCode}:${quote.source}`;
    if (latestMap.has(key)) continue;

    const fallbackRate = Number.parseFloat(
      settingsMap.get(getRateSettingKey(quote.currencyCode, quote.source)) || ""
    );
    const rate = Number.isFinite(fallbackRate)
      ? fallbackRate
      : getFallbackRate(quote.currencyCode, quote.source);

    const fallbackRow = {
      id: 0,
      date: new Date().toISOString().slice(0, 10),
      rate,
      source: quote.source,
      currencyCode: quote.currencyCode,
      provider: "fallback",
      displayName: quote.displayName,
      buy: null,
      sell: null,
      average: rate,
      externalUpdatedAt: null,
      createdAt: "",
    } as ExchangeRateRow;

    latestMap.set(key, fallbackRow);
    if (quote.currencyCode === "USD") {
      current.USD[quote.source] = fallbackRow;
    } else {
      current.EUR[quote.source] = fallbackRow;
    }
  }

  const history = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-HISTORY_LIMIT)
    .map(([date, values]) => ({
      date,
      usdParalelo: values["USD:paralelo"] ?? null,
      usdBcv: values["USD:bcv"] ?? null,
      eurParalelo: values["EUR:paralelo"] ?? null,
      eurBcv: values["EUR:bcv"] ?? null,
    }));

  return {
    current,
    history,
    meta: {
      lastSyncAt: settingsMap.get(SETTINGS_KEYS.lastRatesSyncAt) || null,
      lastSyncStatus: settingsMap.get(SETTINGS_KEYS.lastRatesSyncStatus) || null,
    },
  };
}

// Binance P2P blocks Cloudflare datacenter IPs (403). CriptoYa relays the live
// Binance P2P USDT/VES book from a non-blocked IP, so we read the Binance rate
// through it. `ask` = price to BUY USDT (matches the original tradeType:"BUY").
const CRIPTOYA_BINANCE_URL = "https://criptoya.com/api/binancep2p/USDT/VES/1";

// Business markup applied on top of the live Binance P2P parallel rate. The
// stored/used parallel rate is the Binance price +3%.
const BINANCE_PARALLEL_MARKUP = 0.03;

/**
 * Live parallel USD rate = Binance P2P (USDT/VES, buy side), via the CriptoYa
 * relay so it works from the Cloudflare Worker, with a +3% business markup.
 */
export async function fetchBinanceParallelRate(): Promise<number> {
  const res = await fetch(CRIPTOYA_BINANCE_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; KUniformes/1.0)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`CriptoYa (Binance P2P) respondio ${res.status}.`);
  }
  const json = (await res.json()) as { ask?: number; totalAsk?: number; bid?: number };
  const price = Number(json?.ask ?? json?.totalAsk ?? json?.bid);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Precio invalido recibido de Binance P2P (CriptoYa).");
  }
  // Apply the +3% business markup, rounded to 2 decimals for clean storage/display.
  return Math.round(price * (1 + BINANCE_PARALLEL_MARKUP) * 100) / 100;
}

export async function syncDolarApiRates(options?: {
  bindings?: { DB?: unknown } | null;
  includeHistory?: boolean;
}) {
  const db = getDbForBindings(options?.bindings);

  try {
    const currentSnapshots = await fetchCurrentDolarApiSnapshots();

    // Live USD parallel rate now comes from Binance P2P. The historical series
    // (chart) stays on DolarAPI; only the current parallel point is overridden.
    let binanceNote = "binance:skip";
    try {
      const binanceRate = await fetchBinanceParallelRate();
      for (let i = 0; i < currentSnapshots.length; i += 1) {
        const s = currentSnapshots[i];
        if (s.currencyCode === "USD" && s.source === "paralelo") {
          currentSnapshots[i] = {
            ...s,
            date: toDateOnly(null),
            rate: binanceRate,
            provider: "binance",
            displayName: "Dolar Paralelo (Binance)",
            buy: null,
            sell: binanceRate,
            average: binanceRate,
            externalUpdatedAt: new Date().toISOString(),
          };
        }
      }
      binanceNote = `binance:${binanceRate.toFixed(3)}`;
    } catch (binanceError) {
      // Keep the DolarAPI parallel current snapshot as fallback.
      const msg = binanceError instanceof Error ? binanceError.message : "error";
      binanceNote = `binance_fallback:${msg.slice(0, 40)}`;
    }

    const historySnapshots = options?.includeHistory
      ? await fetchHistoricalDolarApiSnapshots()
      : [];
    const inserted = await persistSnapshots(db, [...historySnapshots, ...currentSnapshots]);

    await updateRateSettings(db, currentSnapshots);
    await upsertSetting(db, SETTINGS_KEYS.defaultRateSource, "paralelo");
    await upsertSetting(db, SETTINGS_KEYS.lastRatesSyncAt, new Date().toISOString());
    await upsertSetting(
      db,
      SETTINGS_KEYS.lastRatesSyncStatus,
      formatSyncStatus("ok", `${binanceNote};dolarapi:${inserted}`)
    );

    return {
      success: true as const,
      inserted,
      currentSnapshots,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Sin detalle";
    await upsertSetting(db, SETTINGS_KEYS.lastRatesSyncAt, new Date().toISOString());
    await upsertSetting(
      db,
      SETTINGS_KEYS.lastRatesSyncStatus,
      formatSyncStatus("fallback", msg)
    );

    return {
      success: false as const,
      error: msg || "No se pudieron sincronizar las tasas.",
    };
  }
}

export async function saveManualRates(
  inputs: Array<{
    currencyCode: FxCurrencyCode;
    source: Exclude<FxSource, "manual">;
    rate: number;
  }>,
  bindings?: { DB?: unknown } | null
) {
  const db = getDbForBindings(bindings);
  const today = new Date().toISOString().slice(0, 10);
  const snapshots: FxSnapshotInput[] = inputs
    .filter((item) => Number.isFinite(item.rate) && item.rate > 0)
    .map((item) => ({
      date: today,
      currencyCode: item.currencyCode,
      source: item.source,
      rate: item.rate,
      provider: "manual",
      displayName:
        item.currencyCode === "USD"
          ? item.source === "paralelo"
            ? "Dolar Paralelo"
            : "Dolar BCV"
          : item.source === "paralelo"
            ? "Euro Paralelo"
            : "Euro BCV",
      buy: item.rate,
      sell: item.rate,
      average: item.rate,
      externalUpdatedAt: null,
    }));

  const inserted = await persistSnapshots(db, snapshots);

  for (const snapshot of snapshots) {
    await upsertSetting(
      db,
      getRateSettingKey(snapshot.currencyCode, snapshot.source as Exclude<FxSource, "manual">),
      String(snapshot.rate)
    );
  }

  await upsertSetting(db, SETTINGS_KEYS.defaultRateSource, "paralelo");
  await upsertSetting(db, SETTINGS_KEYS.lastRatesSyncAt, new Date().toISOString());
  await upsertSetting(
    db,
    SETTINGS_KEYS.lastRatesSyncStatus,
    formatSyncStatus("ok", `manual:${inserted}`)
  );

  return { success: true as const, inserted };
}

export async function getTransactionParallelRate(bindings?: { DB?: unknown } | null) {
  return getTransactionRate("paralelo", bindings);
}

export async function getTransactionRate(
  rateSource: Exclude<FxSource, "manual">,
  bindings?: { DB?: unknown } | null
) {
  const overview = await getExchangeRatesOverview(bindings);
  if (rateSource === "bcv") {
    return overview.current.USD.bcv?.rate || SYSTEM_DEFAULTS.rates.bcv;
  }

  return overview.current.USD.paralelo?.rate || SYSTEM_DEFAULTS.rates.paralelo;
}

export function normalizeTransactionRate(
  rateSource: FxSource,
  rateUsed: number,
  fallbackRate: number
) {
  if (!Number.isFinite(rateUsed) || rateUsed <= 0) {
    if (rateSource === "manual") {
      throw new Error("Debe indicar una tasa manual valida para la transaccion.");
    }

    return fallbackRate;
  }

  return rateUsed;
}

export function convertToUsd(amountOriginal: number, currency: string, rateUsed: number) {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (normalizedCurrency === "BS" || normalizedCurrency === "VES") {
    if (!Number.isFinite(rateUsed) || rateUsed <= 0) {
      throw new Error("La tasa usada para convertir bolivares debe ser mayor a cero.");
    }
    return amountOriginal / rateUsed;
  }

  return amountOriginal;
}

export function isBolivarCurrency(currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  return normalizedCurrency === "BS" || normalizedCurrency === "VES";
}
