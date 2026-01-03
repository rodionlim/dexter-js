import type { AnalysisSection, BaseFinancialPersona, FinancialLineItems } from '../types.js';
import { safeNumber } from '../../shared.js';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function analyzeFundamentals(financials: FinancialLineItems[]): AnalysisSection {
  if (!financials.length) return { score: 0, details: 'Insufficient fundamental data' };

  const latest = financials[0];

  const roe =
    typeof latest.net_income === 'number' && typeof latest.shareholders_equity === 'number' && latest.shareholders_equity !== 0
      ? latest.net_income / latest.shareholders_equity
      : undefined;

  const debtToEquity =
    typeof latest.total_debt === 'number' && typeof latest.shareholders_equity === 'number' && latest.shareholders_equity !== 0
      ? latest.total_debt / latest.shareholders_equity
      : undefined;

  const operatingMargin =
    typeof latest.ebit === 'number' && typeof latest.revenue === 'number' && latest.revenue !== 0
      ? latest.ebit / latest.revenue
      : undefined;

  const fcfMargin =
    typeof latest.free_cash_flow === 'number' && typeof latest.revenue === 'number' && latest.revenue !== 0
      ? latest.free_cash_flow / latest.revenue
      : undefined;

  let raw = 0;
  const details: string[] = [];

  if (typeof roe === 'number') {
    if (roe > 0.15) {
      raw += 3;
      details.push(`Strong ROE: ${pct(roe)}`);
    } else if (roe > 0.08) {
      raw += 2;
      details.push(`Moderate ROE: ${pct(roe)}`);
    } else {
      details.push(`Weak ROE: ${pct(roe)}`);
    }
  } else {
    details.push('ROE unavailable');
  }

  if (typeof debtToEquity === 'number') {
    if (debtToEquity < 0.5) {
      raw += 3;
      details.push(`Conservative leverage (D/E ${debtToEquity.toFixed(2)})`);
    } else if (debtToEquity < 1.0) {
      raw += 2;
      details.push(`Moderate leverage (D/E ${debtToEquity.toFixed(2)})`);
    } else {
      details.push(`High leverage (D/E ${debtToEquity.toFixed(2)})`);
    }
  } else {
    details.push('Debt-to-equity unavailable');
  }

  if (typeof operatingMargin === 'number') {
    if (operatingMargin > 0.15) {
      raw += 2;
      details.push(`Strong operating margin: ${pct(operatingMargin)}`);
    } else if (operatingMargin > 0.08) {
      raw += 1;
      details.push(`Moderate operating margin: ${pct(operatingMargin)}`);
    } else {
      details.push(`Weak operating margin: ${pct(operatingMargin)}`);
    }
  } else {
    details.push('Operating margin unavailable');
  }

  if (typeof fcfMargin === 'number') {
    if (fcfMargin > 0.08) {
      raw += 2;
      details.push(`Strong FCF margin: ${pct(fcfMargin)}`);
    } else if (fcfMargin > 0.03) {
      raw += 1;
      details.push(`Moderate FCF margin: ${pct(fcfMargin)}`);
    } else {
      details.push(`Weak FCF margin: ${pct(fcfMargin)}`);
    }
  } else {
    details.push('FCF margin unavailable');
  }

  // raw max = 10
  const score = clamp(raw, 0, 10);
  return { score, details: details.join('; ') };
}

function analyzeConsistency(financials: FinancialLineItems[]): AnalysisSection {
  const netIncomes = financials
    .map((f) => f.net_income)
    .filter((v): v is number => typeof v === 'number')
    .slice(0, 6);

  if (netIncomes.length < 4) return { score: 0, details: 'Insufficient history for consistency analysis' };

  const increasing = netIncomes.every((v, i, arr) => (i === arr.length - 1 ? true : v >= arr[i + 1]));

  let raw = 0;
  const details: string[] = [];

  if (increasing) {
    raw += 6;
    details.push('Consistent net income growth across recent periods');
  } else {
    raw += 2;
    details.push('Net income growth is not consistently increasing');
  }

  const latest = netIncomes[0];
  const oldest = netIncomes[netIncomes.length - 1];
  if (oldest !== 0) {
    const totalGrowth = (latest - oldest) / Math.abs(oldest);
    if (totalGrowth > 0.5) raw += 4;
    else if (totalGrowth > 0.2) raw += 3;
    else if (totalGrowth > 0) raw += 2;
    details.push(`Total net income change: ${pct(totalGrowth)}`);
  }

  return { score: clamp(raw, 0, 10), details: details.join('; ') };
}

