import { getPersona, runFinancialAnalysis } from '../index.js';
import { StanleyDruckenmillerPersona, type StanleyDruckenmillerAnalysis } from '../personas/druckenmiller.js';

function integrationDescribe() {
  return process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
}

integrationDescribe()('stanleyDruckenmillerPersona (integration)', () => {
  it('fetches real data and returns expected analysis structure', async () => {
    const ticker = 'D05.SI';
    const tickers = ['QCOM', ticker];
    
    const persona = new StanleyDruckenmillerPersona();
    const results = await runFinancialAnalysis(tickers, [persona]);

    expect(results).toBeTruthy();
    expect(typeof results).toBe('object');
    expect(results[ticker]).toBeTruthy();

    const analysis = results[ticker][persona.name] as StanleyDruckenmillerAnalysis;

    const expectedKeys = [
      'signal',
      'score',
      'max_score',
      'growth_momentum_analysis',
      'risk_reward_analysis',
      'valuation_analysis',
      'insider_activity',
      'sentiment_analysis',
    ];

    for (const key of expectedKeys) {
      expect(analysis).toHaveProperty(key);
    }

    expect(analysis.max_score).toBe(10);
    expect(typeof analysis.score).toBe('number');
    expect(analysis.score).toBeGreaterThanOrEqual(0);
    expect(analysis.score).toBeLessThanOrEqual(10);

    expect(['Strong Buy', 'Buy', 'Hold', 'Sell']).toContain(analysis.signal);

    for (const sectionKey of [
      'growth_momentum_analysis',
      'risk_reward_analysis',
      'valuation_analysis',
      'insider_activity',
      'sentiment_analysis',
    ] as const) {
      const section = analysis[sectionKey];
      expect(section).toHaveProperty('score');
      expect(section).toHaveProperty('details');
      expect(typeof section.score).toBe('number');
      expect(typeof section.details).toBe('string');
    }
  }, 120_000);
});
