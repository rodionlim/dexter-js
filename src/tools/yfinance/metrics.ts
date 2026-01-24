import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  asRecord,
  inferRegionFromTicker,
  normalizeTicker,
  pickRawNumber,
  safeNumber,
  toISODateOnly,
  yf,
} from './shared.js';
import { formatToolResult } from '../types.js';

type Period = 'annual' | 'quarterly';

type StatementType = 'income' | 'balance' | 'cashflow';

const FinancialMetricsSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch financial metrics snapshot for. For example, 'AAPL' for Apple."),
});

export const getFinancialMetricsSnapshot = new DynamicStructuredTool({
  name: 'get_financial_metrics_snapshot',
  description:
    'Fetches a snapshot of current financial metrics for a company from Yahoo Finance, including valuation ratios and trading stats.',
  schema: FinancialMetricsSnapshotInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const summary = await yf.quoteSummary(ticker, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'financialData'],
    });

    const summaryDetail = asRecord(summary.summaryDetail);
    const stats = asRecord(summary.defaultKeyStatistics);
    const financialData = asRecord(summary.financialData);

    const snapshot = {
      ticker,
      currency:
        (summaryDetail.currency as string | undefined) || (financialData.financialCurrency as string | undefined),
      market_cap:
        pickRawNumber(stats.marketCap) ??
        pickRawNumber(financialData.marketCap) ??
        pickRawNumber(summaryDetail.marketCap),
      enterprise_value: pickRawNumber(stats.enterpriseValue),
      trailing_pe:
        pickRawNumber(summaryDetail.trailingPE) ??
        pickRawNumber(financialData.trailingPE) ??
        pickRawNumber(stats.trailingPE),
      forward_pe:
        pickRawNumber(summaryDetail.forwardPE) ??
        pickRawNumber(financialData.forwardPE) ??
        pickRawNumber(stats.forwardPE),
      peg_ratio: pickRawNumber(stats.pegRatio),
      price_to_book: pickRawNumber(summaryDetail.priceToBook) ?? pickRawNumber(stats.priceToBook),
      dividend_yield: pickRawNumber(summaryDetail.dividendYield) ?? pickRawNumber(financialData.dividendYield),
      beta: pickRawNumber(summaryDetail.beta) ?? pickRawNumber(stats.beta),
      fifty_day_average: pickRawNumber(summaryDetail.fiftyDayAverage),
      two_hundred_day_average: pickRawNumber(summaryDetail.twoHundredDayAverage),
      year_high: pickRawNumber(summaryDetail.fiftyTwoWeekHigh),
      year_low: pickRawNumber(summaryDetail.fiftyTwoWeekLow),
      payout_ratio: pickRawNumber(summaryDetail.payoutRatio) ?? pickRawNumber(stats.payoutRatio),
      free_cash_flow: pickRawNumber(financialData.freeCashflow),
      shares_outstanding: pickRawNumber(stats.sharesOutstanding),
    } as Record<string, unknown>;

    const data = { data_source: 'yfinance', metrics: snapshot };
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/key-statistics`;
    return formatToolResult(data, [sourceUrl]);
  },
});

const FinancialMetricsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol to fetch financial metrics for. For example, 'AAPL' for Apple."),
  period: z
    .enum(['annual', 'quarterly'])
    .default('annual')
    .describe(
      "The reporting period. 'annual' for yearly and 'quarterly' for quarterly."
    ),
  limit: z.number().default(4).describe('The number of past financial statements to retrieve.'),
  report_period: z
    .string()
    .optional()
    .describe('Filter for financial metrics with an exact report period date (YYYY-MM-DD).'),
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

function pickNumberField(values: Record<string, unknown>, fieldNames: string[]): number | undefined {
  for (const fieldName of fieldNames) {
    const value = values[fieldName];
    const numberValue = pickRawNumber(value) ?? safeNumber(value);
    if (numberValue !== undefined) return numberValue;
  }
  return undefined;
}

function deriveMetrics(values: Record<string, unknown>, sharesOutstanding: number | undefined, period: Period) {
  const prefix = period;

  const totalRevenue = pickNumberField(values, [`${prefix}TotalRevenue`, 'totalRevenue', 'TotalRevenue']);
  const grossProfit = pickNumberField(values, [`${prefix}GrossProfit`, 'grossProfit', 'GrossProfit']);
  const operatingIncome = pickNumberField(values, [`${prefix}OperatingIncome`, 'operatingIncome', 'OperatingIncome']);
  const netIncome = pickNumberField(values, [
    `${prefix}NetIncome`,
    `${prefix}NetIncomeCommonStockholders`,
    'netIncome',
    'NetIncome',
  ]);
  const ebitda = pickNumberField(values, [`${prefix}EBITDA`, `${prefix}Ebitda`, 'EBITDA', 'ebitda']);

  const totalAssets = pickNumberField(values, [`${prefix}TotalAssets`, 'totalAssets', 'TotalAssets']);
  const totalLiabilities = pickNumberField(values, [
    `${prefix}TotalLiabilitiesNetMinorityInterest`,
    `${prefix}TotalLiabilities`,
    'totalLiabilities',
    'totalLiab',
  ]);
  const shareholderEquity = pickNumberField(values, [
    `${prefix}StockholdersEquity`,
    `${prefix}CommonStockEquity`,
    `${prefix}TotalEquityGrossMinorityInterest`,
    'totalStockholderEquity',
    'stockholdersEquity',
  ]);

  const operatingCashFlow = pickNumberField(values, [
    `${prefix}OperatingCashFlow`,
    `${prefix}CashFlowFromContinuingOperatingActivities`,
    'totalCashFromOperatingActivities',
    'operatingCashflow',
  ]);
  const freeCashFlow = pickNumberField(values, [`${prefix}FreeCashFlow`, 'freeCashflow', 'freeCashFlow']);

  const metrics: Record<string, unknown> = {
    total_revenue: totalRevenue,
    gross_profit: grossProfit,
    operating_income: operatingIncome,
    net_income: netIncome,
    ebitda,
    operating_cash_flow: operatingCashFlow,
    free_cash_flow: freeCashFlow,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    shareholder_equity: shareholderEquity,
  };

  if (totalRevenue && netIncome !== undefined) metrics.net_margin = netIncome / totalRevenue;
  if (totalRevenue && grossProfit !== undefined) metrics.gross_margin = grossProfit / totalRevenue;
  if (totalRevenue && operatingIncome !== undefined) metrics.operating_margin = operatingIncome / totalRevenue;
  if (totalRevenue && freeCashFlow !== undefined) metrics.free_cash_flow_margin = freeCashFlow / totalRevenue;
  if (shareholderEquity && totalLiabilities !== undefined)
    metrics.debt_to_equity = totalLiabilities / shareholderEquity;
  if (sharesOutstanding && netIncome !== undefined) metrics.net_income_per_share = netIncome / sharesOutstanding;
  if (sharesOutstanding && freeCashFlow !== undefined)
    metrics.free_cash_flow_per_share = freeCashFlow / sharesOutstanding;

  return metrics;
}

function indexByPeriod(records: StatementRecord[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (!record.period) continue;
    map.set(record.period, record.values);
  }
  return map;
}

export const getFinancialMetrics = new DynamicStructuredTool({
  name: 'get_financial_metrics',
  description:
    'Retrieves historical financial metrics for a company from Yahoo Finance, computing margins and per-share figures from financial statements.',
  schema: FinancialMetricsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const [income, balance, cashflow, stats] = await Promise.all([
      loadStatements(ticker, input.period, 'income'),
      loadStatements(ticker, input.period, 'balance'),
      loadStatements(ticker, input.period, 'cashflow'),
      yf.quoteSummary(ticker, { modules: ['defaultKeyStatistics'] }),
    ]);

    const sharesOutstanding = safeNumber(pickRawNumber(stats.defaultKeyStatistics?.sharesOutstanding));
    const incomeByPeriod = indexByPeriod(income);
    const balanceByPeriod = indexByPeriod(balance);
    const cashByPeriod = indexByPeriod(cashflow);

    const basePeriods = (income.length ? income : balance.length ? balance : cashflow).flatMap((record) =>
      record.period ? [record.period] : []
    );

    const metrics = Array.from(new Set(basePeriods)).map((periodKey) => {
      const merged = {
        ...(incomeByPeriod.get(periodKey) ?? {}),
        ...(balanceByPeriod.get(periodKey) ?? {}),
        ...(cashByPeriod.get(periodKey) ?? {}),
      } as Record<string, unknown>;

      return {
        period: periodKey,
        metrics: deriveMetrics(merged, sharesOutstanding, input.period),
      };
    });

    const filtered = input.report_period ? metrics.filter((m) => m.period === input.report_period) : metrics;

    const limited = input.limit > 0 ? filtered.slice(0, input.limit) : filtered;

    const data = {
      data_source: 'yfinance',
      ticker,
      period: input.period,
      metrics: limited,
    };

    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/key-statistics`;
    return formatToolResult(data, [sourceUrl]);
  },
});
