import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { normalizeTicker } from '../shared.js';
import { formatToolResult } from '../../types.js';
import { getPersona, getAvailablePersonas, runFinancialAnalysis } from './index.js';

const FinancialPersonaInputSchema = z.object({
  tickers: z
    .array(z.string())
    .describe(
      "Array of yahoo finance stock ticker symbols to analyze. For example, ['AAPL', 'MSFT', 'D05.SI'] for Apple, Microsoft, and DBS Bank. Maximum 5 tickers."
    )
    .max(5),
  persona: z
    .string()
    .default('stanley_druckenmiller')
    .describe(
      "Investment persona to use for analysis. Options: 'stanley_druckenmiller' (growth and momentum). Each persona applies a different investment philosophy and scoring methodology."
    ),
});

export const getFinancialPersonaAnalysis = new DynamicStructuredTool({
  name: 'get_financial_persona_analysis',
  description: `Analyzes stocks through the lens of legendary investors' strategies. Each persona applies their distinct investment philosophy to evaluate companies based on growth, momentum, valuation, risk/reward, insider activity, and sentiment.

Available personas:
${getAvailablePersonas()
  .map((p) => `- ${p.displayName}: ${p.description}`)
  .join('\n')}

Returns a scored analysis with specific investment signals (Strong Buy, Buy, Hold, Sell) based on the persona's methodology. Useful for getting investment recommendations aligned with specific investing styles or for comparing how different strategies evaluate the same stock.`,
  schema: FinancialPersonaInputSchema,
  func: async (input) => {
    const persona = getPersona(input.persona);
    if (!persona) {
      throw new Error(
        `Unknown persona: ${input.persona}. Available: ${getAvailablePersonas()
          .map((p) => p.name)
          .join(', ')}`
      );
    }

    const normalizedTickers = input.tickers.map(normalizeTicker);
    const results = await runFinancialAnalysis(normalizedTickers, [persona]);

    const analyses: Record<string, unknown> = {};
    for (const [ticker, personaResults] of Object.entries(results)) {
      analyses[ticker] = personaResults[persona.name];
    }

    const data = {
      data_source: 'yfinance',
      persona: {
        name: persona.name,
        display_name: persona.displayName,
        description: persona.description,
      },
      analyses,
    };

    const sourceUrls = normalizedTickers.map((t) => `https://finance.yahoo.com/quote/${t}`);
    return formatToolResult(data, sourceUrls);
  },
});