function analyzeMoat(financials: FinancialLineItems[]): AnalysisSection {
  const sample = financials.slice(0, 6);
  if (sample.length < 4) return { score: 0, details: 'Insufficient history for moat analysis' };

  const roes = sample
    .map((f) =>
      typeof f.net_income === 'number' && typeof f.shareholders_equity === 'number' && f.shareholders_equity !== 0
        ? f.net_income / f.shareholders_equity
        : undefined
    )
    .filter((v): v is number => typeof v === 'number');

  const opMargins = sample
    .map((f) =>
      typeof f.ebit === 'number' && typeof f.revenue === 'number' && f.revenue !== 0 ? f.ebit / f.revenue : undefined
    )
    .filter((v): v is number => typeof v === 'number');

  if (roes.length < 4 && opMargins.length < 4) return { score: 0, details: 'Not enough ROE/margin data for moat analysis' };

  let raw = 0;
  const details: string[] = [];

  if (roes.length >= 4) {
    const highRoePeriods = roes.filter((r) => r > 0.15).length;
    const ratio = highRoePeriods / roes.length;
    if (ratio >= 0.8) {
      raw += 6;
      details.push(`Excellent ROE consistency (${highRoePeriods}/${roes.length} > 15%)`);
    } else if (ratio >= 0.6) {
      raw += 4;
      details.push(`Good ROE consistency (${highRoePeriods}/${roes.length} > 15%)`);
    } else {
      raw += 2;
      details.push(`Inconsistent ROE (${highRoePeriods}/${roes.length} > 15%)`);
    }
  }

  if (opMargins.length >= 4) {
    const avg = opMargins.reduce((a, b) => a + b, 0) / opMargins.length;
    const recentAvg = opMargins.slice(0, 2).reduce((a, b) => a + b, 0) / Math.min(2, opMargins.length);
    const olderAvg = opMargins.slice(-2).reduce((a, b) => a + b, 0) / Math.min(2, opMargins.length);

    if (avg > 0.2 && recentAvg >= olderAvg) {
      raw += 4;
      details.push(`Strong and stable operating margins (avg ${pct(avg)})`);
    } else if (avg > 0.15) {
      raw += 2;
      details.push(`Decent operating margins (avg ${pct(avg)})`);
    } else {
      details.push(`Low operating margins (avg ${pct(avg)})`);
    }
  }

  return { score: clamp(raw, 0, 10), details: details.join('; ') };
}

function analyzeManagementQuality(financials: FinancialLineItems[]): AnalysisSection {
  if (!financials.length) return { score: 0, details: 'Insufficient data for management analysis' };

  const latest = financials[0];
  const issuanceOrRepurchase = latest.issuance_or_purchase_of_equity_shares;
  const dividends = latest.dividends_and_other_cash_distributions;

  let raw = 0;
  const details: string[] = [];

  // Convention: cash outflows are often negative on cash-flow statements.
  if (typeof issuanceOrRepurchase === 'number') {
    if (issuanceOrRepurchase < 0) {
      raw += 5;
      details.push('Share repurchases (shareholder-friendly)');
    } else if (issuanceOrRepurchase > 0) {
      raw += 1;
      details.push('Share issuance (potential dilution)');
    } else {
      raw += 3;
      details.push('No material share issuance/repurchase detected');
    }
  } else {
    details.push('Share issuance/repurchase data unavailable');
  }

  if (typeof dividends === 'number') {
    if (dividends < 0) {
      raw += 5;
      details.push('Dividends paid');
    } else {
      raw += 2;
      details.push('No/low dividends');
    }
  } else {
    details.push('Dividend data unavailable');
  }

  return { score: clamp(raw, 0, 10), details: details.join('; ') };
}

function estimateMaintenanceCapex(financials: FinancialLineItems[]): number | undefined {
  const latest = financials[0];
  const capex = safeNumber(latest.capital_expenditure);
  const depreciation = safeNumber(latest.depreciation_and_amortization);

  if (capex === undefined && depreciation === undefined) return undefined;

  const latestCapexAbs = typeof capex === 'number' ? Math.abs(capex) : 0;
  const latestDep = typeof depreciation === 'number' ? Math.abs(depreciation) : 0;

  // Conservative heuristic: maintenance capex is typically close to depreciation,
  // but for capex-heavy businesses it can be higher.
  return Math.max(latestCapexAbs * 0.85, latestDep);
}

