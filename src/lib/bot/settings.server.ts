/** Reads configurable bot settings from bot_settings with sane fallbacks. */

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (table: string) => any };
}

const DEFAULTS: Record<string, string> = {
  free_daily_partner_limit: "35",
  vip_price_stars: "199",
  vip_days: "30",
  search_cooldown_seconds: "3",
  next_cooldown_seconds: "3",
  moderation_min_ratings: "20",
  dislike_soft_restriction_threshold: "65",
  report_evidence_retention_days: "30",
  require_age_confirmation: "true",
  maintenance_mode: "false",
  matching_paused: "false",
  enable_media: "true",
  enable_video: "true",
  terms_version: "1",
  rules_version: "1",
};

export async function settings(): Promise<Record<string, string>> {
  const supabase = await db();
  const { data } = await supabase.from("bot_settings").select("key, value");
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of (data ?? []) as { key: string; value: string }[]) {
    if (row.value !== null && row.value !== undefined) map[row.key] = row.value;
  }
  return map;
}

export function num(map: Record<string, string>, key: string): number {
  const parsed = Number(map[key] ?? DEFAULTS[key]);
  return Number.isFinite(parsed) ? parsed : Number(DEFAULTS[key] ?? 0);
}

export function bool(map: Record<string, string>, key: string): boolean {
  return (map[key] ?? DEFAULTS[key]) === "true";
}
