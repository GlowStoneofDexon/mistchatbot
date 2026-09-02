/** Reads configurable bot settings from bot_settings with sane fallbacks. */

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (table: string) => any };
}

export const DEFAULTS: Record<string, string> = {
  free_daily_partner_limit: "35",
  vip_price_stars: "199",
  vip_days: "30",
  vip_price_stars_week: "49",
  vip_days_week: "7",
  vip_price_stars_year: "1500",
  vip_days_year: "365",
  paid_model_enabled: "true",
  force_join_channels: "",
  admin_ids: "",
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

/** Admin-editable copy: falls back to the built-in text when no override is stored. */
export function content(map: Record<string, string>, key: string, fallback: string): string {
  const value = map[`text_${key}`];
  return value && value.trim() ? value : fallback;
}

export type VipPlanRow = { code: "week" | "month" | "year"; label: string; stars: number; days: number };

export function vipPlans(map: Record<string, string>): VipPlanRow[] {
  return [
    { code: "week", label: `${num(map, "vip_days_week")} days`, stars: num(map, "vip_price_stars_week"), days: num(map, "vip_days_week") },
    { code: "month", label: `${num(map, "vip_days")} days`, stars: num(map, "vip_price_stars"), days: num(map, "vip_days") },
    { code: "year", label: `${num(map, "vip_days_year")} days`, stars: num(map, "vip_price_stars_year"), days: num(map, "vip_days_year") },
  ];
}
