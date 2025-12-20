import type { BaseFinancialPersona, FinancialLineItems, AnalysisSection } from '../types.js';
import { safeNumber } from '../../shared.js';

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function analyzeGrowthAndMomentum(
  financialLineItems: FinancialLineItems[],
  prices: Array<{ close?: number }>
): AnalysisSection {
  if (!financialLineItems || financialLineItems.length < 2) {
    return { score: 0, details: 'Insufficient financial data for growth analysis' };
  }

  const details: string[] = [];
  let rawScore = 0;

  const revenues = financialLineItems.map((fi) => fi.revenue).filter((v): v is number => typeof v === 'number');
  if (revenues.length >= 2) {
    const latest = revenues[0];
    const older = revenues[revenues.length - 1];
    const years = revenues.length - 1;
    if (older > 0 && latest > 0) {
      const growth = (latest / older) ** (1 / years) - 1;
      if (growth > 0.08) {
        rawScore += 3;
        details.push(`Strong annualized revenue growth: ${(growth * 100).toFixed(1)}%`);
      } else if (growth > 0.04) {
        rawScore += 2;
        details.push(`Moderate annualized revenue growth: ${(growth * 100).toFixed(1)}%`);
      } else if (growth > 0.01) {
        rawScore += 1;
        details.push(`Slight annualized revenue growth: ${(growth * 100).toFixed(1)}%`);
      } else {
        details.push(`Minimal/negative revenue growth: ${(growth * 100).toFixed(1)}%`);
      }
    } else {
      details.push("Older revenue is zero/negative; can't compute revenue growth.");
    }
  } else {
    details.push('Not enough revenue data points for growth calculation.');
  }

  const epsValues = financialLineItems
    .map((fi) => fi.earnings_per_share)
    .filter((v): v is number => typeof v === 'number');
  if (epsValues.length >= 2) {
    const latest = epsValues[0];
    const older = epsValues[epsValues.length - 1];
    const years = epsValues.length - 1;
    if (older > 0 && latest > 0) {
      const growth = (latest / older) ** (1 / years) - 1;
      if (growth > 0.08) {
        rawScore += 3;
        details.push(`Strong annualized EPS growth: ${(growth * 100).toFixed(1)}%`);
      } else if (growth > 0.04) {
        rawScore += 2;
        details.push(`Moderate annualized EPS growth: ${(growth * 100).toFixed(1)}%`);
      } else if (growth > 0.01) {
        rawScore += 1;
        details.push(`Slight annualized EPS growth: ${(growth * 100).toFixed(1)}%`);
      } else {
        details.push(`Minimal/negative annualized EPS growth: ${(growth * 100).toFixed(1)}%`);
      }
    } else {
      details.push('Older EPS is near zero; skipping EPS growth calculation.');
    }
  } else {
    details.push('Not enough EPS data points for growth calculation.');
  }

  const closePrices = prices.map((p) => p.close).filter((v): v is number => typeof v === 'number');
  if (closePrices.length > 30) {
    const start = closePrices[0];
    const end = closePrices[closePrices.length - 1];
    if (start > 0) {
      const pctChange = (end - start) / start;
      if (pctChange > 0.5) {
        rawScore += 3;
        details.push(`Very strong price momentum: ${(pctChange * 100).toFixed(1)}%`);
      } else if (pctChange > 0.2) {
        rawScore += 2;
        details.push(`Moderate price momentum: ${(pctChange * 100).toFixed(1)}%`);
      } else if (pctChange > 0) {
        rawScore += 1;
        details.push(`Slight positive momentum: ${(pctChange * 100).toFixed(1)}%`);
      } else {
        details.push(`Negative price momentum: ${(pctChange * 100).toFixed(1)}%`);
      }
    } else {
      details.push("Invalid start price (<= 0); can't compute momentum.");
    }
  } else {
    details.push('Not enough recent price data for momentum analysis.');
  }

  const finalScore = Math.min(10, (rawScore / 9) * 10);
  return { score: Number(finalScore.toFixed(2)), details: details.join('; ') };
}

