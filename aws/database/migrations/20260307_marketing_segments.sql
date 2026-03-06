CREATE TABLE IF NOT EXISTS marketing_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_marketing_segments_tenant_key UNIQUE (tenant_id, key)
);

ALTER TABLE marketing_segments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS key TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE marketing_segments
SET
  key = COALESCE(NULLIF(key, ''), CONCAT('custom-segment-', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))),
  name = COALESCE(NULLIF(name, ''), 'Untitled Segment'),
  rules = COALESCE(rules, '{}'::jsonb),
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE marketing_segments
  ALTER COLUMN key SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN rules SET NOT NULL,
  ALTER COLUMN rules SET DEFAULT '{}'::jsonb,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_marketing_segments_tenant_key'
  ) THEN
    ALTER TABLE marketing_segments
      ADD CONSTRAINT uq_marketing_segments_tenant_key UNIQUE (tenant_id, key);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_marketing_segments_updated_at ON marketing_segments;
CREATE TRIGGER update_marketing_segments_updated_at
  BEFORE UPDATE ON marketing_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_marketing_segments_tenant_active
  ON marketing_segments (tenant_id, is_active, updated_at DESC);
