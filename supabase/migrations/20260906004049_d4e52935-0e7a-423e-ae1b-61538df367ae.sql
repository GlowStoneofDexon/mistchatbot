CREATE TABLE IF NOT EXISTS public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  chat_id bigint,
  chat_username text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS join_requests_unique
  ON public.join_requests (telegram_id, coalesce(chat_username, ''), coalesce(chat_id, 0));

GRANT ALL ON public.join_requests TO service_role;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.match_partner(p_user bigint)
RETURNS TABLE(partner bigint, dialog uuid)
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
    (EXISTS (
      SELECT 1 FROM public.partner_interactions pi
      WHERE pi.user_id = p_user AND pi.partner_id = c.telegram_id
    )) ASC,
    (v_vip AND v_me.pref_language IS NOT NULL AND c.language_code IS DISTINCT FROM v_me.pref_language) ASC,
    (v_vip AND v_me.pref_country IS NOT NULL AND c.country_code IS DISTINCT FROM v_me.pref_country) ASC,
    (v_vip AND v_me.pref_age_min IS NOT NULL AND (c.self_age IS NULL OR c.self_age < v_me.pref_age_min)) ASC,
    (v_vip AND v_me.pref_age_max IS NOT NULL AND (c.self_age IS NULL OR c.self_age > v_me.pref_age_max)) ASC,
    random()
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