function analyzeRiskReward(
  financialLineItems: FinancialLineItems[],
  prices: Array<{ close?: number }>
): AnalysisSection {
  if (!financialLineItems.length || !prices.length) {
    return { score: 0, details: 'Insufficient data for risk-reward analysis' };
  }

  const details: string[] = [];
  let rawScore = 0;

  const recentDebt = financialLineItems[0]?.total_debt;
  const recentEquity = financialLineItems[0]?.shareholders_equity ?? 1e-9;
  if (typeof recentDebt === 'number' && typeof recentEquity === 'number') {
    const deRatio = recentDebt / (recentEquity || 1e-9);
    if (deRatio < 0.3) {
      rawScore += 3;
      details.push(`Low debt-to-equity: ${deRatio.toFixed(2)}`);
    } else if (deRatio < 0.7) {
      rawScore += 2;
      details.push(`Moderate debt-to-equity: ${deRatio.toFixed(2)}`);
    } else if (deRatio < 1.5) {
      rawScore += 1;
      details.push(`Somewhat high debt-to-equity: ${deRatio.toFixed(2)}`);
    } else {
      details.push(`High debt-to-equity: ${deRatio.toFixed(2)}`);
    }
  } else {
    details.push('No consistent debt/equity data available.');
  }

  const closes = prices.map((p) => p.close).filter((v): v is number => typeof v === 'number');
  if (closes.length > 10) {
    const dailyReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      if (prev > 0) dailyReturns.push((closes[i] - prev) / prev);
    }
    if (dailyReturns.length) {
      const stdev = populationStdDev(dailyReturns);
      if (stdev < 0.01) {
        rawScore += 3;
        details.push(`Low volatility: daily returns stdev ${(stdev * 100).toFixed(2)}%`);
      } else if (stdev < 0.02) {
        rawScore += 2;
        details.push(`Moderate volatility: daily returns stdev ${(stdev * 100).toFixed(2)}%`);
      } else if (stdev < 0.04) {
        rawScore += 1;
        details.push(`High volatility: daily returns stdev ${(stdev * 100).toFixed(2)}%`);
      } else {
        details.push(`Very high volatility: daily returns stdev ${(stdev * 100).toFixed(2)}%`);
      }
    } else {
      details.push('Insufficient daily returns data for volatility calc.');
    }
  } else {
    details.push('Not enough price data for volatility analysis.');
  }

  const finalScore = Math.min(10, (rawScore / 6) * 10);
  return { score: Number(finalScore.toFixed(2)), details: details.join('; ') };
}

function analyzeValuation(financialLineItems: FinancialLineItems[], marketCap: number | undefined): AnalysisSection {
  if (!financialLineItems.length || marketCap === undefined) {
    return { score: 0, details: 'Insufficient data to perform valuation' };
  }

  const details: string[] = [];
  let rawScore = 0;

  const recentDebt = financialLineItems[0]?.total_debt ?? 0;
  const recentCash = financialLineItems[0]?.cash_and_equivalents ?? 0;
  const enterpriseValue = marketCap + recentDebt - recentCash;

  const netIncome = financialLineItems[0]?.net_income;
  if (typeof netIncome === 'number' && netIncome > 0) {
    const pe = marketCap / netIncome;
    if (pe < 15) {
      rawScore += 2;
      details.push(`Attractive P/E: ${pe.toFixed(2)}`);
    } else if (pe < 25) {
      rawScore += 1;
      details.push(`Fair P/E: ${pe.toFixed(2)}`);
    } else {
      details.push(`High or Very high P/E: ${pe.toFixed(2)}`);
    }
  } else {
    details.push('No positive net income for P/E calculation');
  }

  const fcf = financialLineItems[0]?.free_cash_flow;
  if (typeof fcf === 'number' && fcf > 0) {
    const pfcf = marketCap / fcf;
    if (pfcf < 15) {
      rawScore += 2;
      details.push(`Attractive P/FCF: ${pfcf.toFixed(2)}`);
    } else if (pfcf < 25) {
      rawScore += 1;
      details.push(`Fair P/FCF: ${pfcf.toFixed(2)}`);
    } else {
      details.push(`High/Very high P/FCF: ${pfcf.toFixed(2)}`);
    }
  } else {
    details.push('No positive free cash flow for P/FCF calculation');
  }

  const ebit = financialLineItems[0]?.ebit;
  if (enterpriseValue > 0 && typeof ebit === 'number' && ebit > 0) {
    const evEbit = enterpriseValue / ebit;
    if (evEbit < 15) {
      rawScore += 2;
      details.push(`Attractive EV/EBIT: ${evEbit.toFixed(2)}`);
    } else if (evEbit < 25) {
      rawScore += 1;
      details.push(`Fair EV/EBIT: ${evEbit.toFixed(2)}`);
    } else {
      details.push(`High EV/EBIT: ${evEbit.toFixed(2)}`);
    }
  } else {
    details.push('No valid EV/EBIT because EV <= 0 or EBIT <= 0');
  }

  const ebitda = financialLineItems[0]?.ebitda;
  if (enterpriseValue > 0 && typeof ebitda === 'number' && ebitda > 0) {
    const evEbitda = enterpriseValue / ebitda;
    if (evEbitda < 10) {
      rawScore += 2;
      details.push(`Attractive EV/EBITDA: ${evEbitda.toFixed(2)}`);
    } else if (evEbitda < 18) {
      rawScore += 1;
      details.push(`Fair EV/EBITDA: ${evEbitda.toFixed(2)}`);
    } else {
      details.push(`High EV/EBITDA: ${evEbitda.toFixed(2)}`);
    }
  } else {
    details.push('No valid EV/EBITDA because EV <= 0 or EBITDA <= 0');
  }

  const finalScore = Math.min(10, (rawScore / 8) * 10);
  return { score: Number(finalScore.toFixed(2)), details: details.join('; ') };
}

