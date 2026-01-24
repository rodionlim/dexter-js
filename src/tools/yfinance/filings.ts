import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { isLikelyNonUsTicker, normalizeTicker, yf } from './shared.js';
import { formatToolResult } from '../types.js';

const FilingsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol to fetch filings for. For example, 'AAPL' for Apple."),
  filing_type: z
    .enum(['10-K', '10-Q', '8-K'])
    .optional()
    .describe(
      "Optional specific filing type. Use '10-K' for annual reports, '10-Q' for quarterly reports, or '8-K' for current reports. If omitted, returns most recent filings of any type."
    ),
  limit: z
    .number()
    .default(10)
    .describe(
      'Maximum number of filings to return (default: 10). Returns the most recent N filings matching the criteria.'
    ),
});

const Filing10KItemsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol. For example, 'AAPL' for Apple."),
  year: z.number().describe('The year of the 10-K filing. For example, 2023.'),
  item: z.array(z.string()).optional(),
});

const Filing10QItemsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol. For example, 'AAPL' for Apple."),
  year: z.number().describe('The year of the 10-Q filing. For example, 2023.'),
  quarter: z.number().describe('The quarter of the 10-Q filing (1, 2, 3, or 4).'),
  item: z.array(z.string()).optional(),
});

const Filing8KItemsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol. For example, 'AAPL' for Apple."),
  accession_number: z.string().describe('The SEC accession number for the 8-K filing.'),
  item: z.array(z.string()).optional(),
});

export const getFilings = new DynamicStructuredTool({
  name: 'get_filings',
  description:
    'Retrieves filing metadata for a company using Yahoo Finance SEC filings feed. Returns dates, types, and document URLs.',
  schema: FilingsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);

    if (isLikelyNonUsTicker(ticker)) {
      const data = {
        data_source: 'yfinance',
        ticker,
        filings: [],
        note: 'SEC filings are generally only available for US-listed tickers; skipping for non-US ticker suffix.',
      };
      return formatToolResult(data, []);
    }

    const summary = await yf.quoteSummary(ticker, { modules: ['secFilings'] });
    const filings = (summary.secFilings?.filings || [])
      .filter((filing) => (input.filing_type ? filing.type === input.filing_type : true))
      .slice(0, input.limit)
      .map((filing) => ({
        date: filing.date,
        type: filing.type,
        title: filing.title,
        edgar_url: filing.edgarUrl,
        exhibits: filing.exhibits,
      }));

    const data = { data_source: 'yfinance', ticker, filings };
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/sec-filings`;
    return formatToolResult(data, [sourceUrl]);
  },
});

function notSupported(description: string) {
  return new DynamicStructuredTool({
    name: description,
    description: `${description} is not supported in the yfinance provider. Use get_filings metadata instead.`,
    // Minimal schema to satisfy LangChain; callers should avoid invoking.
    schema: z.object({ placeholder: z.string().optional() }),
    func: async () => JSON.stringify({ error: 'Not supported in yfinance provider' }),
  });
}

export const get10KFilingItems = notSupported('get_10K_filing_items');
export const get10QFilingItems = notSupported('get_10Q_filing_items');
export const get8KFilingItems = notSupported('get_8K_filing_items');
