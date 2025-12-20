import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { normalizeTicker, toISODate, yf } from './shared.js';
import { formatToolResult } from '../types.js';

const NewsInputSchema = z.object({
  ticker: z.string().describe("The stock ticker symbol to fetch news for. For example, 'AAPL' for Apple."),
  start_date: z.string().optional().describe('The start date to fetch news from (YYYY-MM-DD).'),
  end_date: z.string().optional().describe('The end date to fetch news to (YYYY-MM-DD).'),
  limit: z.number().default(10).describe('The number of news articles to retrieve. Max is 100.'),
});

function inRange(published: Date | undefined, start?: string, end?: string): boolean {
  if (!published) return true;
  const ts = published.getTime();
  if (start) {
    const startTs = new Date(start).getTime();
    if (!Number.isNaN(startTs) && ts < startTs) return false;
  }
  if (end) {
    const endTs = new Date(end).getTime();
    if (!Number.isNaN(endTs) && ts > endTs) return false;
  }
  return true;
}

export const getNews = new DynamicStructuredTool({
  name: 'get_news',
  description:
    'Retrieves recent news articles for a given company ticker via Yahoo Finance, including title, publisher, published time, and link.',
  schema: NewsInputSchema,
  func: async (input) => {
    const ticker = normalizeTicker(input.ticker);
    const searchResult = await yf.search(ticker, { newsCount: Math.min(input.limit, 50) });
    const articles = searchResult.news || [];

    const news = [] as Record<string, unknown>[];
    for (const article of articles) {
      const publishTime = (article as { providerPublishTime?: number | Date }).providerPublishTime;
      const published =
        publishTime instanceof Date
          ? publishTime
          : typeof publishTime === 'number'
          ? new Date(publishTime * 1000)
          : undefined;

      if (!inRange(published, input.start_date, input.end_date)) continue;

      news.push({
        id: article.uuid,
        title: article.title,
        publisher: article.publisher,
        published_at: toISODate(published),
        link: article.link,
        type: article.type,
        summary: (article as { summary?: string }).summary,
        tickers: article.relatedTickers,
      });
      if (news.length >= input.limit) break;
    }

    const data = { data_source: 'yfinance', ticker, news };
    const sourceUrl = `https://finance.yahoo.com/quote/${ticker}/news`;
    return formatToolResult(data, [sourceUrl]);
  },
});
