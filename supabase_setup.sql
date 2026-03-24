-- ============================================================
-- AltumProb — Supabase Database Setup
-- Corrés este SQL en: supabase.com → tu proyecto → SQL Editor
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  plan text DEFAULT 'free' CHECK (plan IN ('free','pro','institutional')),
  watchlist jsonb DEFAULT '["AAPL","GGAL","YPF","MELI","NVDA","MSFT"]',
  portfolio jsonb DEFAULT '[]',
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_activated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_stripe_idx ON users(stripe_customer_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Price alerts table (for future email alerts feature)
CREATE TABLE IF NOT EXISTS price_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  condition text CHECK (condition IN ('above','below')),
  price numeric NOT NULL,
  triggered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Row Level Security (users can only see their own data)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by our API)
CREATE POLICY "service_all" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_all_alerts" ON price_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Done! Copy your Supabase URL and service_role key from:
-- supabase.com → project → Settings → API
-- ============================================================