-- Seed config table with default billing configuration
-- This ensures the config table has at least one row for the application to function

INSERT INTO config (id, billing_provider, enable_account_billing, enable_team_account_billing, enable_team_accounts)
VALUES (1, 'stripe', true, true, true)
ON CONFLICT (id) DO NOTHING;



