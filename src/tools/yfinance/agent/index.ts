import { inferRegionFromTicker, normalizeTicker, pickRawNumber, safeNumber, toISODateOnly, yf } from '../shared.js';
import { fetchInsiderTrades } from '../insider.js';
import type { BaseFinancialPersona, FinancialLineItems } from './types.js';
import { StanleyDruckenmillerPersona } from './personas/druckenmiller.js';
import { WarrenBuffettPersona } from './personas/warren-buffett.js';

export type { FinancialLineItems, AnalysisSection, BaseFinancialPersona } from './types.js';
export type { StanleyDruckenmillerAnalysis } from './personas/druckenmiller.js';
export type { WarrenBuffettAnalysis } from './personas/warren-buffett.js';

export { StanleyDruckenmillerPersona } from './personas/druckenmiller.js';
export { WarrenBuffettPersona } from './personas/warren-buffett.js';

type Period = 'annual' | 'quarterly' | 'ttm';
type StatementType = 'income' | 'balance' | 'cashflow';

// Registry of available personas
const PERSONAS: Record<string, BaseFinancialPersona> = {
  stanley_druckenmiller: new StanleyDruckenmillerPersona(),
  warren_buffett: new WarrenBuffettPersona(),
};

export function getAvailablePersonas(): Array<{ name: string; displayName: string; description: string }> {
  return Object.values(PERSONAS).map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
  }));
}

export function getPersona(name: string): BaseFinancialPersona | undefined {
  return PERSONAS[name.toLowerCase().replace(/\s+/g, '_')];
}

interface StatementRecord {
  period?: string;
  values: Record<string, unknown>;
}

function isFailedYahooValidationError(error: unknown): boolean {
  return typeof error === 'object' && !!error && (error as { name?: unknown }).name === 'FailedYahooValidationError';
}

function pickNumberField(values: Record<string, unknown>, fieldNames: string[]): number | undefined {
  for (const fieldName of fieldNames) {
    const value = values[fieldName];
    const numberValue = pickRawNumber(value) ?? safeNumber(value);
    if (numberValue !== undefined) return numberValue;
  }
  return undefined;
}

