CREATE TABLE IF NOT EXISTS public.dialog_messages (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null,
  sender_id bigint not null,
  partner_id bigint,
  side smallint not null default 1,
  kind text not null default 'text',
  content text,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);

GRANT ALL ON public.dialog_messages TO service_role;

ALTER TABLE public.dialog_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dialog_messages_dialog ON public.dialog_messages (dialog_id, created_at);

GRANT ALL ON public.user_roles TO service_role;