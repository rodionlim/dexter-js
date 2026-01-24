import { DynamicStructuredTool, StructuredToolInterface } from '@langchain/core/tools';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';

// Import yfinance tools directly to avoid circular deps
import {
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
} from './fundamentals.js';
import { getFilings } from './filings.js';
import { getPriceSnapshot, getPrices } from './prices.js';
import { getFinancialMetricsSnapshot, getFinancialMetrics } from './metrics.js';
import { getNews } from './news.js';
import { getAnalystEstimates } from './estimates.js';
import { getInsiderTrades } from './insider.js';
import { getFinancialPersonaAnalysis } from './agent/tool.js';

const BASE_YFINANCE_TOOLS: StructuredToolInterface[] = [
  // Price Data
  getPriceSnapshot,
  getPrices,
  // Fundamentals
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  // Metrics & Estimates
  getFinancialMetricsSnapshot,
  getFinancialMetrics,
  getAnalystEstimates,
  // SEC Filings (metadata only)
  getFilings,
  // Other Data
  getNews,
  getInsiderTrades,
];

const PERSONA_KEYWORDS = [
  'persona',
  'investor persona',
  'investment persona',
  'legendary investor',
  'investing style',
  'investment style',
  'buffett',
  'warren buffett',
  'druckenmiller',
  'stanley druckenmiller',
];

function wantsPersonaAnalysis(query: string): boolean {
  const q = query.toLowerCase();
  return PERSONA_KEYWORDS.some((term) => q.includes(term));
}

function buildRouterPrompt(): string {
  return `You are a financial data routing assistant for Yahoo Finance (yfinance).
Current date: ${getCurrentDate()}

Given a user's natural language query about financial data, call the appropriate yfinance tool(s).

## Ticker Rules
1. US-listed tickers: no suffix (e.g., AAPL, MSFT).
2. SGX tickers: use .SI suffix (e.g., DBS → D05.SI).
3. HK tickers: use .HK suffix (e.g., 0700.HK).

## Date Inference
- "last year" → start_date 1 year ago, end_date today
- "last quarter" → start_date 3 months ago, end_date today
- "past 5 years" → start_date 5 years ago, end_date today
- "YTD" → start_date Jan 1 of current year, end_date today

## Tool Selection
- For "current" or "latest" data, use snapshot tools (get_price_snapshot, get_financial_metrics_snapshot).
- For "historical" or "over time" data, use date-range tools (get_prices).
- For P/E ratio, market cap, valuation metrics → get_financial_metrics_snapshot.
- For revenue, earnings, profitability → get_income_statements.
- For debt, assets, equity → get_balance_sheets.
- For cash flow, free cash flow → get_cash_flow_statements.
- For comprehensive analysis → get_all_financial_statements.
- For SEC filings metadata → get_filings (no 10-K/10-Q item extraction in yfinance).
- For news → get_news.
- For insider activity → get_insider_trades.

## Persona Analysis
- Only use get_financial_persona_analysis when the user explicitly asks for a persona or mentions specific investor personas (e.g., Buffett, Druckenmiller).

Call the appropriate tool(s) now.`;
}

const FinancialSearchInputSchema = z.object({
  query: z.string().describe('Natural language query about financial data'),
});

export function createFinancialSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_search',
    description: `Intelligent agentic search for Yahoo Finance data. Takes a natural language query and automatically routes to appropriate yfinance tools. Use for:
- Stock prices (current or historical)
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics (P/E ratio, market cap, EPS, dividend yield)
- SEC filings metadata (10-K/10-Q/8-K listing)
- Analyst estimates and price targets
- Company news
- Insider trading activity
- Persona-based investment analysis (explicit persona requests only)`,
    schema: FinancialSearchInputSchema,
    func: async (input) => {
      const includePersonaTool = wantsPersonaAnalysis(input.query);
      const tools = includePersonaTool ? [...BASE_YFINANCE_TOOLS, getFinancialPersonaAnalysis] : BASE_YFINANCE_TOOLS;
      const toolMap = new Map(tools.map((t) => [t.name, t]));

      const response = (await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools,
      })) as AIMessage;

      const toolCalls = response.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          try {
            const tool = toolMap.get(tc.name);
            if (!tool) {
              throw new Error(`Tool '${tc.name}' not found`);
            }
            const rawResult = await tool.invoke(tc.args);
            const result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(result);
            return {
              tool: tc.name,
              args: tc.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: tc.name,
              args: tc.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      const successfulResults = results.filter((r) => r.error === null);
      const failedResults = results.filter((r) => r.error !== null);

      const allUrls = results.flatMap((r) => r.sourceUrls);
      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        const args = result.args as Record<string, unknown>;
        const ticker = args.ticker as string | undefined;
        const tickers = Array.isArray(args.tickers) ? (args.tickers as string[]).join(',') : undefined;
        const key = ticker ? `${result.tool}_${ticker}` : tickers ? `${result.tool}_${tickers}` : result.tool;
        combinedData[key] = result.data;
      }

      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((r) => ({
          tool: r.tool,
          args: r.args,
          error: r.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
