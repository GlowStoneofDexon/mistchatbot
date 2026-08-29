-- 1. bot_users: onboarding, account status, VIP, preferences, cooldowns
ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS vip_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pref_age_min INT,
  ADD COLUMN IF NOT EXISTS pref_age_max INT,
  ADD COLUMN IF NOT EXISTS self_age INT,
  ADD COLUMN IF NOT EXISTS pref_country TEXT,
  ADD COLUMN IF NOT EXISTS pref_language TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS last_search_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_link_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warnings INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restricted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT false;

-- 2. match sessions
CREATE TABLE IF NOT EXISTS public.match_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a BIGINT NOT NULL,
  user_b BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ended_by BIGINT,
  end_reason TEXT,
  report_id UUID
);
GRANT ALL ON public.match_sessions TO service_role;
ALTER TABLE public.match_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS match_sessions_users_idx ON public.match_sessions (user_a, user_b, started_at DESC);

-- 3. rolling 24h unique-partner ledger
CREATE TABLE IF NOT EXISTS public.partner_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL,
  partner_id BIGINT NOT NULL,
  match_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.partner_interactions TO service_role;
ALTER TABLE public.partner_interactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS partner_interactions_window_idx
  ON public.partner_interactions (user_id, started_at DESC, partner_id);

-- 4. reports: moderation case fields
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS severity TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_action TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
UPDATE public.reports SET category = reason WHERE category IS NULL;

-- 5. minimal report evidence (never media binaries)
CREATE TABLE IF NOT EXISTS public.report_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL DEFAULT 'text',
  telegram_message_id BIGINT,
  text_content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
);
GRANT ALL ON public.report_evidence TO service_role;
ALTER TABLE public.report_evidence ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS report_evidence_report_idx ON public.report_evidence (report_id);

-- 6. moderation audit log
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  report_id UUID,
  action_type TEXT NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS moderation_actions_user_idx ON public.moderation_actions (telegram_id, created_at DESC);

-- 7. Telegram Stars payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  telegram_payment_charge_id TEXT UNIQUE,
  invoice_payload TEXT,
  product TEXT NOT NULL DEFAULT 'vip_30d',
  stars_amount INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  refund_status TEXT
);
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payments_user_idx ON public.payments (telegram_id, purchased_at DESC);

-- 8. support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  payment_id UUID,
  category TEXT NOT NULL DEFAULT 'payment',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- 9. conversations are no longer stored
DROP TABLE IF EXISTS public.dialog_messages;

-- 10. configuration defaults
INSERT INTO public.bot_settings (key, value) VALUES
  ('free_daily_partner_limit', '35'),
  ('vip_price_stars', '199'),
  ('vip_days', '30'),
  ('search_cooldown_seconds', '3'),
  ('next_cooldown_seconds', '3'),
  ('message_rate_limit', '12'),
  ('moderation_min_ratings', '20'),
  ('dislike_soft_restriction_threshold', '65'),
  ('report_evidence_retention_days', '30'),
  ('terms_version', '1'),
  ('rules_version', '1'),
  ('require_age_confirmation', 'true'),
  ('enable_media', 'true'),
  ('enable_video', 'true'),
  ('matching_paused', 'false'),
  ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- 11. rolling 24h unique-partner usage
CREATE OR REPLACE FUNCTION public.partner_slots_used(p_user BIGINT)
RETURNS INT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT partner_id)::INT
  FROM public.partner_interactions
  WHERE user_id = p_user AND started_at > now() - INTERVAL '24 hours';
$$;

-- 12. matching engine v2
CREATE OR REPLACE FUNCTION public.match_partner(p_user BIGINT)
RETURNS TABLE(partner BIGINT, dialog UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me public.bot_users%ROWTYPE;
  v_partner BIGINT;
  v_dialog UUID := gen_random_uuid();
  v_vip BOOLEAN;
BEGIN
  SELECT * INTO v_me FROM public.bot_users WHERE telegram_id = p_user;
  IF NOT FOUND THEN RETURN; END IF;
  v_vip := v_me.vip_expires_at IS NOT NULL AND v_me.vip_expires_at > now();

  SELECT c.telegram_id INTO v_partner
  FROM public.bot_users c
  WHERE c.state = 'searching'
    AND c.telegram_id <> p_user
    AND c.banned = false
    AND c.account_status = 'active'
    AND c.onboarding_status = 'done'
    AND (c.blocked_until IS NULL OR c.blocked_until < now())
    AND (c.restricted_until IS NULL OR c.restricted_until < now())
  ORDER BY
    -- avoid repeating a partner from the last 24 hours
    (EXISTS (
      SELECT 1 FROM public.partner_interactions pi
      WHERE pi.user_id = p_user AND pi.partner_id = c.telegram_id
        AND pi.started_at > now() - INTERVAL '24 hours'
    )) ASC,
    -- VIP preferences: preferred, then progressively relaxed
    (v_vip AND v_me.pref_language IS NOT NULL AND c.language_code IS DISTINCT FROM v_me.pref_language) ASC,
    (v_vip AND v_me.pref_country IS NOT NULL AND c.country_code IS DISTINCT FROM v_me.pref_country) ASC,
    (v_vip AND v_me.pref_age_min IS NOT NULL AND (c.self_age IS NULL OR c.self_age < v_me.pref_age_min)) ASC,
    (v_vip AND v_me.pref_age_max IS NOT NULL AND (c.self_age IS NULL OR c.self_age > v_me.pref_age_max)) ASC,
    c.last_seen ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_partner IS NULL THEN
    UPDATE public.bot_users
      SET state = 'searching', partner_id = NULL, dialog_id = NULL, last_seen = now()
      WHERE telegram_id = p_user;
    RETURN;
  END IF;

  INSERT INTO public.match_sessions (id, user_a, user_b, status)
  VALUES (v_dialog, p_user, v_partner, 'active');

  INSERT INTO public.partner_interactions (user_id, partner_id, match_id)
  VALUES (p_user, v_partner, v_dialog), (v_partner, p_user, v_dialog);

  UPDATE public.bot_users
    SET state = 'chatting', partner_id = v_partner, dialog_id = v_dialog,
        dialog_started_at = now(), last_seen = now()
    WHERE telegram_id = p_user;

  UPDATE public.bot_users
    SET state = 'chatting', partner_id = p_user, dialog_id = v_dialog,
        dialog_started_at = now(), last_seen = now()
    WHERE telegram_id = v_partner;

  partner := v_partner;
  dialog := v_dialog;
  RETURN NEXT;
END;
$$;

-- 13. admin overview stats
CREATE OR REPLACE FUNCTION public.bot_admin_stats()
RETURNS TABLE(
  total_users BIGINT, searching BIGINT, active_chats BIGINT, vip_active BIGINT,
  stars_revenue BIGINT, open_reports BIGINT, banned BIGINT, restricted BIGINT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.bot_users),
    (SELECT count(*) FROM public.bot_users WHERE state = 'searching'),
    (SELECT count(*) / 2 FROM public.bot_users WHERE state = 'chatting'),
    (SELECT count(*) FROM public.bot_users WHERE vip_expires_at > now()),
    (SELECT COALESCE(sum(stars_amount), 0)::BIGINT FROM public.payments WHERE status = 'paid'),
    (SELECT count(*) FROM public.reports WHERE status = 'open'),
    (SELECT count(*) FROM public.bot_users WHERE banned = true),
    (SELECT count(*) FROM public.bot_users WHERE restricted_until > now() OR blocked_until > now());
$$;