function analyzeInsiderActivity(insiderTrades: Array<Record<string, unknown>>): AnalysisSection {
  let score = 5;
  const details: string[] = [];

  if (!insiderTrades.length) {
    details.push('No insider trades data; defaulting to neutral');
    return { score, details: details.join('; ') };
  }

  let buys = 0;
  let sells = 0;
  for (const trade of insiderTrades) {
    const shares = safeNumber(trade.transaction_shares);
    if (shares === undefined) continue;
    if (shares > 0) buys += 1;
    if (shares < 0) sells += 1;
  }

  const total = buys + sells;
  if (total === 0) {
    details.push('No buy/sell transactions found; neutral');
    return { score, details: details.join('; ') };
  }

  const buyRatio = buys / total;
  if (buyRatio > 0.7) {
    score = 8;
    details.push(`Heavy insider buying: ${buys} buys vs. ${sells} sells`);
  } else if (buyRatio > 0.4) {
    score = 6;
    details.push(`Moderate insider buying: ${buys} buys vs. ${sells} sells`);
  } else {
    score = 4;
    details.push(`Mostly insider selling: ${buys} buys vs. ${sells} sells`);
  }

  return { score, details: details.join('; ') };
}

function analyzeSentiment(newsItems: Array<{ title?: string }>): AnalysisSection {
  if (!newsItems.length) {
    return { score: 5, details: 'No news data; defaulting to neutral sentiment' };
  }

  const negativeKeywords = ['lawsuit', 'fraud', 'negative', 'downturn', 'decline', 'investigation', 'recall'];
  let negativeCount = 0;
  for (const news of newsItems) {
    const titleLower = (news.title ?? '').toLowerCase();
    if (negativeKeywords.some((w) => titleLower.includes(w))) negativeCount += 1;
  }

  if (negativeCount > newsItems.length * 0.3) {
    return {
      score: 3,
      details: `High proportion of negative headlines: ${negativeCount}/${newsItems.length}`,
    };
  }

  if (negativeCount > 0) {
    return { score: 6, details: `Some negative headlines: ${negativeCount}/${newsItems.length}` };
  }

  return { score: 8, details: 'Mostly positive/neutral headlines' };
}

export interface StanleyDruckenmillerAnalysis {
  signal: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell';
  score: number;
  max_score: 10;
  growth_momentum_analysis: AnalysisSection;
  sentiment_analysis: AnalysisSection;
  insider_activity: AnalysisSection;
  risk_reward_analysis: AnalysisSection;
  valuation_analysis: AnalysisSection;
}

export class StanleyDruckenmillerPersona implements BaseFinancialPersona<StanleyDruckenmillerAnalysis> {
  name = 'stanley_druckenmiller';
  displayName = 'Stanley Druckenmiller';
  description =
    'Growth and momentum investor focused on strong earnings growth, price momentum, and favorable risk/reward. Emphasizes high-conviction positions with asymmetric upside potential.';

  requiredLineItems: Array<keyof FinancialLineItems> = [
    'revenue',
    'earnings_per_share',
    'total_debt',
    'shareholders_equity',
    'net_income',
    'free_cash_flow',
    'ebit',
    'ebitda',
    'cash_and_equivalents',
  ];

  analyze(input: {
    ticker: string;
    financials: FinancialLineItems[];
    prices: Array<{ close?: number }>;
    marketCap?: number;
    insiderTrades: Array<Record<string, unknown>>;
    news: Array<{ title?: string }>;
  }): StanleyDruckenmillerAnalysis {
    const growthMomentumAnalysis = analyzeGrowthAndMomentum(input.financials, input.prices);
    const riskRewardAnalysis = analyzeRiskReward(input.financials, input.prices);
    const valuationAnalysis = analyzeValuation(input.financials, input.marketCap);
    const insiderActivity = analyzeInsiderActivity(input.insiderTrades);
    const sentimentAnalysis = analyzeSentiment(input.news);

    const totalScore =
      growthMomentumAnalysis.score * 0.35 +
      riskRewardAnalysis.score * 0.25 +
      valuationAnalysis.score * 0.2 +
      sentimentAnalysis.score * 0.1 +
      insiderActivity.score * 0.1;

    const scoreRounded = Number(totalScore.toFixed(1));

    let signal: StanleyDruckenmillerAnalysis['signal'] = 'Hold';
    if (scoreRounded >= 7.5) signal = 'Strong Buy';
    else if (scoreRounded >= 6.0) signal = 'Buy';
    else if (scoreRounded <= 4.0) signal = 'Sell';

    return {
      signal,
      score: scoreRounded,
      max_score: 10,
      growth_momentum_analysis: growthMomentumAnalysis,
      sentiment_analysis: sentimentAnalysis,
      insider_activity: insiderActivity,
      risk_reward_analysis: riskRewardAnalysis,
      valuation_analysis: valuationAnalysis,
    };
  }
}