function calculateIntrinsicValue(financials: FinancialLineItems[]): { intrinsicValue?: number; details: string } {
  if (financials.length < 2) return { details: 'Insufficient history for intrinsic value calculation' };

  const latest = financials[0];
  const netIncome = safeNumber(latest.net_income);
  const depreciation = safeNumber(latest.depreciation_and_amortization);
  const maintenanceCapex = estimateMaintenanceCapex(financials);

  if (netIncome === undefined || depreciation === undefined || maintenanceCapex === undefined) {
    return { details: 'Missing components for owner earnings (net income / depreciation / capex)' };
  }

  const ownerEarnings = netIncome + depreciation - maintenanceCapex;
  if (!Number.isFinite(ownerEarnings) || ownerEarnings <= 0) {
    return { details: 'Owner earnings not positive; intrinsic value not reliable' };
  }

  // Conservative, simple DCF (equity-value proxy)
  // TODO(rl): use eps instead of a fixed growth model
  const discountRate = 0.1;
  const stage1Growth = 0.06;
  const stage1Years = 5;
  const stage2Growth = 0.03;
  const stage2Years = 5;
  const terminalGrowth = 0.025;

  let pv = 0;
  for (let year = 1; year <= stage1Years; year++) {
    const cf = ownerEarnings * (1 + stage1Growth) ** year;
    pv += cf / (1 + discountRate) ** year;
  }

  const stage1Final = ownerEarnings * (1 + stage1Growth) ** stage1Years;
  for (let year = 1; year <= stage2Years; year++) {
    const cf = stage1Final * (1 + stage2Growth) ** year;
    pv += cf / (1 + discountRate) ** (stage1Years + year);
  }

  const finalEarnings = stage1Final * (1 + stage2Growth) ** stage2Years;
  const terminalEarnings = finalEarnings * (1 + terminalGrowth);
  const terminalValue = terminalEarnings / (discountRate - terminalGrowth);
  pv += terminalValue / (1 + discountRate) ** (stage1Years + stage2Years);

  const conservative = pv * 0.85;

  return {
    intrinsicValue: conservative,
    details: `Owner earnings ${ownerEarnings.toFixed(0)}; DCF (10% discount, 6%/3% growth, 2.5% terminal) with 15% haircut`,
  };
}

function analyzeValuation(financials: FinancialLineItems[], marketCap: number | undefined): AnalysisSection {
  if (marketCap === undefined) return { score: 0, details: 'Market cap unavailable' };

  const { intrinsicValue, details } = calculateIntrinsicValue(financials);
  if (intrinsicValue === undefined) return { score: 0, details };

  const marginOfSafety = (intrinsicValue - marketCap) / marketCap;

  let score = 0;
  const pieces: string[] = [details, `Market cap ${marketCap.toFixed(0)}`, `MoS ${pct(marginOfSafety)}`];

  if (marginOfSafety > 0.4) score = 10;
  else if (marginOfSafety > 0.2) score = 8;
  else if (marginOfSafety > 0.1) score = 6;
  else if (marginOfSafety > 0) score = 4;
  else score = 1;

  return { score, details: pieces.join('; ') };
}

export interface WarrenBuffettAnalysis {
  signal: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell';
  score: number;
  max_score: 10;
  confidence: number;
  fundamental_analysis: AnalysisSection;
  consistency_analysis: AnalysisSection;
  moat_analysis: AnalysisSection;
  management_analysis: AnalysisSection;
  valuation_analysis: AnalysisSection;
}

export class WarrenBuffettPersona implements BaseFinancialPersona<WarrenBuffettAnalysis> {
  name = 'warren_buffett';
  displayName = 'Warren Buffett';
  description =
    'Quality and value investor focused on durable moats, consistent earnings power, shareholder-friendly management, and buying at a margin of safety.';

  requiredLineItems: Array<keyof FinancialLineItems> = [
    'revenue',
    'gross_profit',
    'net_income',
    'free_cash_flow',
    'ebit',
    'total_debt',
    'shareholders_equity',
    'depreciation_and_amortization',
    'capital_expenditure',
    'dividends_and_other_cash_distributions',
    'issuance_or_purchase_of_equity_shares',
  ];

  analyze(input: {
    ticker: string;
    financials: FinancialLineItems[];
    prices: Array<{ close?: number }>;
    marketCap?: number;
    insiderTrades: Array<Record<string, unknown>>;
    news: Array<{ title?: string }>;
  }): WarrenBuffettAnalysis {
    const fundamentalAnalysis = analyzeFundamentals(input.financials);
    const consistencyAnalysis = analyzeConsistency(input.financials);
    const moatAnalysis = analyzeMoat(input.financials);
    const managementAnalysis = analyzeManagementQuality(input.financials);
    const valuationAnalysis = analyzeValuation(input.financials, input.marketCap);

    // Buffett-like weighting: quality + moat + valuation
    const totalScore =
      fundamentalAnalysis.score * 0.25 +
      consistencyAnalysis.score * 0.2 +
      moatAnalysis.score * 0.25 +
      managementAnalysis.score * 0.1 +
      valuationAnalysis.score * 0.2;

    const score = Number(clamp(totalScore, 0, 10).toFixed(1));
    const confidence = clamp(Math.round((score / 10) * 100), 0, 100);

    let signal: WarrenBuffettAnalysis['signal'] = 'Hold';
    if (score >= 7.5) signal = 'Strong Buy';
    else if (score >= 6.0) signal = 'Buy';
    else if (score <= 4.0) signal = 'Sell';

    return {
      signal,
      score,
      max_score: 10,
      confidence,
      fundamental_analysis: fundamentalAnalysis,
      consistency_analysis: consistencyAnalysis,
      moat_analysis: moatAnalysis,
      management_analysis: managementAnalysis,
      valuation_analysis: valuationAnalysis,
    };
  }
}
