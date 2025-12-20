import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
} from './fundamentals.js';
import { getFilings, get10KFilingItems, get10QFilingItems, get8KFilingItems } from './filings.js';
import { getPriceSnapshot, getPrices } from './prices.js';
import { getFinancialMetricsSnapshot, getFinancialMetrics } from './metrics.js';
import { getNews } from './news.js';
import { getAnalystEstimates } from './estimates.js';
import { getInsiderTrades } from './insider.js';
import { getFinancialPersonaAnalysis } from './agent/tool.js';

export const YFINANCE_TOOLS = [
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getFilings,
  get10KFilingItems,
  get10QFilingItems,
  get8KFilingItems,
  getPriceSnapshot,
  getPrices,
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getNews,
  getAnalystEstimates,
  getInsiderTrades,
  getFinancialPersonaAnalysis,
];

export {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getFilings,
  get10KFilingItems,
  get10QFilingItems,
  get8KFilingItems,
  getPriceSnapshot,
  getPrices,
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getNews,
  getAnalystEstimates,
  getInsiderTrades,
  getFinancialPersonaAnalysis,
};
