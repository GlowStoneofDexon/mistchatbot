-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Anti-spam rate limiting (bot only)
CREATE TABLE public.bot_rate_limits (
  telegram_id bigint PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  msg_count integer NOT NULL DEFAULT 0,
  cmd_count integer NOT NULL DEFAULT 0,
  warned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_rate_limits TO service_role;
ALTER TABLE public.bot_rate_limits ENABLE ROW LEVEL SECURITY;

-- Launch gate settings
INSERT INTO public.bot_settings (key, value)
VALUES
  ('launch_at', ''),
  ('tester_ids', '8949906548'),
  ('chat_locked', 'true')
ON CONFLICT (key) DO NOTHING;