-- Add broker column to portfolio_holdings
ALTER TABLE portfolio_holdings ADD COLUMN IF NOT EXISTS broker text;
