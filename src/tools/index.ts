import { StructuredToolInterface } from '@langchain/core/tools';
import {
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
  getSegmentedRevenues,
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  getInsiderTrades,
} from './finance/index.js';
import { YFINANCE_TOOLS } from './yfinance/index.js';
import { tavilySearch } from './search/index.js';

const FINANCE_TOOLS: StructuredToolInterface[] = [
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  get10KFilingItems,
  get10QFilingItems,
  get8KFilingItems,
  getFilings,
  getPriceSnapshot,
  getPrices,
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getNews,
  getAnalystEstimates,
  getSegmentedRevenues,
  getInsiderTrades,
  ...(process.env.TAVILY_API_KEY ? [tavilySearch] : []),
];

const provider = (process.env.FINANCE_DATA_PROVIDER || process.env.DATA_PROVIDER || 'financialdatasets').toLowerCase();
const coreTools = provider === 'yfinance' ? YFINANCE_TOOLS : FINANCE_TOOLS;

export const TOOLS: StructuredToolInterface[] = [...coreTools, ...(process.env.TAVILY_API_KEY ? [tavilySearch] : [])];

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
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getNews,
  getAnalystEstimates,
  getSegmentedRevenues,
  getInsiderTrades,
  tavilySearch,
};
