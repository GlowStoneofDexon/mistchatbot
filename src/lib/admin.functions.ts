import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminUser = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  state: string;
  likes: number;
  dislikes: number;
  total_ratings: number;
  report_count: number;
  chats_completed: number;
  banned: boolean;
  blocked_until: string | null;
};

export type AdminReport = {
  id: string;
  dialog_id: string | null;
  reason: string;
  created_at: string;
  reporter: AdminUser | null;
  reported: AdminUser | null;
  distinct_reports: number;
};

export type AdminSettings = {
  chat_locked: boolean;
  launch_at: string;
  tester_ids: string;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (table: string) => any;
  };
}

export const isAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { admin: Boolean(data) };
  });

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminReport[]> => {
    await assertAdmin(context as any);
    const db = await admin();

    const { data: reports } = await db
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (reports ?? []) as {
      id: string;
      reporter_id: number;
      reported_id: number;
      dialog_id: string | null;
      reason: string;
      created_at: string;
    }[];

    const ids = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.reported_id])));
    const { data: users } = ids.length
      ? await db.from("bot_users").select("*").in("telegram_id", ids)
      : { data: [] };
    const byId = new Map<number, AdminUser>(
      ((users ?? []) as AdminUser[]).map((u) => [Number(u.telegram_id), u]),
    );

    const { data: allReports } = await db.from("reports").select("reporter_id, reported_id");
    const distinct = new Map<number, Set<number>>();
    for (const r of (allReports ?? []) as { reporter_id: number; reported_id: number }[]) {
      const set = distinct.get(r.reported_id) ?? new Set<number>();
      set.add(r.reporter_id);
      distinct.set(r.reported_id, set);
    }

    return rows.map((r) => ({
      id: r.id,
      dialog_id: r.dialog_id,
      reason: r.reason,
      created_at: r.created_at,
      reporter: byId.get(Number(r.reporter_id)) ?? null,
      reported: byId.get(Number(r.reported_id)) ?? null,
      distinct_reports: distinct.get(r.reported_id)?.size ?? 0,
    }));
  });

export const setBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { telegramId: number; banned: boolean }) => {
    if (!Number.isFinite(input.telegramId)) throw new Error("Invalid user id");
    return { telegramId: Math.trunc(input.telegramId), banned: Boolean(input.banned) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const db = await admin();
    const { sendMessage } = await import("@/lib/bot/telegram.server");

    if (data.banned) {
      await db
        .from("bot_users")
        .update({ banned: true, state: "idle", partner_id: null, dialog_id: null })
        .eq("telegram_id", data.telegramId);
      await sendMessage(
        data.telegramId,
        "🚫 Your account has been permanently banned for breaking the /rules. You can no longer use this bot.",
      );
    } else {
      await db
        .from("bot_users")
        .update({ banned: false, blocked_until: null, report_count: 0 })
        .eq("telegram_id", data.telegramId);
      await db.from("reports").delete().eq("reported_id", data.telegramId);
      await sendMessage(
        data.telegramId,
        "♻️ Your ban has been lifted. Please follow the /rules — use /search to chat.",
      );
    }
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSettings> => {
    await assertAdmin(context as any);
    const db = await admin();
    const { data } = await db.from("bot_settings").select("key, value");
    const map = new Map<string, string>(
      ((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]),
    );
    return {
      chat_locked: (map.get("chat_locked") ?? "true") !== "false",
      launch_at: map.get("launch_at") ?? "",
      tester_ids: map.get("tester_ids") ?? "",
    };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AdminSettings) => ({
    chat_locked: Boolean(input.chat_locked),
    launch_at: String(input.launch_at ?? "").trim(),
    tester_ids: String(input.tester_ids ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const db = await admin();
    const now = new Date().toISOString();
    await db.from("bot_settings").upsert(
      [
        { key: "chat_locked", value: data.chat_locked ? "true" : "false", updated_at: now },
        { key: "launch_at", value: data.launch_at, updated_at: now },
        { key: "tester_ids", value: data.tester_ids, updated_at: now },
      ],
      { onConflict: "key" },
    );
    return { ok: true };
  });
