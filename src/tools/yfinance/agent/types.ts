export interface FinancialLineItems {
  revenue?: number;
  gross_profit?: number;
  earnings_per_share?: number;
  total_debt?: number;
  shareholders_equity?: number;
  total_assets?: number;
  total_liabilities?: number;
  net_income?: number;
  free_cash_flow?: number;
  ebit?: number;
  ebitda?: number;
  cash_and_equivalents?: number;

  depreciation_and_amortization?: number;
  capital_expenditure?: number;

  dividends_and_other_cash_distributions?: number;
  issuance_or_purchase_of_equity_shares?: number;
}

export interface AnalysisSection {
  score: number;
  details: string;
}

export interface BaseFinancialPersona<T = unknown> {
  name: string;
  displayName: string;
  description: string;
  requiredLineItems: Array<keyof FinancialLineItems>;
  analyze(input: {
    ticker: string;
    financials: FinancialLineItems[];
    prices: Array<{ close?: number }>;
    marketCap?: number;
    insiderTrades: Array<Record<string, unknown>>;
    news: Array<{ title?: string }>;
  }): T;
}
