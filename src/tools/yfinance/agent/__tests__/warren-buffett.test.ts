import { runFinancialAnalysis } from '../index.js';
import { WarrenBuffettPersona, type WarrenBuffettAnalysis } from '../personas/warren-buffett.js';

function integrationDescribe() {
  return process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
}

describe('WarrenBuffettPersona (unit)', () => {
  it('produces a stable shape and signal', () => {
    const persona = new WarrenBuffettPersona();

    const analysis = persona.analyze({
      ticker: 'TEST',
      marketCap: 100_000_000,
      prices: [{ close: 100 }],
      news: [],
      insiderTrades: [],
      financials: [
        {
          revenue: 1_000_000_000,
          gross_profit: 600_000_000,
          net_income: 200_000_000,
          free_cash_flow: 180_000_000,
          ebit: 220_000_000,
          total_debt: 50_000_000,
          shareholders_equity: 900_000_000,
          depreciation_and_amortization: 20_000_000,
          capital_expenditure: -30_000_000,
          dividends_and_other_cash_distributions: -10_000_000,
          issuance_or_purchase_of_equity_shares: -5_000_000,
        },
        {
          revenue: 900_000_000,
          net_income: 150_000_000,
          shareholders_equity: 800_000_000,
          ebit: 180_000_000,
          free_cash_flow: 140_000_000,
          depreciation_and_amortization: 18_000_000,
          capital_expenditure: -28_000_000,
        },
        {
          revenue: 800_000_000,
          net_income: 120_000_000,
          shareholders_equity: 700_000_000,
          ebit: 150_000_000,
          free_cash_flow: 120_000_000,
          depreciation_and_amortization: 16_000_000,
          capital_expenditure: -26_000_000,
        },
        {
          revenue: 700_000_000,
          net_income: 100_000_000,
          shareholders_equity: 650_000_000,
          ebit: 120_000_000,
          free_cash_flow: 90_000_000,
          depreciation_and_amortization: 14_000_000,
          capital_expenditure: -24_000_000,
        },
      ],
    });

    const expectedKeys = [
      'signal',
      'score',
      'max_score',
      'confidence',
      'fundamental_analysis',
      'consistency_analysis',
      'moat_analysis',
      'management_analysis',
      'valuation_analysis',
    ];

    for (const key of expectedKeys) {
      expect(analysis).toHaveProperty(key);
    }

    expect(analysis.max_score).toBe(10);
    expect(typeof analysis.score).toBe('number');
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(10);

    expect(typeof analysis.confidence).toBe('number');
    expect(analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(analysis.confidence).toBeLessThanOrEqual(100);

    expect(['Strong Buy', 'Buy', 'Hold', 'Sell']).toContain(analysis.signal);
  });
});

integrationDescribe()('WarrenBuffettPersona (integration)', () => {
  it('fetches real data and returns expected analysis structure', async () => {
    const ticker = 'GOOGL';
    const tickers = [ticker];

    const persona = new WarrenBuffettPersona();
    const results = await runFinancialAnalysis(tickers, [persona]);

    expect(results).toBeTruthy();
    expect(typeof results).toBe('object');
    expect(results[ticker]).toBeTruthy();

    const analysis = results[ticker][persona.name] as WarrenBuffettAnalysis;

    const expectedKeys = [
      'signal',
      'score',
      'max_score',
      'confidence',
      'fundamental_analysis',
      'consistency_analysis',
      'moat_analysis',
      'management_analysis',
      'valuation_analysis',
    ];

    for (const key of expectedKeys) {
      expect(analysis).toHaveProperty(key);
    }

    expect(analysis.max_score).toBe(10);
    expect(['Strong Buy', 'Buy', 'Hold', 'Sell']).toContain(analysis.signal);
  }, 120_000);
});
