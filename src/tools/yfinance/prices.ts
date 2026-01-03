import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { normalizeTicker, toISODate, YahooChartInterval, yf } from './shared.js';
import { formatToolResult } from '../types.js';

const PriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch the price snapshot for. For example, 'AAPL' for Apple."),
});

function resolveInterval(
  interval: 'minute' | 'day' | 'week' | 'month' | 'year',
  multiplier: number
): YahooChartInterval {
  if (interval === 'minute') {
    const map: Record<number, YahooChartInterval> = {
      1: '1m',
      2: '2m',
      5: '5m',
      15: '15m',
      30: '30m',
      60: '60m',
      90: '90m',
    };
    const resolved = map[multiplier];
    if (!resolved) throw new Error('Minute interval multiplier must be one of 1,2,5,15,30,60,90');
    return resolved;
  }
  if (interval === 'day') {
    if (multiplier === 5) return '5d';
    return '1d';
  }
  if (interval === 'week') return '1wk';
  if (interval === 'month') return multiplier === 3 ? '3mo' : '1mo';
  if (interval === 'year') return '1mo';
  throw new Error(`Unsupported interval ${interval}`);
}

export const getPriceSnapshot = new DynamicStructuredTool({
  name: 'get_price_snapshot',
  description:
    'Fetches the most recent price snapshot for a specific stock from Yahoo Finance, including the latest price, previous close, range, volume, and market cap.',
  schema: PriceSnapshotInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const quote = await yf.quote(ticker);

    const snapshot = {
      ticker,
      currency: quote.currency,
      last_price: quote.regularMarketPrice ?? quote.postMarketPrice ?? quote.preMarketPrice,
      previous_close: quote.regularMarketPreviousClose,
      open: quote.regularMarketOpen,
      day_high: quote.regularMarketDayHigh,
      day_low: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      market_cap: quote.marketCap,
      exchange: quote.fullExchangeName,
      source: 'yfinance',
    } as Record<string, unknown>;

    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}`;
    return formatToolResult({ snapshot }, [sourceUrl]);
  },
});

const PricesInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol to fetch aggregated prices for. For example, 'AAPL' for Apple."),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  interval_multiplier: z.number().default(1).describe('Multiplier for the interval. Defaults to 1.'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Required.'),
});

export const getPrices = new DynamicStructuredTool({
  name: 'get_prices',
  description:
    'Retrieves historical price data for a stock from Yahoo Finance over a specified date range, including open, high, low, close prices, and volume.',
  schema: PricesInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const interval = resolveInterval(input.interval, input.interval_multiplier);

    const chart = await yf.chart(ticker, {
      period1: input.start_date,
      period2: input.end_date,
      interval,
      includePrePost: true,
    });

    const prices = (
      (chart.quotes || []) as Array<{
        date?: Date;
        open?: number;
        high?: number;
        low?: number;
        close?: number;
        adjclose?: number;
        volume?: number;
      }>
    ).map((quote) => ({
      timestamp: toISODate(quote.date),
      open: quote.open,
      high: quote.high,
      low: quote.low,
      close: quote.close,
      adj_close: quote.adjclose,
      volume: quote.volume,
    }));

    const data = {
      data_source: 'yfinance',
      ticker,
      interval: input.interval,
      interval_multiplier: input.interval_multiplier,
      start_date: input.start_date,
      end_date: input.end_date,
      prices,
    };

    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/history`;
    return formatToolResult(data, [sourceUrl]);
  },
});
