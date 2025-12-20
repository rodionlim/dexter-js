import YahooFinance from 'yahoo-finance2';

export const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  validation: {
    logErrors: false,
  },
});

export type YahooChartInterval =
  | '1m'
  | '2m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | '90m'
  | '1h'
  | '1d'
  | '5d'
  | '1wk'
  | '1mo'
  | '3mo';

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function toISODate(dateLike: Date | string | number | null | undefined): string | undefined {
  if (!dateLike) return undefined;

  // Yahoo responses sometimes return `date` as Unix epoch seconds (e.g., 1609372800).
  // JS Date expects milliseconds, so we detect "seconds-ish" values and convert.
  const normalizeToDate = (value: Date | string | number): Date => {
    if (value instanceof Date) return value;

    if (typeof value === 'number') {
      // Heuristic: anything below 1e12 is almost certainly seconds (ms would be 13 digits).
      // Example seconds: 1_735_603_200 (2024-12-31) -> 1.7e9
      // Example ms:      1_735_603_200_000 -> 1.7e12
      const ms = value < 1e12 ? value * 1000 : value;
      return new Date(ms);
    }

    // Numeric strings are common; parse them and apply the same heuristic.
    const trimmed = value.trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
        return new Date(ms);
      }
    }

    return new Date(value);
  };

  const date = normalizeToDate(dateLike);
  const time = date.getTime();
  if (Number.isNaN(time)) return undefined;
  return date.toISOString();
}

export function toISODateOnly(dateLike: Date | string | number | null | undefined): string | undefined {
  const iso = toISODate(dateLike);
  return iso ? iso.slice(0, 10) : undefined;
}

export function clampLimit(limit: number | undefined, fallback = 10): number {
  if (!limit || limit <= 0) return fallback;
  return Math.min(limit, 2000);
}

export function safeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function pickRawNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'object' && value) {
    const raw = (value as { raw?: unknown }).raw;
    return safeNumber(raw);
  }
  return safeNumber(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

export function compact<T>(items: (T | undefined | null)[]): T[] {
  return items.filter((item): item is T => item !== undefined && item !== null);
}

const REGION_BY_SUFFIX: Record<string, string> = {
  '.SI': 'SG',
  '.HK': 'HK',
  '.TO': 'CA',
  '.V': 'CA',
  '.L': 'GB',
  '.AX': 'AU',
  '.NZ': 'NZ',
  '.SS': 'CN',
  '.SZ': 'CN',
  '.T': 'JP',
  '.KS': 'KR',
  '.KQ': 'KR',
  '.SA': 'BR',
  '.MX': 'MX',
  '.PA': 'FR',
  '.DE': 'DE',
  '.SW': 'CH',
  '.MI': 'IT',
  '.AS': 'NL',
  '.ST': 'SE',
  '.OL': 'NO',
  '.HE': 'FI',
  '.CO': 'DK',
  '.VI': 'AT',
  '.IR': 'IE',
  '.LS': 'PT',
};

export function inferRegionFromTicker(ticker: string): string | undefined {
  const upper = normalizeTicker(ticker);
  const dot = upper.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const suffix = upper.slice(dot);
  return REGION_BY_SUFFIX[suffix];
}

export function isLikelyNonUsTicker(ticker: string): boolean {
  return inferRegionFromTicker(ticker) !== undefined;
}
