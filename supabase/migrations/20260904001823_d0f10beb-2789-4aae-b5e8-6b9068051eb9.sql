ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS gender text;

CREATE TABLE IF NOT EXISTS public.saved_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id bigint NOT NULL,
  partner_id bigint NOT NULL,
  dialog_id uuid,
  alias text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, partner_id)
);

GRANT ALL ON public.saved_partners TO service_role;
ALTER TABLE public.saved_partners ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_partners_owner ON public.saved_partners (owner_id);

CREATE TABLE IF NOT EXISTS public.chat_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id bigint NOT NULL,
  to_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

GRANT ALL ON public.chat_invites TO service_role;
ALTER TABLE public.chat_invites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_chat_invites_to ON public.chat_invites (to_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_invites_from ON public.chat_invites (from_id, status);

INSERT INTO public.bot_settings (key, value) VALUES
  ('ton_payout_address', 'UQDWb1NXG-Ac1g5KMHkXFe_8n1tDV70M7B40K7dkv7Cyk4LZ'),
  ('saved_partners_enabled', 'true'),
  ('vip_saved_partner_limit', '25'),
  ('invite_cooldown_seconds', '30'),
  ('online_window_minutes', '5')
ON CONFLICT (key) DO NOTHING;