async function loadStatements(ticker: string, period: Period, statement: StatementType): Promise<StatementRecord[]> {
  const typeMap: Record<Period, 'annual' | 'quarterly' | 'trailing'> = {
    annual: 'annual',
    quarterly: 'quarterly',
    ttm: 'trailing',
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

function mergeByPeriod(records: StatementRecord[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    if (!record.period) continue;
    map.set(record.period, record.values);
  }
  return map;
}

function buildFinancialLineItemsForPeriods(input: {
  income: StatementRecord[];
  balance: StatementRecord[];
  cashflow: StatementRecord[];
  required: Array<keyof FinancialLineItems>;
  limit: number;
  period: Period;
}): FinancialLineItems[] {
  const incomeByPeriod = mergeByPeriod(input.income);
  const balanceByPeriod = mergeByPeriod(input.balance);
  const cashByPeriod = mergeByPeriod(input.cashflow);

  const basePeriods = (input.income.length ? input.income : input.balance.length ? input.balance : input.cashflow)
    .flatMap((r) => (r.period ? [r.period] : []))
    .slice(0, input.limit);

  const prefix = input.period === 'ttm' ? 'trailing' : input.period;

  const items = basePeriods.map((periodKey) => {
    const merged = {
      ...(incomeByPeriod.get(periodKey) ?? {}),
      ...(balanceByPeriod.get(periodKey) ?? {}),
      ...(cashByPeriod.get(periodKey) ?? {}),
    } as Record<string, unknown>;

    const out: FinancialLineItems = {};

    const pick = (key: keyof FinancialLineItems, candidates: string[]) => {
      if (!input.required.includes(key)) return;
      out[key] = pickNumberField(merged, candidates);
    };

    pick('revenue', [`${prefix}TotalRevenue`, 'totalRevenue', 'TotalRevenue']);
    pick('gross_profit', [`${prefix}GrossProfit`, 'grossProfit', 'GrossProfit']);
    pick('earnings_per_share', [
      `${prefix}DilutedEPS`,
      `${prefix}BasicEPS`,
      'dilutedEPS',
      'basicEPS',
      'DilutedEPS',
      'BasicEPS',
    ]);
    pick('net_income', [`${prefix}NetIncome`, `${prefix}NetIncomeCommonStockholders`, 'netIncome', 'NetIncome']);
    pick('free_cash_flow', [`${prefix}FreeCashFlow`, 'freeCashflow', 'freeCashFlow']);
    pick('ebit', [`${prefix}EBIT`, `${prefix}Ebit`, 'EBIT', 'ebit']);
    pick('ebitda', [`${prefix}EBITDA`, `${prefix}Ebitda`, 'EBITDA', 'ebitda']);

    pick('depreciation_and_amortization', [
      `${prefix}DepreciationAndAmortization`,
      `${prefix}Depreciation`,
      'depreciationAndAmortization',
      'DepreciationAndAmortization',
    ]);
    pick('capital_expenditure', [
      `${prefix}CapitalExpenditure`,
      `${prefix}CapitalExpenditures`,
      'capitalExpenditure',
      'capitalExpenditures',
      'CapitalExpenditure',
      'CapitalExpenditures',
    ]);

    pick('total_debt', [`${prefix}TotalDebt`, 'totalDebt', 'TotalDebt']);
    pick('shareholders_equity', [
      `${prefix}StockholdersEquity`,
      `${prefix}CommonStockEquity`,
      'totalStockholderEquity',
      'stockholdersEquity',
    ]);
    pick('total_assets', [`${prefix}TotalAssets`, 'totalAssets', 'TotalAssets']);
    pick('total_liabilities', [
      `${prefix}TotalLiabilitiesNetMinorityInterest`,
      `${prefix}TotalLiabilities`,
      'totalLiab',
      'totalLiabilities',
      'TotalLiabilities',
    ]);
    pick('cash_and_equivalents', [
      `${prefix}CashAndCashEquivalents`,
      `${prefix}CashCashEquivalentsAndShortTermInvestments`,
      'cashAndCashEquivalents',
      'cash',
    ]);

    pick('dividends_and_other_cash_distributions', [
      `${prefix}CashDividendsPaid`,
      `${prefix}CommonStockDividendPaid`,
      'cashDividendsPaid',
      'CashDividendsPaid',
    ]);
    pick('issuance_or_purchase_of_equity_shares', [
      `${prefix}CommonStockIssuance`,
      `${prefix}CommonStockPayments`,
      `${prefix}RepurchaseOfCapitalStock`,
      'commonStockIssuance',
      'commonStockPayments',
      'repurchaseOfCapitalStock',
      'RepurchaseOfCapitalStock',
    ]);

    return out;
  });

  return items;
}

export async function runFinancialAnalysis(tickers: string[], personas: BaseFinancialPersona[]) {
  const required = new Set<keyof FinancialLineItems>();
  for (const persona of personas) {
    for (const item of persona.requiredLineItems) required.add(item);
  }

  const results: Record<string, Record<string, unknown>> = {};

  const endDate = new Date();
  const endDateStr = toISODateOnly(endDate) ?? endDate.toISOString().slice(0, 10);
  const startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
  const startDateStr = toISODateOnly(startDate) ?? startDate.toISOString().slice(0, 10);

  for (const rawTicker of tickers) {
    const ticker = normalizeTicker(rawTicker);

    const [income, balance, cashflow, quote, newsSearch, chart] = await Promise.all([
      loadStatements(ticker, 'annual', 'income'),
      loadStatements(ticker, 'annual', 'balance'),
      loadStatements(ticker, 'annual', 'cashflow'),
      yf.quote(ticker).catch(() => undefined),
      yf.search(ticker, { newsCount: 50 }).catch(() => ({ news: [] } as unknown)),
      yf
        .chart(ticker, {
          period1: startDateStr,
          period2: endDateStr,
          interval: '1d',
          includePrePost: true,
        })
        .catch(() => undefined),
    ]);

    const marketCap = safeNumber(quote?.marketCap);

    const financials = buildFinancialLineItemsForPeriods({
      income,
      balance,
      cashflow,
      required: Array.from(required),
      limit: 4,
      period: 'annual',
    });

    const prices = ((chart as { quotes?: Array<{ close?: number }> } | undefined)?.quotes ?? []).map((q) => ({
      close: safeNumber(q.close),
    }));

    const news = (((newsSearch as { news?: Array<{ title?: string }> }).news ?? []) as Array<{ title?: string }>).map(
      (n) => ({ title: n.title })
    );

    const insiderTrades = await fetchInsiderTrades({
      ticker,
      start_date: startDateStr,
      end_date: endDateStr,
      limit: 50,
    }).catch(() => [] as Array<Record<string, unknown>>);

    const tickerResults: Record<string, unknown> = {};
    for (const persona of personas) {
      tickerResults[persona.name] = persona.analyze({
        ticker,
        financials,
        prices,
        marketCap,
        insiderTrades,
        news,
      });
    }

    results[ticker] = tickerResults;
  }

  return results;
}
