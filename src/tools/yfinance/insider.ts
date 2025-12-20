import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { asRecord, normalizeTicker, pickRawNumber, safeNumber, toISODate, yf } from './shared.js';
import { formatToolResult } from '../types.js';

const InsiderTradesInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol. For example, 'AAPL'."),
  end_date: z.string().describe('End date for filtering trades (YYYY-MM-DD).'),
  start_date: z.string().optional().describe('Optional start date for filtering trades (YYYY-MM-DD).'),
  limit: z.number().default(1000).describe('Maximum number of insider trades to return.'),
});

function parseDateMs(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? undefined : ms;
  }

  const raw = pickRawNumber(value) ?? safeNumber(value);
  if (raw === undefined) return undefined;

  // Heuristic: seconds vs milliseconds
  if (raw > 1e12) return raw;
  if (raw > 1e9) return raw * 1000;
  return undefined;
}

function inRange(dateMs: number | undefined, startDate?: string, endDate?: string): boolean {
  if (!dateMs) return true;

  const endMs = new Date(endDate ?? '').getTime();
  const startMs = startDate ? new Date(startDate).getTime() : undefined;

  if (!Number.isNaN(endMs) && dateMs > endMs) return false;
  if (startMs !== undefined && !Number.isNaN(startMs) && dateMs < startMs) return false;

  return true;
}

export async function fetchInsiderTrades(input: {
  ticker: string;
  end_date: string;
  start_date?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const ticker = normalizeTicker(input.ticker);
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 2000) : 1000;

  const summary = await yf.quoteSummary(ticker, { modules: ['insiderTransactions'] }).catch(() => undefined);
  const insiderTransactions = asRecord((summary as { insiderTransactions?: unknown } | undefined)?.insiderTransactions);
  const transactions = (insiderTransactions.transactions as unknown[]) ?? [];

  const results: Array<Record<string, unknown>> = [];

  for (const tx of transactions) {
    const record = asRecord(tx);

    const transactionText = String(record.transactionText ?? record.transactionType ?? record.text ?? '').trim();
    const filerName = (record.filerName ?? record.insider ?? record.name) as string | undefined;
    const filerRelation = (record.filerRelation ?? record.position ?? record.title) as string | undefined;

    const dateMs = parseDateMs(record.startDate ?? record.date ?? record.filingDate);
    if (!inRange(dateMs, input.start_date, input.end_date)) continue;

    const sharesRaw = pickRawNumber(record.shares) ?? safeNumber(record.shares);
    const valueRaw = pickRawNumber(record.value) ?? safeNumber(record.value);

    let shares = sharesRaw;
    if (typeof shares === 'number') {
      if (transactionText.toLowerCase().includes('sale')) shares = -Math.abs(shares);
      else if (transactionText.toLowerCase().includes('purchase')) shares = Math.abs(shares);
    }

    let pricePerShare: number | undefined;
    if (typeof shares === 'number' && typeof valueRaw === 'number' && shares !== 0) {
      pricePerShare = Math.abs(valueRaw / shares);
    }

    const ownedAfter = pickRawNumber(record.ownership) ?? safeNumber(record.ownership);

    const isDirector = typeof filerRelation === 'string' ? filerRelation.toLowerCase().includes('director') : undefined;

    const transactionDateIso = dateMs ? toISODate(new Date(dateMs)) : undefined;

    results.push({
      ticker,
      issuer: null,
      name: filerName ?? null,
      title: filerRelation ?? null,
      is_board_director: isDirector ?? null,
      transaction_date: transactionDateIso ?? null,
      transaction_shares: shares ?? null,
      transaction_price_per_share: pricePerShare ?? null,
      transaction_value: valueRaw ?? null,
      shares_owned_before_transaction: null,
      shares_owned_after_transaction: ownedAfter ?? null,
      security_title: null,
      filing_date: transactionDateIso ?? '',
      transaction_text: transactionText || null,
    });

    if (results.length >= limit) break;
  }

  results.sort((a, b) => String(b.transaction_date ?? '').localeCompare(String(a.transaction_date ?? '')));
  return results;
}

export const getInsiderTrades = new DynamicStructuredTool({
  name: 'get_insider_trades',
  description:
    'Fetch insider trades (insider transactions) from Yahoo Finance, filtered by date range. Returns signed transaction shares (sales negative, purchases positive) when detectable.',
  schema: InsiderTradesInputSchema,
  func: async (input) => {
    const trades = await fetchInsiderTrades(input);
    const ticker = normalizeTicker(input.ticker);
    const data = { data_source: 'yfinance', ticker, insider_trades: trades };
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/insider-transactions`;
    return formatToolResult(data, [sourceUrl]);
  },
});
