/** Pre-launch gate: chatting is locked until the premiere, testers excluded. */

export const ADMIN_TELEGRAM_ID = 8949906548;
export const CHANNEL_URL = "https://t.me/MistChatChannel";
export const DASHBOARD_URL = "https://mistchatbot.lovable.app";


async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (table: string) => any };
}

async function setting(key: string): Promise<string | null> {
  const supabase = await db();
  const { data } = await supabase.from("bot_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

/** Tester ids come from the bot_settings allowlist plus any *_TESTER_ID secret. */
function envTesterIds(): number[] {
  return Object.entries(process.env)
    .filter(([key]) => /TESTER_ID/i.test(key))
    .flatMap(([, value]) => String(value ?? "").split(/[,\s]+/))
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function isAllowedTester(telegramId: number): Promise<boolean> {
  if (telegramId === ADMIN_TELEGRAM_ID) return true;
  if (envTesterIds().includes(telegramId)) return true;
  const list = (await setting("tester_ids")) ?? "";
  return list
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .includes(telegramId);
}

async function saveSetting(key: string, value: string) {
  const supabase = await db();
  await supabase
    .from("bot_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Tester ids stored in bot_settings, merged with the ones coming from secrets. */
export async function listTesters(): Promise<number[]> {
  const list = (await setting("tester_ids")) ?? "";
  const stored = list
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Array.from(new Set([...stored, ...envTesterIds()]));
}

async function storedTesters(): Promise<number[]> {
  const list = (await setting("tester_ids")) ?? "";
  return list
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export async function addTester(telegramId: number): Promise<number[]> {
  const next = Array.from(new Set([...(await storedTesters()), telegramId])).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  await saveSetting("tester_ids", next.join(","));
  return next;
}

export async function removeTester(telegramId: number): Promise<number[]> {
  const next = (await storedTesters()).filter((id) => id !== telegramId);
  await saveSetting("tester_ids", next.join(","));
  return next;
}


export type LaunchState = { locked: boolean; launchAt: Date | null };

export async function launchState(): Promise<LaunchState> {
  const locked = (await setting("chat_locked")) !== "false";
  const raw = await setting("launch_at");
  const date = raw ? new Date(raw) : null;
  const launchAt = date && !Number.isNaN(date.getTime()) ? date : null;
  if (launchAt && launchAt.getTime() <= Date.now()) return { locked: false, launchAt };
  return { locked, launchAt };
}

function countdown(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "any moment now";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [days && `${days}d`, hours && `${hours}h`, `${minutes}m`].filter(Boolean);
  return parts.join(" ");
}

export function premiereMessage(state: LaunchState) {
  const when = state.launchAt
    ? `🗓 Premiere: <b>${state.launchAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })}</b>\n⏳ Starts in <b>${countdown(state.launchAt)}</b>`
    : "🗓 Premiere date: <b>announced soon</b>";

  return `<b>🌫 Mist Chat Bot is not open yet</b>

Anonymous chatting unlocks at the premiere. Until then only the test group can chat.

${when}

📣 Join <a href="${CHANNEL_URL}">@MistChatChannel</a> for the launch announcement and updates.

Meanwhile you can still use /help, /rules, /terms, /vip and /myid.`;
}

/** Returns true when the user must be blocked from chatting right now. */
export async function chatBlocked(telegramId: number): Promise<string | null> {
  const state = await launchState();
  if (!state.locked) return null;
  if (await isAllowedTester(telegramId)) return null;
  return premiereMessage(state);
}
