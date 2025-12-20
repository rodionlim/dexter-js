import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { asRecord, normalizeTicker, pickRawNumber, yf } from './shared.js';
import { formatToolResult } from '../types.js';

const AnalystEstimatesInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol to fetch analyst estimates for. For example, 'AAPL' for Apple."),
  period: z
    .enum(['annual', 'quarterly'])
    .default('annual')
    .describe("The period for the estimates, either 'annual' or 'quarterly'."),
});

export const getAnalystEstimates = new DynamicStructuredTool({
  name: 'get_analyst_estimates',
  description:
    'Retrieves analyst estimates, price targets, and recommendation trends for a company from Yahoo Finance.',
  schema: AnalystEstimatesInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const summary = await yf.quoteSummary(ticker, {
      modules: ['financialData', 'recommendationTrend', 'earningsTrend', 'upgradeDowngradeHistory'],
    });

    const financialData = asRecord(summary.financialData);
    const recommendations = asRecord(summary.recommendationTrend);
    const earningsTrend = asRecord(summary.earningsTrend);
    const upgrades = asRecord(summary.upgradeDowngradeHistory);

    const payload = {
      data_source: 'yfinance',
      ticker,
      price_targets:
        financialData.targetMeanPrice || financialData.currentPrice
          ? {
              target_mean_price: pickRawNumber(financialData.targetMeanPrice),
              target_low_price: pickRawNumber(financialData.targetLowPrice),
              target_high_price: pickRawNumber(financialData.targetHighPrice),
              current_price: pickRawNumber(financialData.currentPrice),
              recommendation_mean: pickRawNumber(financialData.recommendationMean),
            }
          : undefined,
      recommendations: ((recommendations.trend as unknown[]) || []) as unknown[],
      earnings_trend: ((earningsTrend.trend as unknown[]) || []) as unknown[],
      upgrades_downgrades: ((upgrades.history as unknown[]) || []) as unknown[],
    };

    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/analysis`;
    return formatToolResult(payload, [sourceUrl]);
  },
});
