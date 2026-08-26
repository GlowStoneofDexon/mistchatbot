/** Anti-spam rate limiting for the Telegram relay, backed by Postgres. */

const WINDOW_MS = 10_000;
const MAX_MESSAGES = 12; // relayed messages per window
const MAX_COMMANDS = 6; // commands per window

export type RateVerdict = { allowed: boolean; warn: boolean };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (table: string) => any };
}

/**
 * Consumes one unit of the user's budget. Returns allowed=false when the user is
 * flooding, and warn=true only the first time inside a window so we don't spam back.
 */
export async function consume(telegramId: number, kind: "message" | "command"): Promise<RateVerdict> {
  const supabase = await db();
  const now = Date.now();

  const { data } = await supabase
    .from("bot_rate_limits")
    .select("window_start, msg_count, cmd_count, warned_at")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const startedAt = data?.window_start ? new Date(data.window_start).getTime() : 0;
  const fresh = !data || now - startedAt > WINDOW_MS;

  const msgCount = (fresh ? 0 : (data?.msg_count ?? 0)) + (kind === "message" ? 1 : 0);
  const cmdCount = (fresh ? 0 : (data?.cmd_count ?? 0)) + (kind === "command" ? 1 : 0);
  const limit = kind === "message" ? MAX_MESSAGES : MAX_COMMANDS;
  const used = kind === "message" ? msgCount : cmdCount;
  const allowed = used <= limit;

  const warnedAt = data?.warned_at ? new Date(data.warned_at).getTime() : 0;
  const warn = !allowed && (fresh || now - warnedAt > WINDOW_MS);

  await supabase.from("bot_rate_limits").upsert(
    {
      telegram_id: telegramId,
      window_start: new Date(fresh ? now : startedAt).toISOString(),
      msg_count: msgCount,
      cmd_count: cmdCount,
      warned_at: warn ? new Date(now).toISOString() : (data?.warned_at ?? null),
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "telegram_id" },
  );

  return { allowed, warn };
}

export const FLOOD_MESSAGE =
  "🐢 <b>Slow down.</b> You are sending messages too fast — wait a few seconds and try again.";
