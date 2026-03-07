CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Template',
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  content TEXT NOT NULL DEFAULT '',
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Untitled Template',
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE message_templates
SET
  name = COALESCE(NULLIF(name, ''), 'Untitled Template'),
  channel = COALESCE(NULLIF(channel, ''), 'email'),
  content = COALESCE(content, ''),
  variables = COALESCE(variables, '[]'::jsonb),
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE message_templates
  ALTER COLUMN name SET DEFAULT 'Untitled Template',
  ALTER COLUMN channel SET DEFAULT 'email',
  ALTER COLUMN content SET DEFAULT '',
  ALTER COLUMN variables SET DEFAULT '[]'::jsonb,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_templates' AND column_name = 'template_name'
  ) THEN
    EXECUTE $sql$
      UPDATE message_templates
      SET template_name = COALESCE(NULLIF(template_name, ''), NULLIF(name, ''), 'Untitled Template')
    $sql$;
    EXECUTE $sql$
      ALTER TABLE message_templates
      ALTER COLUMN template_name SET DEFAULT 'Untitled Template'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_templates' AND column_name = 'body'
  ) THEN
    EXECUTE $sql$
      UPDATE message_templates
      SET body = COALESCE(body, content, '')
    $sql$;
    EXECUTE $sql$
      ALTER TABLE message_templates
      ALTER COLUMN body SET DEFAULT ''
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'message_templates' AND column_name = 'status'
  ) THEN
    EXECUTE $sql$
      UPDATE message_templates
      SET status = COALESCE(NULLIF(status, ''), CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END)
    $sql$;
    EXECUTE $sql$
      ALTER TABLE message_templates
      ALTER COLUMN status SET DEFAULT 'active'
    $sql$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_message_templates_updated_at ON message_templates;
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  source TEXT NOT NULL DEFAULT 'messaging',
  recipient_name TEXT,
  recipient_email TEXT,
  recipient_phone TEXT,
  subject TEXT,
  content TEXT,
  status TEXT DEFAULT 'logged',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE message_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'messaging',
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

UPDATE message_logs
SET
  channel = COALESCE(NULLIF(channel, ''), 'email'),
  source = COALESCE(NULLIF(source, ''), 'messaging'),
  status = COALESCE(NULLIF(status, ''), 'logged'),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now());

ALTER TABLE message_logs
  ALTER COLUMN channel SET DEFAULT 'email',
  ALTER COLUMN source SET DEFAULT 'messaging',
  ALTER COLUMN status SET DEFAULT 'logged',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_channel
  ON message_templates (tenant_id, channel);

CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_created_at
  ON message_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_id
  ON message_logs (campaign_id);
