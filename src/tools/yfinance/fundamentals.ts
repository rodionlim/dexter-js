import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { inferRegionFromTicker, normalizeTicker, toISODateOnly, yf } from './shared.js';
import { formatToolResult } from '../types.js';

type Period = 'annual' | 'quarterly';

type StatementType = 'income' | 'balance' | 'cashflow';

const FinancialStatementsInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch financial statements for. For example, 'AAPL' for Apple."),
  period: z
    .enum(['annual', 'quarterly'])
    .describe(
      "The reporting period for the financial statements. 'annual' for yearly and 'quarterly' for quarterly"
    ),
  limit: z
    .number()
    .default(10)
    .describe(
      'Maximum number of report periods to return (default: 10). Returns the most recent N periods based on the period type.'
    ),
});

interface StatementRecord {
  period: string | undefined;
  values: Record<string, unknown>;
}

function isFailedYahooValidationError(error: unknown): boolean {
  return typeof error === 'object' && !!error && (error as { name?: unknown }).name === 'FailedYahooValidationError';
}

async function loadStatements(ticker: string, period: Period, statement: StatementType): Promise<StatementRecord[]> {
  const typeMap: Record<Period, 'annual' | 'quarterly'> = {
    annual: 'annual',
    quarterly: 'quarterly',
  };

  const moduleMap: Record<StatementType, 'financials' | 'balance-sheet' | 'cash-flow'> = {
    income: 'financials',
    balance: 'balance-sheet',
    cashflow: 'cash-flow',
  };

  const now = new Date();
  const period2 = toISODateOnly(now) ?? now.toISOString().slice(0, 10);
  const lookbackYears = period === 'annual' ? 15 : period === 'quarterly' ? 10 : 5;

  // Note: fundamentalsTimeSeries requires period1; choose a conservative lookback and trim via `limit`.
  const period1Date = new Date(now.getTime() - lookbackYears * 365 * 24 * 60 * 60 * 1000);
  const period1 = toISODateOnly(period1Date) ?? period1Date.toISOString().slice(0, 10);

  const region = inferRegionFromTicker(ticker);

  const queryOptions = {
    period1,
    period2,
    type: typeMap[period],
    module: moduleMap[statement],
    ...(region ? { region } : {}),
  };

  let data: unknown;
  try {
    data = await yf.fundamentalsTimeSeries(ticker, queryOptions);
  } catch (error) {
    if (!isFailedYahooValidationError(error)) throw error;
    data = await yf.fundamentalsTimeSeries(ticker, queryOptions, { validateResult: false });
  }

  const array = Array.isArray(data) ? data : [];
  return array
    .map((entry) => {
      const values = (entry ?? {}) as Record<string, unknown>;
      return {
        period: toISODateOnly((values as { date?: unknown }).date as Date | string | number | undefined),
        values,
      };
    })
    .filter((r) => !!r.period)
    .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''));
}

function trimRecords(records: StatementRecord[], limit: number): StatementRecord[] {
  if (!limit || limit <= 0) return records;
  return records.slice(0, limit);
}

function serializeRecords(records: StatementRecord[]): StatementRecord[] {
  return records.map((record) => ({
    period: record.period,
    values: record.values,
  }));
}

async function buildResponse(
  ticker: string,
  period: Period,
  statement: StatementType,
  limit: number,
  label: string
): Promise<string> {
  const records = await loadStatements(ticker, period, statement);
  const trimmed = trimRecords(records, limit);
  return JSON.stringify({
    data_source: 'yfinance',
    ticker,
    statement: label,
    period,
    results: serializeRecords(trimmed),
  });
}

export const getIncomeStatements = new DynamicStructuredTool({
  name: 'get_income_statements',
  description:
    "Fetches a company's income statements from Yahoo Finance. Returns revenue, expenses, and profit line items for the chosen period.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const result = await buildResponse(ticker, input.period, 'income', input.limit, 'income_statement');
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/financials`;
    return formatToolResult(JSON.parse(result), [sourceUrl]);
  },
});

export const getBalanceSheets = new DynamicStructuredTool({
  name: 'get_balance_sheets',
  description:
    "Retrieves a company's balance sheets from Yahoo Finance, including assets, liabilities, and equity entries.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const result = await buildResponse(ticker, input.period, 'balance', input.limit, 'balance_sheet');
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/balance-sheet`;
    return formatToolResult(JSON.parse(result), [sourceUrl]);
  },
});

export const getCashFlowStatements = new DynamicStructuredTool({
  name: 'get_cash_flow_statements',
  description:
    "Retrieves a company's cash flow statements from Yahoo Finance, covering operating, investing, and financing activities.",
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const result = await buildResponse(ticker, input.period, 'cashflow', input.limit, 'cash_flow_statement');
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/cash-flow`;
    return formatToolResult(JSON.parse(result), [sourceUrl]);
  },
});

export const getAllFinancialStatements = new DynamicStructuredTool({
  name: 'get_all_financial_statements',
  description:
    'Retrieves income, balance sheet, and cash flow statements in a single call from Yahoo Finance for efficiency. Always prefer to call this to reduce API usage.',
  schema: FinancialStatementsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const [income, balance, cashflow] = await Promise.all([
      loadStatements(ticker, input.period, 'income'),
      loadStatements(ticker, input.period, 'balance'),
      loadStatements(ticker, input.period, 'cashflow'),
    ]);

    const data = {
      data_source: 'yfinance',
      ticker,
      period: input.period,
      financials: {
        income_statements: serializeRecords(trimRecords(income, input.limit)),
        balance_sheets: serializeRecords(trimRecords(balance, input.limit)),
        cash_flow_statements: serializeRecords(trimRecords(cashflow, input.limit)),
      },
    };

    const sourceUrls = [
      `https://finance.yahoo.com/quote/${ticker}/financials`,
      `https://finance.yahoo.com/quote/${ticker}/balance-sheet`,
      `https://finance.yahoo.com/quote/${ticker}/cash-flow`,
    ];

    return formatToolResult(data, sourceUrls);
  },
});
