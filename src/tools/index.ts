import { createFinancialSearch as createFinanceFinancialSearch } from './finance/index.js';
import { createFinancialSearch as createYfinanceFinancialSearch } from './yfinance/financial-search.js';

// Tool registry - the primary way to access tools and their descriptions
export { getToolRegistry, getTools, buildToolDescriptions } from './registry.js';
export type { RegisteredTool } from './registry.js';

// Individual tool exports (for backward compatibility and direct access)
export { tavilySearch } from './search/index.js';

export function createFinancialSearch(model: string) {
  const provider = process.env.FINANCE_DATA_PROVIDER?.toLowerCase();
  if (provider === 'yfinance') {
    return createYfinanceFinancialSearch(model);
  }
  return createFinanceFinancialSearch(model);
}

// Tool descriptions
export {
  FINANCIAL_SEARCH_DESCRIPTION,
  WEB_SEARCH_DESCRIPTION,
} from './descriptions/index.js';
