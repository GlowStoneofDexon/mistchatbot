CREATE TABLE public.bot_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  language_code TEXT,
  state TEXT NOT NULL DEFAULT 'idle',
  partner_id BIGINT,
  dialog_id UUID,
  dialog_started_at TIMESTAMPTZ,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  total_ratings INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  chats_completed INTEGER NOT NULL DEFAULT 0,
  banned BOOLEAN NOT NULL DEFAULT false,
  blocked_until TIMESTAMPTZ,
  last_rated_dialog UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bot_users_state ON public.bot_users (state, last_seen);

GRANT ALL ON public.bot_users TO service_role;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id BIGINT NOT NULL,
  reported_id BIGINT NOT NULL,
  dialog_id UUID,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, reported_id, dialog_id)
);

CREATE INDEX idx_reports_reported ON public.reports (reported_id);

GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id BIGINT NOT NULL,
  rated_id BIGINT NOT NULL,
  dialog_id UUID NOT NULL,
  value SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rater_id, dialog_id)
);

CREATE INDEX idx_ratings_rated ON public.ratings (rated_id);

GRANT ALL ON public.ratings TO service_role;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_settings TO service_role;
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.match_partner(p_user BIGINT)
RETURNS TABLE (partner BIGINT, dialog UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner BIGINT;
  v_dialog UUID := gen_random_uuid();
BEGIN
  SELECT telegram_id INTO v_partner
  FROM public.bot_users
  WHERE state = 'searching'
    AND telegram_id <> p_user
    AND banned = false
  ORDER BY last_seen ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_partner IS NULL THEN
    UPDATE public.bot_users
      SET state = 'searching', partner_id = NULL, dialog_id = NULL, last_seen = now()
      WHERE telegram_id = p_user;
    RETURN;
  END IF;

  UPDATE public.bot_users
    SET state = 'chatting', partner_id = v_partner, dialog_id = v_dialog, dialog_started_at = now(), last_seen = now()
    WHERE telegram_id = p_user;

  UPDATE public.bot_users
    SET state = 'chatting', partner_id = p_user, dialog_id = v_dialog, dialog_started_at = now(), last_seen = now()
    WHERE telegram_id = v_partner;

  partner := v_partner;
  dialog := v_dialog;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.bot_public_stats()
RETURNS TABLE (total_users BIGINT, active_dialogs BIGINT, waiting BIGINT, chats_completed BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.bot_users),
    (SELECT count(*) / 2 FROM public.bot_users WHERE state = 'chatting'),
    (SELECT count(*) FROM public.bot_users WHERE state = 'searching'),
    (SELECT COALESCE(sum(chats_completed), 0)::BIGINT / 2 FROM public.bot_users);
$$;

GRANT EXECUTE ON FUNCTION public.bot_public_stats() TO anon, authenticated, service_role;