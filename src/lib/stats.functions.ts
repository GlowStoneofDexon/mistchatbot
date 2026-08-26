import { createServerFn } from "@tanstack/react-start";

export type BotStats = {
  total_users: number;
  chatting_now: number;
  searching_now: number;
  chats_completed: number;
};

export const getBotStats = createServerFn({ method: "GET" }).handler(async (): Promise<BotStats> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("bot_public_stats");
  if (error) {
    console.error("bot_public_stats failed", error.message);
    return { total_users: 0, chatting_now: 0, searching_now: 0, chats_completed: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Partial<BotStats> | null;
  return {
    total_users: Number(row?.total_users ?? 0),
    chatting_now: Number(row?.chatting_now ?? 0),
    searching_now: Number(row?.searching_now ?? 0),
    chats_completed: Number(row?.chats_completed ?? 0),
  };
});
