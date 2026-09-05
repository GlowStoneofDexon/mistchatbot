/** Full admin panel, entirely inside Telegram. Verification is by Telegram ID. */

import {
  sendMessage,
  editMessageText,
  copyMessage,
  type InlineKeyboard,
} from "./telegram.server";
import { ADMIN_TELEGRAM_ID, CHANNEL_URL, launchState, listTesters, addTester, removeTester } from "./gate.server";
import { settings, num, bool, DEFAULTS, vipPlans } from "./settings.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  };
}

async function getSetting(key: string): Promise<string | null> {
  const supabase = await db();
  const { data } = await supabase.from("bot_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

export async function saveSetting(key: string, value: string) {
  const supabase = await db();
  await supabase
    .from("bot_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/* ------------------------------------------------------------------ access */

export async function isBotAdmin(telegramId: number): Promise<boolean> {
  if (telegramId === ADMIN_TELEGRAM_ID) return true;
  const extra = (await getSetting("admin_ids")) ?? "";
  return extra
    .split(/[,\s]+/)
    .map((v) => Number(v))
    .includes(telegramId);
}

/* ------------------------------------------------------------------ input sessions */

type AdminSession = { action: string; arg: string; expires: number };

const sessionKey = (id: number) => `adminsess:${id}`;

export async function getAdminSession(id: number): Promise<AdminSession | null> {
  const raw = await getSetting(sessionKey(id));
  if (!raw) return null;
  const [action, arg, expires] = raw.split("|");
  if (!action || !expires || Number(expires) < Date.now()) return null;
  return { action, arg: arg ?? "", expires: Number(expires) };
}

async function ask(id: number, action: string, prompt: string, arg = "") {
  await saveSetting(sessionKey(id), `${action}|${arg}|${Date.now() + 15 * 60_000}`);
  await sendMessage(id, `${prompt}\n\nSend /cancel to abort.`);
}

async function clearSession(id: number) {
  await saveSetting(sessionKey(id), "");
}

/* ------------------------------------------------------------------ user lookup */

/** Resolves "@username", "username" or a numeric Telegram ID to a bot user row. */
export async function resolveUser(input: string) {
  const supabase = await db();
  const value = input.trim().replace(/^@/, "");
  if (/^\d+$/.test(value)) {
    const { data } = await supabase.from("bot_users").select("*").eq("telegram_id", Number(value)).maybeSingle();
    return data ?? null;
  }
  const { data } = await supabase.from("bot_users").select("*").ilike("username", value).maybeSingle();
  return data ?? null;
}

const tag = (u: { telegram_id: number; username?: string | null } | null, fallback?: string) =>
  u ? `<code>${u.telegram_id}</code> (${u.username ? `@${u.username}` : "no username"})` : `<code>${fallback}</code>`;

/* ------------------------------------------------------------------ menus */

const back: InlineKeyboard = [[{ text: "⬅️ Admin menu", callback_data: "a:menu" }]];

export async function adminMenu(chatId: number, messageId?: number) {
  const config = await settings();
  const state = await launchState();
  const supabase = await db();
  const { data } = await supabase.rpc("bot_admin_stats");
  const s = Array.isArray(data) ? data[0] : data;

  const text = `🛡 <b>Mist Chat — Admin panel</b>

Premiere: <b>${state.locked ? "🔒 locked" : "🟢 public"}</b>${state.launchAt ? ` · ${state.launchAt.toUTCString()}` : ""}
Paid model: <b>${bool(config, "paid_model_enabled") ? "💎 on" : "🆓 off"}</b> · Maintenance: <b>${bool(config, "maintenance_mode") ? "on" : "off"}</b>
Users: <b>${s?.total_users ?? 0}</b> · Open reports: <b>${s?.open_reports ?? 0}</b>

Choose a section:`;

  const keyboard: InlineKeyboard = [
    [
      { text: "🎬 Premiere", callback_data: "a:premiere" },
      { text: "🎟 Testers", callback_data: "a:testers" },
    ],
    [
      { text: "👤 Users & bans", callback_data: "a:users" },
      { text: "🚩 Reports", callback_data: "a:reports" },
    ],
    [
      { text: "📢 Broadcast", callback_data: "a:broadcast" },
      { text: "💎 Subscriptions", callback_data: "a:plans" },
    ],
    [
      { text: "🔗 Force-join", callback_data: "a:channels" },
      { text: "📊 Analytics", callback_data: "a:analytics" },
    ],
    [
      { text: "📝 Content", callback_data: "a:content" },
      { text: "⚙️ System", callback_data: "a:system" },
    ],
    [
      { text: "🤝 Limits & invites", callback_data: "a:limits" },
      { text: "🎫 Support tickets", callback_data: "a:tickets" },
    ],
  ];

  if (messageId) await editMessageText(chatId, messageId, text, keyboard);
  else await sendMessage(chatId, text, keyboard);
}

async function premiereMenu(chatId: number) {
  const state = await launchState();
  await sendMessage(
    chatId,
    `🎬 <b>Premiere</b>\n\nStatus: <b>${state.locked ? "🔒 locked (testers only)" : "🟢 public"}</b>\nDate: <b>${
      state.launchAt ? state.launchAt.toUTCString() : "not set"
    }</b>\nChannel: ${CHANNEL_URL}`,
    [
      [{ text: "🗓 Set premiere date", callback_data: "a:premiere:date" }],
      [{ text: "🔒 Lock (testers only)", callback_data: "a:premiere:lock" }],
      [{ text: "🚀 Stop premiere — go public", callback_data: "a:premiere:open" }],
      ...back,
    ],
  );
}

async function testersMenu(chatId: number) {
  const list = await listTesters();
  await sendMessage(
    chatId,
    `🎟 <b>Testers</b>\n\n${list.length ? list.map((id) => `• <code>${id}</code>`).join("\n") : "No testers yet."}`,
    [
      [{ text: "➕ Add tester", callback_data: "a:testers:add" }],
      [{ text: "➖ Remove tester", callback_data: "a:testers:del" }],
      ...back,
    ],
  );
}

async function usersMenu(chatId: number) {
  await sendMessage(chatId, "👤 <b>Users & bans</b>\n\nYou can use a @username or a numeric Telegram ID.", [
    [{ text: "🔨 Ban user", callback_data: "a:user:ban" }],
    [{ text: "⏳ Restrict 24h", callback_data: "a:user:restrict" }],
    [{ text: "♻️ Unban / lift restriction", callback_data: "a:user:unban" }],
    [{ text: "ℹ️ User info", callback_data: "a:user:info" }],
    [{ text: "✉️ Message a user", callback_data: "a:user:dm" }],
    ...back,
  ]);
}

async function plansMenu(chatId: number) {
  const config = await settings();
  const plans = vipPlans(config);
  await sendMessage(
    chatId,
    `💎 <b>Subscription model</b>\n\nPaid model: <b>${
      bool(config, "paid_model_enabled") ? "ON — free users are limited" : "OFF — everyone unlimited, VIP not on sale"
    }</b>\nFree limit: <b>${num(config, "free_daily_partner_limit")}</b> partners / 24h\n\n${plans
      .map((p) => `• ${p.code}: <b>${p.stars} ⭐</b> / ${p.days} days`)
      .join("\n")}`,
    [
      [
        {
          text: bool(config, "paid_model_enabled") ? "🆓 Switch to free model" : "💎 Start paid model",
          callback_data: "a:plans:toggle",
        },
      ],
      [{ text: "🔢 Free partner limit", callback_data: "a:plans:limit" }],
      [
        { text: "Week ⭐", callback_data: "a:plans:week" },
        { text: "Month ⭐", callback_data: "a:plans:month" },
        { text: "Year ⭐", callback_data: "a:plans:year" },
      ],
      ...back,
    ],
  );
}

async function channelsMenu(chatId: number) {
  const raw = (await getSetting("force_join_channels")) ?? "";
  const list = raw.split(/[,\s]+/).filter(Boolean);
  await sendMessage(
    chatId,
    `🔗 <b>Force-join channels</b>\n\n${
      list.length ? list.map((c) => `• ${c}`).join("\n") : "None — users can chat without joining."
    }\n\nUsers must join every channel here before /search works. The bot must be an admin of each channel.`,
    [
      [{ text: "➕ Add channel", callback_data: "a:ch:add" }],
      [{ text: "➖ Remove channel", callback_data: "a:ch:del" }],
      ...back,
    ],
  );
}

async function contentMenu(chatId: number) {
  await sendMessage(
    chatId,
    "📝 <b>Content</b>\n\nOverride the text the bot sends. Leaving an override empty restores the built-in copy. HTML is supported.",
    [
      [{ text: "👋 /start welcome", callback_data: "a:text:welcome" }],
      [{ text: "🆘 /help", callback_data: "a:text:help" }],
      [{ text: "📋 /rules", callback_data: "a:text:rules" }],
      [{ text: "📖 /terms & privacy", callback_data: "a:text:terms" }],
      [{ text: "💎 /vip extra note", callback_data: "a:text:vip" }],
      [{ text: "⭐ /paysupport", callback_data: "a:text:paysupport" }],
      ...back,
    ],
  );
}

async function systemMenu(chatId: number) {
  const config = await settings();
  const flag = (k: string) => (bool(config, k) ? "🟢 on" : "🔴 off");
  await sendMessage(
    chatId,
    `⚙️ <b>System</b>\n\nMaintenance: ${flag("maintenance_mode")}\nMatching: ${
      bool(config, "matching_paused") ? "⏸ paused" : "🟢 running"
    }\nMedia: ${flag("enable_media")} · Video: ${flag("enable_video")}\nSearch cooldown: <b>${num(
      config,
      "search_cooldown_seconds",
    )}s</b> · Next: <b>${num(config, "next_cooldown_seconds")}s</b>`,
    [
      [{ text: "🛠 Toggle maintenance", callback_data: "a:sys:maintenance_mode" }],
      [{ text: "⏸ Toggle matching pause", callback_data: "a:sys:matching_paused" }],
      [
        { text: "🖼 Media", callback_data: "a:sys:enable_media" },
        { text: "🎬 Video", callback_data: "a:sys:enable_video" },
      ],
      [{ text: "⏱ Search cooldown", callback_data: "a:sys:cd_search" }],
      [{ text: "⏱ Next cooldown", callback_data: "a:sys:cd_next" }],
      ...back,
    ],
  );
}

async function limitsMenu(chatId: number) {
  const config = await settings();
  await sendMessage(
    chatId,
    `🤝 <b>Limits & invites</b>\n\nFree partners / 24h: <b>${num(config, "free_daily_partner_limit")}</b>\nSaved partners (VIP): <b>${num(
      config,
      "vip_saved_partner_limit",
    )}</b>\nSave & re-invite: <b>${bool(config, "saved_partners_enabled") ? "🟢 on" : "🔴 off"}</b>\nInvite cooldown: <b>${num(
      config,
      "invite_cooldown_seconds",
    )}s</b>\nOnline window: <b>${num(config, "online_window_minutes")} min</b>\nTON payout: <code>${
      config["ton_payout_address"] ?? "—"
    }</code>`,
    [
      [{ text: "🔢 Free partner limit", callback_data: "a:plans:limit" }],
      [{ text: "💾 Saved partner limit", callback_data: "a:lim:saved" }],
      [{ text: "⏱ Invite cooldown", callback_data: "a:lim:invcd" }],
      [{ text: "🟢 Online window", callback_data: "a:lim:online" }],
      [{ text: "🔁 Toggle save & re-invite", callback_data: "a:sys:saved_partners_enabled" }],
      [{ text: "💰 TON payout address", callback_data: "a:lim:ton" }],
      ...back,
    ],
  );
}

async function analytics(chatId: number) {
  const supabase = await db();
  const { data } = await supabase.rpc("bot_admin_stats");
  const s = Array.isArray(data) ? data[0] : data;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: newUsers } = await supabase
    .from("bot_users")
    .select("telegram_id", { count: "exact", head: true })
    .gte("created_at", since);
  const { count: dialogs } = await supabase
    .from("match_sessions")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since);
  const { count: tickets } = await supabase
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  await sendMessage(
    chatId,
    `📊 <b>Analytics</b>\n\n👥 Users: <b>${s?.total_users ?? 0}</b> (+${newUsers ?? 0} in 24h)\n🔍 Searching: <b>${
      s?.searching ?? 0
    }</b>\n💬 Active chats: <b>${s?.active_chats ?? 0}</b>\n🤝 Dialogs in 24h: <b>${dialogs ?? 0}</b>\n💎 VIP active: <b>${
      s?.vip_active ?? 0
    }</b>\n⭐ Stars revenue: <b>${s?.stars_revenue ?? 0}</b>\n🚩 Open reports: <b>${
      s?.open_reports ?? 0
    }</b>\n🎫 Open tickets: <b>${tickets ?? 0}</b>\n🔨 Banned: <b>${s?.banned ?? 0}</b> · ⏳ Restricted: <b>${
      s?.restricted ?? 0
    }</b>`,
    back,
  );
}

/* ------------------------------------------------------------------ reports */

async function reportsList(chatId: number) {
  const supabase = await db();
  const { data } = await supabase
    .from("reports")
    .select("id, reporter_id, reported_id, reason, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as { id: string; reporter_id: number; reported_id: number; reason: string }[];
  if (!rows.length) {
    await sendMessage(chatId, "🚩 <b>Reports</b>\n\nNo open reports. 🎉", back);
    return;
  }
  await sendMessage(chatId, `🚩 <b>Open reports (${rows.length})</b>`, [
    ...rows.map((r) => [
      {
        text: `${r.reason} · P2 ${r.reported_id}`,
        callback_data: `a:rep:${r.id.replace(/-/g, "").slice(0, 32)}`,
      },
    ]),
    ...back,
  ]);
}

const expand = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

async function reportDetail(chatId: number, reportId: string) {
  const supabase = await db();
  const { data: report } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
  if (!report) {
    await sendMessage(chatId, "That report no longer exists.", back);
    return;
  }
  const reporter = await resolveUser(String(report.reporter_id));
  const reported = await resolveUser(String(report.reported_id));
  const { data: evidence } = await supabase
    .from("report_evidence")
    .select("evidence_type, text_content, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true })
    .limit(10);

  const lines = ((evidence ?? []) as { evidence_type: string; text_content: string | null }[])
    .map((e, i) => `${i + 1}. [${e.evidence_type}] ${e.text_content ? e.text_content.slice(0, 200) : "(media)"}`)
    .join("\n");

  const short = reportId.replace(/-/g, "").slice(0, 32);
  await sendMessage(
    chatId,
    `🚩 <b>Report</b> <code>${short.slice(0, 8)}</code>\nReason: <b>${report.reason}</b>\nStatus: ${report.status}\nWhen: ${new Date(
      report.created_at,
    ).toUTCString()}\n\n<b>Partner 1 (reporter)</b>: ${tag(reporter, String(report.reporter_id))}\n<b>Partner 2 (reported)</b>: ${tag(
      reported,
      String(report.reported_id),
    )}\n\n<b>Evidence</b>\n${lines || "None submitted."}`,
    [
      [{ text: "✉️ Reply to reporter", callback_data: `a:repr:${short}` }],
      [{ text: "🔨 Ban Partner 2", callback_data: `a:repb:${short}` }],
      [{ text: "⏳ Restrict Partner 2 (24h)", callback_data: `a:reps:${short}` }],
      [{ text: "✅ Resolve — no action", callback_data: `a:repc:${short}` }],
      ...back,
    ],
  );
}

/* ------------------------------------------------------------------ moderation actions */

export async function banUserById(id: number, reason: string, by = "admin") {
  const supabase = await db();
  const target = await resolveUser(String(id));
  if (target?.partner_id) {
    await sendMessage(target.partner_id, "🛑 Your partner was removed by moderation. Use /search for a new one.");
    await supabase
      .from("bot_users")
      .update({ state: "idle", partner_id: null, dialog_id: null })
      .eq("telegram_id", target.partner_id);
  }
  await supabase
    .from("bot_users")
    .update({ banned: true, account_status: "banned", state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", id);
  await supabase.from("moderation_actions").insert({ telegram_id: id, action_type: "ban", reason, created_by: by });
  await sendMessage(id, "🚫 Your account has been permanently banned for breaking the /rules.");
}

export async function restrictUserById(id: number, hours: number, reason: string) {
  const supabase = await db();
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  await supabase
    .from("bot_users")
    .update({ restricted_until: until, state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", id);
  await supabase
    .from("moderation_actions")
    .insert({ telegram_id: id, action_type: "restrict", reason, created_by: "admin", expires_at: until });
  await sendMessage(
    id,
    `⏳ <b>You have been restricted for ${hours} hours</b> by moderation.\n\nReason: ${reason}\nPlease read the /rules.`,
  );
}

async function unbanUserById(id: number) {
  const supabase = await db();
  await supabase
    .from("bot_users")
    .update({
      banned: false,
      account_status: "active",
      blocked_until: null,
      restricted_until: null,
      flagged_for_review: false,
      report_count: 0,
    })
    .eq("telegram_id", id);
  await sendMessage(id, "♻️ Your restriction has been lifted. Please follow the /rules — use /search to chat.");
}

async function broadcast(chatId: number, text: string) {
  const supabase = await db();
  const { data } = await supabase.from("bot_users").select("telegram_id").eq("banned", false).limit(20000);
  const ids = ((data ?? []) as { telegram_id: number }[]).map((r) => Number(r.telegram_id));
  await sendMessage(chatId, `📢 Sending to <b>${ids.length}</b> users…`);
  let ok = 0;
  for (const id of ids) {
    const sent = await sendMessage(id, text);
    if (sent) ok++;
    await new Promise((r) => setTimeout(r, 40));
  }
  await sendMessage(chatId, `📢 Broadcast finished — delivered to <b>${ok}</b> / ${ids.length}.`, back);
}

/* ------------------------------------------------------------------ tickets */

async function ticketsList(chatId: number) {
  const supabase = await db();
  const { data } = await supabase
    .from("support_tickets")
    .select("id, telegram_id, message, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as { id: string; telegram_id: number; message: string }[];
  if (!rows.length) {
    await sendMessage(chatId, "🎫 No open support tickets.", back);
    return;
  }
  for (const t of rows) {
    await sendMessage(
      chatId,
      `🎫 <b>Ticket</b> from <code>${t.telegram_id}</code>\n\n${t.message.slice(0, 800)}`,
      [
        [{ text: "✉️ Reply", callback_data: `a:tkr:${t.id.replace(/-/g, "")}` }],
        [{ text: "✅ Close ticket", callback_data: `a:tkc:${t.id.replace(/-/g, "")}` }],
      ],
    );
  }
  await sendMessage(chatId, "—", back);
}

/* ------------------------------------------------------------------ callbacks */

export async function handleAdminCallback(chatId: number, data: string, messageId?: number): Promise<boolean> {
  if (!data.startsWith("a:")) return false;
  if (!(await isBotAdmin(chatId))) return true;
  const supabase = await db();

  switch (data) {
    case "a:menu":
      await adminMenu(chatId, messageId);
      return true;
    case "a:premiere":
      await premiereMenu(chatId);
      return true;
    case "a:premiere:date":
      await ask(chatId, "premiere_date", "🗓 Send the premiere date & time in UTC, e.g. <code>2026-09-15 18:00</code>.");
      return true;
    case "a:premiere:lock":
      await saveSetting("chat_locked", "true");
      await sendMessage(chatId, "🔒 Premiere lock enabled — only testers can chat.", back);
      return true;
    case "a:premiere:open":
      await saveSetting("chat_locked", "false");
      await sendMessage(chatId, "🚀 Premiere stopped — the bot is now public for everyone.", back);
      return true;
    case "a:testers":
      await testersMenu(chatId);
      return true;
    case "a:testers:add":
      await ask(chatId, "tester_add", "➕ Send the tester @username or Telegram ID (several separated by spaces).");
      return true;
    case "a:testers:del":
      await ask(chatId, "tester_del", "➖ Send the tester @username or Telegram ID to remove.");
      return true;
    case "a:users":
      await usersMenu(chatId);
      return true;
    case "a:user:ban":
      await ask(chatId, "user_ban", "🔨 Send <code>@username</code> or ID, optionally followed by a reason.");
      return true;
    case "a:user:restrict":
      await ask(chatId, "user_restrict", "⏳ Send <code>@username|ID</code> and optionally hours, e.g. <code>@john 48</code>.");
      return true;
    case "a:user:unban":
      await ask(chatId, "user_unban", "♻️ Send the @username or ID to unban.");
      return true;
    case "a:user:info":
      await ask(chatId, "user_info", "ℹ️ Send the @username or ID to inspect.");
      return true;
    case "a:user:dm":
      await ask(chatId, "user_dm", "✉️ Send <code>@username|ID</code> then your message on the same line.");
      return true;
    case "a:broadcast":
      await ask(chatId, "broadcast", "📢 Send the broadcast message (HTML allowed). It goes to every non-banned user.");
      return true;
    case "a:plans":
      await plansMenu(chatId);
      return true;
    case "a:plans:toggle": {
      const config = await settings();
      const next = bool(config, "paid_model_enabled") ? "false" : "true";
      await saveSetting("paid_model_enabled", next);
      await sendMessage(
        chatId,
        next === "true"
          ? "💎 Paid model started — free users are limited again and VIP plans are on sale."
          : "🆓 Free model — everyone gets unlimited partners and VIP is not on sale.",
      );
      await plansMenu(chatId);
      return true;
    }
    case "a:plans:limit":
      await ask(chatId, "plan_limit", "🔢 Send the number of free partners per 24 hours (e.g. <code>35</code>).");
      return true;
    case "a:plans:week":
      await ask(chatId, "plan_week", "Send <code>stars days</code> for the weekly plan, e.g. <code>49 7</code>.");
      return true;
    case "a:plans:month":
      await ask(chatId, "plan_month", "Send <code>stars days</code> for the monthly plan, e.g. <code>199 30</code>.");
      return true;
    case "a:plans:year":
      await ask(chatId, "plan_year", "Send <code>stars days</code> for the yearly plan, e.g. <code>1500 365</code>.");
      return true;
    case "a:channels":
      await channelsMenu(chatId);
      return true;
    case "a:ch:add":
      await ask(chatId, "ch_add", "➕ Send the channel @username (the bot must be an admin there).");
      return true;
    case "a:ch:del":
      await ask(chatId, "ch_del", "➖ Send the channel @username to remove.");
      return true;
    case "a:analytics":
      await analytics(chatId);
      return true;
    case "a:content":
      await contentMenu(chatId);
      return true;
    case "a:system":
      await systemMenu(chatId);
      return true;
    case "a:reports":
      await reportsList(chatId);
      return true;
    case "a:tickets":
      await ticketsList(chatId);
      return true;
    case "a:limits":
      await limitsMenu(chatId);
      return true;
    case "a:lim:saved":
      await ask(chatId, "lim_saved", "💾 Send the maximum number of saved partners a VIP can keep.");
      return true;
    case "a:lim:invcd":
      await ask(chatId, "lim_invcd", "⏱ Send the invitation cooldown in seconds.");
      return true;
    case "a:lim:online":
      await ask(chatId, "lim_online", "🟢 Send the online window in minutes.");
      return true;
    case "a:lim:ton":
      await ask(chatId, "lim_ton", "💰 Send the TON payout address to store.");
      return true;
    case "a:sys:cd_search":
      await ask(chatId, "cd_search", "⏱ Send the search cooldown in seconds.");
      return true;
    case "a:sys:cd_next":
      await ask(chatId, "cd_next", "⏱ Send the /next cooldown in seconds.");
      return true;
  }

  const flag = /^a:sys:(maintenance_mode|matching_paused|enable_media|enable_video|saved_partners_enabled)$/.exec(data);
  if (flag) {
    const config = await settings();
    const next = bool(config, flag[1]!) ? "false" : "true";
    await saveSetting(flag[1]!, next);
    if (flag[1] === "saved_partners_enabled") await limitsMenu(chatId);
    else await systemMenu(chatId);
    return true;
  }

  const text = /^a:text:([a-z]+)$/.exec(data);
  if (text) {
    await ask(
      chatId,
      `text_${text[1]}`,
      `📝 Send the new text for <b>${text[1]}</b>. Send <code>reset</code> to restore the built-in copy.`,
    );
    return true;
  }

  const rep = /^a:(rep|repr|repb|reps|repc):([0-9a-f]{32})$/.exec(data);
  if (rep) {
    const id = expand(rep[2]!);
    if (rep[1] === "rep") {
      await reportDetail(chatId, id);
      return true;
    }
    const { data: report } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
    if (!report) {
      await sendMessage(chatId, "That report no longer exists.", back);
      return true;
    }
    if (rep[1] === "repr") {
      await ask(chatId, "report_reply", "✉️ Send your reply — it goes only to the reporter.", id);
      return true;
    }
    if (rep[1] === "repb") {
      await banUserById(Number(report.reported_id), `report ${String(report.reason)}`);
      await supabase
        .from("reports")
        .update({ status: "resolved", admin_action: "ban", resolved_at: new Date().toISOString() })
        .eq("id", id);
      await sendMessage(chatId, `🔨 Banned <code>${report.reported_id}</code> and resolved the case.`, back);
      return true;
    }
    if (rep[1] === "reps") {
      await restrictUserById(Number(report.reported_id), 24, `report ${String(report.reason)}`);
      await supabase
        .from("reports")
        .update({ status: "resolved", admin_action: "restrict", resolved_at: new Date().toISOString() })
        .eq("id", id);
      await sendMessage(chatId, `⏳ Restricted <code>${report.reported_id}</code> for 24h.`, back);
      return true;
    }
    await supabase
      .from("reports")
      .update({ status: "resolved", admin_action: "none", resolved_at: new Date().toISOString() })
      .eq("id", id);
    await sendMessage(chatId, "✅ Case resolved with no action.", back);
    return true;
  }

  const ticket = /^a:(tkr|tkc):([0-9a-f]{32})$/.exec(data);
  if (ticket) {
    const id = expand(ticket[2]!);
    if (ticket[1] === "tkr") {
      await ask(chatId, "ticket_reply", "✉️ Send your reply — it goes only to that user.", id);
      return true;
    }
    await supabase
      .from("support_tickets")
      .update({ status: "closed", resolved_at: new Date().toISOString() })
      .eq("id", id);
    await sendMessage(chatId, "✅ Ticket closed.", back);
    return true;
  }

  return true;
}

/* ------------------------------------------------------------------ text input */

/** Handles the admin's answer to a pending prompt. Returns true when consumed. */
export async function handleAdminInput(chatId: number, raw: string, message?: { chat: { id: number }; message_id: number }): Promise<boolean> {
  const session = await getAdminSession(chatId);
  if (!session) return false;
  const value = raw.trim();

  if (value === "/cancel") {
    await clearSession(chatId);
    await sendMessage(chatId, "Cancelled.", back);
    return true;
  }
  await clearSession(chatId);
  const supabase = await db();

  switch (session.action) {
    case "premiere_date": {
      const date = new Date(value.replace(" ", "T") + (/[Zz]|[+-]\d\d:?\d\d$/.test(value) ? "" : "Z"));
      if (Number.isNaN(date.getTime())) {
        await sendMessage(chatId, "❌ Could not read that date. Use <code>2026-09-15 18:00</code>.", back);
        return true;
      }
      await saveSetting("launch_at", date.toISOString());
      await sendMessage(chatId, `🗓 Premiere set to <b>${date.toUTCString()}</b>.`, back);
      return true;
    }
    case "tester_add": {
      const parts = value.split(/[,\s]+/).filter(Boolean);
      const added: string[] = [];
      for (const part of parts) {
        const user = await resolveUser(part);
        if (!user) {
          await sendMessage(chatId, `⚠️ <code>${part}</code> has not started the bot yet — ask them to send /start first.`);
          continue;
        }
        await addTester(Number(user.telegram_id));
        added.push(String(user.telegram_id));
        const state = await launchState();
        const { premiereMessage } = await import("./gate.server");
        await sendMessage(
          Number(user.telegram_id),
          `🎟 <b>You are now a Mist Chat tester.</b>\n\nYou can use /search before the public premiere.\n\n${premiereMessage(state)}`,
        );
      }
      await sendMessage(chatId, added.length ? `✅ Added: ${added.join(", ")}` : "Nothing added.", back);
      return true;
    }
    case "tester_del": {
      const user = await resolveUser(value);
      const id = user ? Number(user.telegram_id) : Number(value.replace(/^@/, ""));
      if (!Number.isFinite(id)) {
        await sendMessage(chatId, "❌ Unknown user.", back);
        return true;
      }
      await removeTester(id);
      await sendMessage(chatId, `🗑 Tester <code>${id}</code> removed.`, back);
      return true;
    }
    case "user_ban": {
      const [who, ...rest] = value.split(/\s+/);
      const user = await resolveUser(who ?? "");
      if (!user) {
        await sendMessage(chatId, "❌ Unknown user.", back);
        return true;
      }
      await banUserById(Number(user.telegram_id), rest.join(" ") || "admin decision");
      await sendMessage(chatId, `🔨 Banned ${tag(user)}.`, back);
      return true;
    }
    case "user_restrict": {
      const [who, hoursRaw, ...rest] = value.split(/\s+/);
      const user = await resolveUser(who ?? "");
      if (!user) {
        await sendMessage(chatId, "❌ Unknown user.", back);
        return true;
      }
      const hours = Number(hoursRaw) || 24;
      await restrictUserById(Number(user.telegram_id), hours, rest.join(" ") || "admin decision");
      await sendMessage(chatId, `⏳ Restricted ${tag(user)} for ${hours}h.`, back);
      return true;
    }
    case "user_unban": {
      const user = await resolveUser(value);
      if (!user) {
        await sendMessage(chatId, "❌ Unknown user.", back);
        return true;
      }
      await unbanUserById(Number(user.telegram_id));
      await sendMessage(chatId, `♻️ Unbanned ${tag(user)}.`, back);
      return true;
    }
    case "user_info": {
      const u = await resolveUser(value);
      await sendMessage(
        chatId,
        u
          ? `ℹ️ ${tag(u)}\nState: ${u.state} · ${u.account_status}\nOnboarding: ${u.onboarding_status}\n👍 ${u.likes} · 👎 ${u.dislikes} of ${u.total_ratings}\nReports: ${u.report_count}\nVIP until: ${u.vip_expires_at ?? "—"}\nBanned: ${u.banned}\nRestricted until: ${u.restricted_until ?? "—"}\nFlagged: ${u.flagged_for_review}`
          : "❌ Unknown user.",
        back,
      );
      return true;
    }
    case "user_dm": {
      const [who, ...rest] = value.split(/\s+/);
      const user = await resolveUser(who ?? "");
      const body = rest.join(" ");
      if (!user || !body) {
        await sendMessage(chatId, "❌ Send the user then the message on the same line.", back);
        return true;
      }
      await sendMessage(Number(user.telegram_id), `📩 <b>Message from the Mist Chat team</b>\n\n${body}`);
      await sendMessage(chatId, `✅ Sent to ${tag(user)}.`, back);
      return true;
    }
    case "broadcast": {
      if (message) await copyMessage(chatId, message.chat.id, message.message_id);
      await broadcast(chatId, value);
      return true;
    }
    case "plan_limit": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1) {
        await sendMessage(chatId, "❌ Send a number.", back);
        return true;
      }
      await saveSetting("free_daily_partner_limit", String(Math.trunc(n)));
      await sendMessage(chatId, `🔢 Free limit set to <b>${Math.trunc(n)}</b> partners / 24h.`, back);
      return true;
    }
    case "plan_week":
    case "plan_month":
    case "plan_year": {
      const [starsRaw, daysRaw] = value.split(/\s+/);
      const stars = Number(starsRaw);
      const days = Number(daysRaw);
      if (!Number.isFinite(stars) || !Number.isFinite(days) || stars < 1 || days < 1) {
        await sendMessage(chatId, "❌ Send two numbers: stars and days.", back);
        return true;
      }
      const keys: Record<string, [string, string]> = {
        plan_week: ["vip_price_stars_week", "vip_days_week"],
        plan_month: ["vip_price_stars", "vip_days"],
        plan_year: ["vip_price_stars_year", "vip_days_year"],
      };
      const [priceKey, daysKey] = keys[session.action]!;
      await saveSetting(priceKey, String(Math.trunc(stars)));
      await saveSetting(daysKey, String(Math.trunc(days)));
      await sendMessage(chatId, `💎 Plan updated: <b>${Math.trunc(stars)} ⭐ / ${Math.trunc(days)} days</b>.`, back);
      return true;
    }
    case "ch_add": {
      const raw = (await getSetting("force_join_channels")) ?? "";
      const list = new Set(raw.split(/[,\s]+/).filter(Boolean));
      list.add(value.startsWith("@") ? value : `@${value}`);
      await saveSetting("force_join_channels", Array.from(list).join(","));
      await sendMessage(chatId, `🔗 Added. Users must now join ${value}.`, back);
      return true;
    }
    case "ch_del": {
      const raw = (await getSetting("force_join_channels")) ?? "";
      const target = value.startsWith("@") ? value : `@${value}`;
      const list = raw.split(/[,\s]+/).filter((c) => c && c.toLowerCase() !== target.toLowerCase());
      await saveSetting("force_join_channels", list.join(","));
      await sendMessage(chatId, `🗑 Removed ${target}.`, back);
      return true;
    }
    case "lim_saved":
    case "lim_invcd":
    case "lim_online": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        await sendMessage(chatId, "❌ Send a number.", back);
        return true;
      }
      const keys: Record<string, string> = {
        lim_saved: "vip_saved_partner_limit",
        lim_invcd: "invite_cooldown_seconds",
        lim_online: "online_window_minutes",
      };
      await saveSetting(keys[session.action]!, String(Math.trunc(n)));
      await sendMessage(chatId, `✅ Updated to <b>${Math.trunc(n)}</b>.`, back);
      return true;
    }
    case "lim_ton": {
      await saveSetting("ton_payout_address", value.trim());
      await sendMessage(chatId, "💰 TON payout address saved.", back);
      return true;
    }
    case "cd_search":
    case "cd_next": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        await sendMessage(chatId, "❌ Send a number of seconds.", back);
        return true;
      }
      await saveSetting(
        session.action === "cd_search" ? "search_cooldown_seconds" : "next_cooldown_seconds",
        String(Math.trunc(n)),
      );
      await sendMessage(chatId, `⏱ Cooldown set to <b>${Math.trunc(n)}s</b>.`, back);
      return true;
    }
    case "report_reply": {
      const { data: report } = await supabase
        .from("reports")
        .select("reporter_id")
        .eq("id", session.arg)
        .maybeSingle();
      if (!report) {
        await sendMessage(chatId, "❌ Report not found.", back);
        return true;
      }
      await sendMessage(
        Number(report.reporter_id),
        `🛡 <b>Moderation reply to your report</b>\n\n${value}`,
      );
      await supabase.from("reports").update({ admin_notes: value }).eq("id", session.arg);
      await sendMessage(chatId, "✅ Reply sent to the reporter only.", back);
      return true;
    }
    case "ticket_reply": {
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("telegram_id")
        .eq("id", session.arg)
        .maybeSingle();
      if (!ticket) {
        await sendMessage(chatId, "❌ Ticket not found.", back);
        return true;
      }
      await sendMessage(Number(ticket.telegram_id), `⭐ <b>Payment support reply</b>\n\n${value}`);
      await supabase
        .from("support_tickets")
        .update({ status: "closed", resolved_at: new Date().toISOString() })
        .eq("id", session.arg);
      await sendMessage(chatId, "✅ Reply sent and ticket closed.", back);
      return true;
    }
  }

  if (session.action.startsWith("text_")) {
    const key = session.action;
    await saveSetting(key, value.toLowerCase() === "reset" ? "" : value);
    await sendMessage(
      chatId,
      value.toLowerCase() === "reset" ? "♻️ Restored the built-in text." : "📝 Text updated.",
      back,
    );
    return true;
  }

  return true;
}

/* ------------------------------------------------------------------ force join */

/** Returns a prompt when the user has not joined every required channel. */
export async function forceJoinBlock(telegramId: number): Promise<{ text: string; keyboard: InlineKeyboard } | null> {
  const raw = (await getSetting("force_join_channels")) ?? DEFAULTS["force_join_channels"]!;
  const channels = raw.split(/[,\s]+/).filter(Boolean);
  if (!channels.length) return null;
  const { getChatMemberStatus } = await import("./telegram.server");
  const missing: string[] = [];
  for (const channel of channels) {
    const status = await getChatMemberStatus(channel, telegramId);
    if (!status || ["left", "kicked"].includes(status)) missing.push(channel);
  }
  if (!missing.length) return null;
  return {
    text: `🔗 <b>One quick step</b>\n\nJoin ${missing.length > 1 ? "these channels" : "this channel"} to use Mist Chat:\n${missing
      .map((c) => `• ${c}`)
      .join("\n")}\n\nThen tap “I have joined”.`,
    keyboard: [
      ...missing.map((c) => [{ text: `📣 Join ${c}`, url: `https://t.me/${c.replace(/^@/, "")}` }]),
      [{ text: "✅ I have joined", callback_data: "search" }],
    ],
  };
}
