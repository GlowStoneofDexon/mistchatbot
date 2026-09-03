import {
  sendMessage,
  copyMessage,
  answerCallbackQuery,
  sendStarsInvoice,
  answerPreCheckoutQuery,
  type InlineKeyboard,
} from "./telegram.server";
import {
  WELCOME,
  HELP,
  RULES,
  TERMS,
  PAYSUPPORT,
  AGE_GATE,
  AGE_DENIED,
  TERMS_GATE,
  ONBOARDING_DONE,
  EVIDENCE_PROMPT,
  EVIDENCE_SAVED,
  EVIDENCE_CLOSED,
  REPORT_REASONS,
  reasonLabel,
  vipText,
} from "./texts";
import {
  chatBlocked,
  launchState,
  premiereMessage,
  listTesters,
  addTester,
  removeTester,
} from "./gate.server";
import { consume, FLOOD_MESSAGE } from "./limits.server";
import { settings, num, bool, vipPlans } from "./settings.server";
import {
  adminMenu,
  handleAdminCallback,
  handleAdminInput,
  getAdminSession,
  isBotAdmin,
  forceJoinBlock,
} from "./admin.server";

type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
};

type TgSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id?: string;
};

type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  successful_payment?: TgSuccessfulPayment;
};

type TgCallback = {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
};

type TgPreCheckout = {
  id: string;
  from: TgUser;
  invoice_payload: string;
  total_amount: number;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
  pre_checkout_query?: TgPreCheckout;
};

type BotUser = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  state: string;
  partner_id: number | null;
  dialog_id: string | null;
  likes: number;
  dislikes: number;
  total_ratings: number;
  report_count: number;
  chats_completed: number;
  banned: boolean;
  blocked_until: string | null;
  onboarding_status: string;
  account_status: string;
  age_confirmed_at: string | null;
  terms_accepted_at: string | null;
  vip_expires_at: string | null;
  restricted_until: string | null;
  warnings: number;
  last_search_at: string | null;
  last_next_at: string | null;
  last_link_at: string | null;
  country_code: string | null;
  language_code: string | null;
  flagged_for_review: boolean;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  };
}

const compact = (uuid: string) => uuid.replace(/-/g, "");
const expand = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

async function getSetting(key: string): Promise<string | null> {
  const supabase = await db();
  const { data } = await supabase.from("bot_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function saveSetting(key: string, value: string) {
  const supabase = await db();
  await supabase
    .from("bot_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

async function adminChatId(): Promise<string | null> {
  return getSetting("admin_chat_id");
}

async function ensureUser(from: TgUser): Promise<BotUser> {
  const supabase = await db();
  await supabase.from("bot_users").upsert(
    {
      telegram_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      language_code: from.language_code ?? null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "telegram_id" },
  );
  const { data } = await supabase.from("bot_users").select("*").eq("telegram_id", from.id).single();
  return data as BotUser;
}

async function getUser(id: number): Promise<BotUser | null> {
  const supabase = await db();
  const { data } = await supabase.from("bot_users").select("*").eq("telegram_id", id).maybeSingle();
  return (data as BotUser) ?? null;
}

async function update(id: number, patch: Record<string, unknown>) {
  const supabase = await db();
  await supabase.from("bot_users").update(patch).eq("telegram_id", id);
}

async function setIdle(id: number) {
  await update(id, { state: "idle", partner_id: null, dialog_id: null });
}

function tag(user: BotUser | null, id: number) {
  const uname = user?.username ? `@${user.username}` : "no username";
  return `<code>${id}</code> (${uname})`;
}

function isVip(user: BotUser) {
  return user.vip_expires_at != null && new Date(user.vip_expires_at).getTime() > Date.now();
}

function isRestricted(user: BotUser) {
  const until = user.restricted_until ?? user.blocked_until;
  return until != null && new Date(until).getTime() > Date.now();
}

function restrictedMessage(user: BotUser) {
  const until = new Date(user.restricted_until ?? user.blocked_until!);
  return `⏳ <b>Your account is temporarily restricted</b> by moderation.\n\nYou can chat again after <b>${until.toUTCString()}</b>. Please review the /rules.`;
}

const BANNED_MESSAGE =
  "🚫 Your account has been permanently banned for breaking the /rules. You can no longer use this bot.";

/* ------------------------------------------------------------------ onboarding */

const AGE_KEYBOARD: InlineKeyboard = [
  [
    { text: "✅ I am 18 or older", callback_data: "ob:age:yes" },
    { text: "🚫 I am under 18", callback_data: "ob:age:no" },
  ],
];

const TERMS_KEYBOARD: InlineKeyboard = [
  [{ text: "✅ I accept the rules & terms", callback_data: "ob:terms:yes" }],
];

/** Sends the next onboarding step. Returns true when the user still has to finish it. */
async function onboardingGate(user: BotUser): Promise<boolean> {
  if (user.onboarding_status === "done") return false;
  if (user.account_status === "under_age") {
    await sendMessage(user.telegram_id, AGE_DENIED);
    return true;
  }
  if (!user.age_confirmed_at) {
    await sendMessage(user.telegram_id, AGE_GATE, AGE_KEYBOARD);
    return true;
  }
  await sendMessage(user.telegram_id, TERMS_GATE, TERMS_KEYBOARD);
  return true;
}

/* ------------------------------------------------------------------ evidence */

type EvidenceSession = { reportId: string; count: number; expires: number };

const evidenceKey = (id: number) => `evidence:${id}`;

async function getEvidenceSession(id: number): Promise<EvidenceSession | null> {
  const raw = await getSetting(evidenceKey(id));
  if (!raw) return null;
  const [reportId, count, expires] = raw.split("|");
  if (!reportId || !expires) return null;
  if (Number(expires) < Date.now()) return null;
  return { reportId, count: Number(count ?? 0), expires: Number(expires) };
}

async function setEvidenceSession(id: number, session: EvidenceSession | null) {
  await saveSetting(
    evidenceKey(id),
    session ? `${session.reportId}|${session.count}|${session.expires}` : "",
  );
}

/* ------------------------------------------------------------------ dialogs */

function ratingKeyboard(dialogId: string, partnerId: number): InlineKeyboard {
  const d = compact(dialogId);
  return [
    [
      { text: "👍 Like", callback_data: `r:l:${d}:${partnerId}` },
      { text: "👎 Dislike", callback_data: `r:d:${d}:${partnerId}` },
    ],
    [{ text: "🚩 Report", callback_data: `rp:${d}:${partnerId}` }],
    [{ text: "🔍 Find a new partner", callback_data: "search" }],
  ];
}

async function closeSession(dialogId: string, endedBy: number, reason: string) {
  const supabase = await db();
  await supabase
    .from("match_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: endedBy, end_reason: reason })
    .eq("id", dialogId);
}

/** Ends a dialog for both sides and offers the rating buttons. */
async function endDialog(user: BotUser, opts: { notifyPartner: boolean; reason?: string }) {
  const supabase = await db();
  const partnerId = user.partner_id;
  const dialogId = user.dialog_id;

  await setIdle(user.telegram_id);
  if (partnerId) await setIdle(partnerId);

  if (dialogId) {
    await closeSession(dialogId, user.telegram_id, opts.reason ? "moderation" : "user_left");
    await supabase
      .from("bot_users")
      .update({ chats_completed: user.chats_completed + 1 })
      .eq("telegram_id", user.telegram_id);
    if (partnerId) {
      const partner = await getUser(partnerId);
      if (partner) {
        await supabase
          .from("bot_users")
          .update({ chats_completed: partner.chats_completed + 1 })
          .eq("telegram_id", partnerId);
      }
    }
  }

  if (partnerId && dialogId) {
    if (opts.notifyPartner) {
      await sendMessage(
        partnerId,
        opts.reason ?? "🛑 Your partner has left the chat.\n\nRate them, or tap 🔍 to find someone new.",
        ratingKeyboard(dialogId, user.telegram_id),
      );
    }
    await sendMessage(
      user.telegram_id,
      "🛑 Chat ended.\n\nHow was your partner?",
      ratingKeyboard(dialogId, partnerId),
    );
  } else {
    await sendMessage(user.telegram_id, "You are not in a chat right now. Use /search to find a partner.");
  }
  return { partnerId, dialogId };
}

/** Free users may talk to a limited number of distinct partners per rolling 24 hours. */
async function partnerLimitBlock(user: BotUser, config: Record<string, string>): Promise<string | null> {
  if (isVip(user)) return null;
  const limit = num(config, "free_daily_partner_limit");
  const supabase = await db();
  const { data } = await supabase.rpc("partner_slots_used", { p_user: user.telegram_id });
  const used = Number(Array.isArray(data) ? data[0] : (data ?? 0));
  if (used < limit) return null;
  return `🚦 <b>Daily limit reached</b>\n\nYou have already chatted with <b>${limit}</b> different people in the last 24 hours.\n\n• ⏳ Wait — slots free up automatically 24 hours after each chat\n• 💎 /vip — unlimited partners right away`;
}

async function startSearch(user: BotUser) {
  const supabase = await db();
  const config = await settings();

  if (user.banned) {
    await sendMessage(user.telegram_id, BANNED_MESSAGE);
    return;
  }
  if (isRestricted(user)) {
    await sendMessage(user.telegram_id, restrictedMessage(user));
    return;
  }
  if (await onboardingGate(user)) return;

  if (bool(config, "maintenance_mode")) {
    await sendMessage(
      user.telegram_id,
      "🛠 <b>Maintenance</b>\n\nMist Chat is being updated right now. Please try again in a little while.",
    );
    return;
  }

  if (user.state === "chatting" && user.partner_id) {
    await sendMessage(
      user.telegram_id,
      "💬 <b>You are in a chat right now.</b>\n\n🆕 /next — leave and find someone new\n🛑 /stop — end this chat",
    );
    return;
  }
  if (user.state === "searching") {
    await sendMessage(
      user.telegram_id,
      "🔍 <b>Already searching…</b>\n\nHang tight — you will be connected as soon as someone else is looking. Use /stop to cancel.",
    );
    return;
  }

  const gate = await chatBlocked(user.telegram_id);
  if (gate) {
    await sendMessage(user.telegram_id, gate);
    return;
  }

  if (bool(config, "matching_paused")) {
    await sendMessage(user.telegram_id, "⏸ Matching is paused by the moderators. Please try again soon.");
    return;
  }

  const cooldown = num(config, "search_cooldown_seconds") * 1000;
  const last = user.last_search_at ? new Date(user.last_search_at).getTime() : 0;
  if (cooldown > 0 && Date.now() - last < cooldown) {
    await sendMessage(user.telegram_id, "⏱ Easy — wait a couple of seconds before searching again.");
    return;
  }

  const limited = await partnerLimitBlock(user, config);
  if (limited) {
    await sendMessage(user.telegram_id, limited, [[{ text: "💎 Get VIP", callback_data: "vip" }]]);
    return;
  }

  await update(user.telegram_id, { state: "searching", last_search_at: new Date().toISOString() });

  const { data, error } = await supabase.rpc("match_partner", { p_user: user.telegram_id });
  if (error) {
    console.error("match_partner failed", error);
    await sendMessage(user.telegram_id, "Something went wrong while searching. Please try /search again.");
    return;
  }

  const match = Array.isArray(data) ? data[0] : data;
  if (!match?.partner) {
    await sendMessage(
      user.telegram_id,
      "🔍 Looking for a partner…\n\nYou will be connected as soon as someone else is searching. Use /stop to cancel.",
    );
    return;
  }

  const partner = await getUser(Number(match.partner));
  const badge = (u: BotUser | null) => (u && isVip(u) ? " 💎 <i>VIP partner</i>" : "");
  const found = (u: BotUser | null) =>
    `✅ <b>Partner found!</b>${badge(u)}\n\nSay hi 👋 Everything you send is delivered anonymously.\n\n🆕 /next — new partner · 🛑 /stop — end chat · 🚩 /report`;
  await sendMessage(user.telegram_id, found(partner));
  await sendMessage(Number(match.partner), found(user));
}

/* ------------------------------------------------------------------ moderation */

/** Flags an account for human review instead of banning automatically. */
async function flagForReview(userId: number, reason: string) {
  const supabase = await db();
  await supabase.from("bot_users").update({ flagged_for_review: true }).eq("telegram_id", userId);
  await supabase.from("moderation_actions").insert({
    telegram_id: userId,
    action_type: "flagged",
    reason,
    created_by: "system",
  });
  const admin = await adminChatId();
  const target = await getUser(userId);
  if (admin) {
    await sendMessage(
      admin,
      `⚠️ <b>Flagged for review</b>\n${tag(target, userId)}\nReason: ${reason}\n\nOpen /admin → 👤 Users to decide.`,
    );
  }
}

async function reviewDislikeRatio(ratedId: number) {
  const config = await settings();
  const supabase = await db();
  const { data } = await supabase
    .from("bot_users")
    .select("dislikes, total_ratings, flagged_for_review")
    .eq("telegram_id", ratedId)
    .maybeSingle();
  if (!data || data.flagged_for_review) return;
  const minRatings = num(config, "moderation_min_ratings");
  const threshold = num(config, "dislike_soft_restriction_threshold") / 100;
  if (data.total_ratings < minRatings) return;
  if (data.dislikes / data.total_ratings < threshold) return;
  await flagForReview(
    ratedId,
    `${Math.round((data.dislikes / data.total_ratings) * 100)}% dislikes over ${data.total_ratings} ratings`,
  );
}

async function reviewReports(reportedId: number) {
  const supabase = await db();
  const { data } = await supabase.from("reports").select("reporter_id").eq("reported_id", reportedId);
  const distinct = new Set((data ?? []).map((r: { reporter_id: number }) => r.reporter_id)).size;
  await supabase.from("bot_users").update({ report_count: distinct }).eq("telegram_id", reportedId);
  if (distinct >= 3) {
    const target = await getUser(reportedId);
    if (target && !target.flagged_for_review) {
      await flagForReview(reportedId, `${distinct} reports from different users`);
    }
  }
  return distinct;
}

async function banUser(id: number, reason: string) {
  const supabase = await db();
  const target = await getUser(id);
  if (target?.partner_id) {
    await sendMessage(target.partner_id, "🛑 Your partner was removed by moderation. Use /search for a new one.");
    await setIdle(target.partner_id);
  }
  await supabase
    .from("bot_users")
    .update({ banned: true, account_status: "banned", state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", id);
  await supabase
    .from("moderation_actions")
    .insert({ telegram_id: id, action_type: "ban", reason, created_by: "admin" });
  await sendMessage(id, BANNED_MESSAGE);
  const admin = await adminChatId();
  if (admin) await sendMessage(admin, `🔨 Banned ${tag(target, id)} — ${reason}`);
}

async function restrictUser(id: number, hours: number, reason: string) {
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

async function openReport(reporter: BotUser, reportedId: number, dialogId: string | null, reasonCode: string) {
  const supabase = await db();
  const reported = await getUser(reportedId);

  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: reporter.telegram_id,
      reported_id: reportedId,
      dialog_id: dialogId,
      reason: reasonCode,
      category: reasonCode,
      status: "open",
      severity: reasonCode === "minor" || reasonCode === "illegal" ? "high" : "normal",
    })
    .select("id")
    .maybeSingle();

  if (error && error.code === "23505") {
    await sendMessage(reporter.telegram_id, "You have already reported this chat. Thank you.");
    return;
  }
  if (error || !inserted?.id) {
    console.error("report insert failed", error);
    await sendMessage(reporter.telegram_id, "Could not file the report. Please try again.");
    return;
  }

  const distinct = await reviewReports(reportedId);

  const admin = await adminChatId();
  if (admin) {
    await sendMessage(
      admin,
      `🚩 <b>NEW REPORT</b>\nCase: <code>${compact(inserted.id).slice(0, 8)}</code>\nReason: ${reasonLabel(
        reasonCode,
      )}\n\n<b>Partner 1 (reporter)</b>: ${tag(reporter, reporter.telegram_id)}\n<b>Partner 2 (reported)</b>: ${tag(
        reported,
        reportedId,
      )}\n\nDistinct reports against Partner 2: <b>${distinct}</b>\n\nOpen /admin → 🚩 Reports to decide.`,
    );
  }

  // Safety: a submitted report always ends the connection.
  if (reporter.state === "chatting" && reporter.partner_id === reportedId) {
    await endDialog(reporter, { notifyPartner: true, reason: "reported" });
  }

  await setEvidenceSession(reporter.telegram_id, {
    reportId: inserted.id,
    count: 0,
    expires: Date.now() + 10 * 60_000,
  });
  await sendMessage(reporter.telegram_id, EVIDENCE_PROMPT);
}

async function storeEvidence(user: BotUser, message: TgMessage, session: EvidenceSession) {
  const supabase = await db();
  const config = await settings();
  const days = num(config, "report_evidence_retention_days");
  await supabase.from("report_evidence").insert({
    report_id: session.reportId,
    evidence_type: messageKind(message),
    telegram_message_id: message.message_id,
    text_content: message.text ?? message.caption ?? null,
    metadata: { submitted_by: user.telegram_id },
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
  });

  const admin = await adminChatId();
  if (admin) {
    await sendMessage(admin, `📎 Evidence for case <code>${compact(session.reportId).slice(0, 8)}</code>`);
    await copyMessage(admin, message.chat.id, message.message_id);
  }

  const next = { ...session, count: session.count + 1 };
  if (next.count >= 5) {
    await setEvidenceSession(user.telegram_id, null);
    await sendMessage(user.telegram_id, EVIDENCE_CLOSED);
    return;
  }
  await setEvidenceSession(user.telegram_id, next);
  await sendMessage(user.telegram_id, EVIDENCE_SAVED);
}

function messageKind(message: TgMessage) {
  const m = message as unknown as Record<string, unknown>;
  for (const kind of ["photo", "video", "animation", "sticker", "voice", "audio", "video_note", "document"]) {
    if (m[kind]) return kind;
  }
  return "text";
}

async function handleRating(rater: BotUser, ratedId: number, dialogId: string, value: 1 | -1) {
  const supabase = await db();
  const { error } = await supabase.from("ratings").insert({
    rater_id: rater.telegram_id,
    rated_id: ratedId,
    dialog_id: dialogId,
    value,
  });
  if (error && error.code === "23505") {
    await sendMessage(rater.telegram_id, "You already rated this chat.");
    return;
  }

  const rated = await getUser(ratedId);
  if (rated) {
    await supabase
      .from("bot_users")
      .update({
        likes: rated.likes + (value === 1 ? 1 : 0),
        dislikes: rated.dislikes + (value === -1 ? 1 : 0),
        total_ratings: rated.total_ratings + 1,
      })
      .eq("telegram_id", ratedId);
  }

  await sendMessage(
    rater.telegram_id,
    value === 1
      ? "👍 Thanks for the feedback! Use /search for a new partner."
      : "👎 Noted. Use /search for a new partner.",
  );
  await reviewDislikeRatio(ratedId);
}

/* ------------------------------------------------------------------ VIP / Stars */

async function sendVipOffer(user: BotUser) {
  const config = await settings();
  const stars = num(config, "vip_price_stars");
  const days = num(config, "vip_days");
  const limit = num(config, "free_daily_partner_limit");
  const until = isVip(user) ? new Date(user.vip_expires_at!).toUTCString() : null;

  await sendMessage(user.telegram_id, vipText(stars, days, limit, until));
  await sendStarsInvoice({
    chatId: user.telegram_id,
    title: `Mist VIP — ${days} days`,
    description: "Unlimited partners, matching filters, priority queue and a VIP badge.",
    payload: `vip_${days}d:${user.telegram_id}:${Date.now()}`,
    stars,
  });
}

async function activateVip(user: BotUser, payment: TgSuccessfulPayment) {
  const supabase = await db();
  const config = await settings();
  const days = num(config, "vip_days");
  const base = isVip(user) ? new Date(user.vip_expires_at!).getTime() : Date.now();
  const expires = new Date(base + days * 86_400_000).toISOString();

  await supabase.from("payments").insert({
    telegram_id: user.telegram_id,
    telegram_payment_charge_id: payment.telegram_payment_charge_id ?? null,
    invoice_payload: payment.invoice_payload,
    product: `vip_${days}d`,
    stars_amount: payment.total_amount,
    status: "paid",
    expires_at: expires,
  });

  await update(user.telegram_id, {
    vip_started_at: isVip(user) ? undefined : new Date().toISOString(),
    vip_expires_at: expires,
  });

  await sendMessage(
    user.telegram_id,
    `💎 <b>VIP activated!</b>\n\nValid until <b>${new Date(expires).toUTCString()}</b>.\n\n• ♾ Unlimited partners\n• 🎯 Filters: /prefs\n• ⚡ Priority matching\n\nThank you for supporting Mist Chat!`,
  );

  const admin = await adminChatId();
  if (admin) {
    await sendMessage(
      admin,
      `⭐ <b>Stars payment</b> ${payment.total_amount} XTR from ${tag(user, user.telegram_id)}\nVIP until ${new Date(expires).toUTCString()}`,
    );
  }
}

/** VIP matching preferences: /prefs age 18-30 | country BD | language en | clear */
async function handlePrefs(user: BotUser, text: string) {
  if (!isVip(user)) {
    await sendMessage(user.telegram_id, "🎯 Matching filters are a VIP feature. See /vip.");
    return;
  }
  const [, key, value] = text.trim().split(/\s+/);
  if (key === "clear") {
    await update(user.telegram_id, {
      pref_age_min: null,
      pref_age_max: null,
      pref_country: null,
      pref_language: null,
    });
    await sendMessage(user.telegram_id, "🧹 Filters cleared.");
    return;
  }
  if (key === "age" && value) {
    const [min, max] = value.split("-").map((v) => Number(v));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min! < 18 || max! < min!) {
      await sendMessage(user.telegram_id, "Use <code>/prefs age 18-30</code> (18 or above).");
      return;
    }
    await update(user.telegram_id, { pref_age_min: min, pref_age_max: max });
    await sendMessage(user.telegram_id, `🎯 Age filter set to <b>${min}-${max}</b>.`);
    return;
  }
  if (key === "country" && value) {
    await update(user.telegram_id, { pref_country: value.toUpperCase().slice(0, 2) });
    await sendMessage(user.telegram_id, `🌍 Country filter set to <b>${value.toUpperCase().slice(0, 2)}</b>.`);
    return;
  }
  if (key === "language" && value) {
    await update(user.telegram_id, { pref_language: value.toLowerCase().slice(0, 5) });
    await sendMessage(user.telegram_id, `🗣 Language filter set to <b>${value.toLowerCase()}</b>.`);
    return;
  }
  await sendMessage(
    user.telegram_id,
    "🎯 <b>VIP filters</b>\n\n<code>/prefs age 18-30</code>\n<code>/prefs country BD</code>\n<code>/prefs language en</code>\n<code>/prefs clear</code>\n\nFilters are preferences — if nobody matches, we relax them so you are never stuck.",
  );
}

/* ------------------------------------------------------------------ admin chat */

async function handleAdminCommand(text: string, chatId: number) {
  const [cmd, arg, extra] = text.trim().split(/\s+/);

  if (cmd === "/whereami") {
    await saveSetting("admin_chat_id", String(chatId));
    await sendMessage(
      chatId,
      `✅ Saved. This chat (<code>${chatId}</code>) is now the moderation destination for reports.`,
    );
    return true;
  }

  const admin = await adminChatId();
  if (!admin || String(chatId) !== admin) return false;

  if (cmd === "/ban" && arg) {
    await banUser(Number(arg), "manual admin ban");
    return true;
  }
  if (cmd === "/restrict" && arg) {
    const hours = Number(extra ?? 24) || 24;
    await restrictUser(Number(arg), hours, "manual admin restriction");
    await sendMessage(chatId, `⏳ Restricted <code>${arg}</code> for ${hours}h.`);
    return true;
  }
  if (cmd === "/unban" && arg) {
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
      .eq("telegram_id", Number(arg));
    await sendMessage(chatId, `♻️ Unbanned <code>${arg}</code>.`);
    await sendMessage(Number(arg), "♻️ Your restriction has been lifted. Please follow the /rules — use /search to chat.");
    return true;
  }
  if (cmd === "/stats") {
    const supabase = await db();
    const { data } = await supabase.rpc("bot_admin_stats");
    const s = Array.isArray(data) ? data[0] : data;
    await sendMessage(
      chatId,
      `📊 Users: <b>${s?.total_users ?? 0}</b>\nSearching: <b>${s?.searching ?? 0}</b>\nActive chats: <b>${
        s?.active_chats ?? 0
      }</b>\nVIP: <b>${s?.vip_active ?? 0}</b>\n⭐ Stars: <b>${s?.stars_revenue ?? 0}</b>\nOpen reports: <b>${
        s?.open_reports ?? 0
      }</b>\nBanned: <b>${s?.banned ?? 0}</b> · Restricted: <b>${s?.restricted ?? 0}</b>`,
    );
    return true;
  }
  if (cmd === "/info" && arg) {
    const u = await getUser(Number(arg));
    await sendMessage(
      chatId,
      u
        ? `ℹ️ ${tag(u, u.telegram_id)}\nState: ${u.state} · ${u.account_status}\nOnboarding: ${u.onboarding_status}\n👍 ${u.likes} · 👎 ${u.dislikes} of ${u.total_ratings}\nReports: ${u.report_count}\nVIP until: ${u.vip_expires_at ?? "—"}\nBanned: ${u.banned}\nRestricted until: ${u.restricted_until ?? "—"}`
        : "Unknown user.",
    );
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ updates */

async function handleMessage(message: TgMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;

  // Group / channel chats are only used for moderation commands.
  if (message.chat.type !== "private") {
    if (message.text) await handleAdminCommand(message.text, message.chat.id);
    return;
  }

  const user = await ensureUser(from);
  const text = message.text?.trim() ?? "";

  if (message.successful_payment) {
    await activateVip(user, message.successful_payment);
    return;
  }

  if (user.banned && text !== "/myid") {
    await sendMessage(user.telegram_id, BANNED_MESSAGE);
    return;
  }

  const rate = await consume(user.telegram_id, text.startsWith("/") ? "command" : "message");
  if (!rate.allowed) {
    if (rate.warn) await sendMessage(user.telegram_id, FLOOD_MESSAGE);
    return;
  }

  const evidence = await getEvidenceSession(user.telegram_id);
  if (evidence) {
    if (text === "/done" || text === "/skip") {
      await setEvidenceSession(user.telegram_id, null);
      await sendMessage(user.telegram_id, EVIDENCE_CLOSED);
      return;
    }
    await storeEvidence(user, message, evidence);
    return;
  }

  if (text.startsWith("/")) {
    const command = text.split(/[\s@]/)[0];
    switch (command) {
      case "/start": {
        await sendMessage(user.telegram_id, WELCOME);
        if (await onboardingGate(user)) return;
        const gate = await chatBlocked(user.telegram_id);
        if (gate) await sendMessage(user.telegram_id, gate);
        return;
      }
      case "/help":
        await sendMessage(user.telegram_id, HELP);
        return;
      case "/rules":
        await sendMessage(user.telegram_id, RULES);
        return;
      case "/terms":
        await sendMessage(user.telegram_id, TERMS);
        return;
      case "/vip":
        await sendVipOffer(user);
        return;
      case "/prefs":
        await handlePrefs(user, text);
        return;
      case "/paysupport": {
        const note = text.slice("/paysupport".length).trim();
        await sendMessage(user.telegram_id, PAYSUPPORT);
        if (note) {
          const supabase = await db();
          await supabase.from("support_tickets").insert({
            telegram_id: user.telegram_id,
            category: "payment",
            message: note,
          });
          await sendMessage(user.telegram_id, "📨 Your message was sent to support. We reply within 72 hours.");
          const admin = await adminChatId();
          if (admin) {
            await sendMessage(admin, `💰 <b>Payment support</b> from ${tag(user, user.telegram_id)}\n\n${note}`);
          }
        }
        return;
      }
      case "/myid":
        await sendMessage(
          user.telegram_id,
          `🆔 Your Telegram ID is <code>${user.telegram_id}</code>\n\nYour partner never sees this.`,
        );
        return;
      case "/search":
        await startSearch(user);
        return;
      case "/report": {
        const partnerId = user.partner_id;
        if (user.state !== "chatting" || !partnerId || !user.dialog_id) {
          await sendMessage(
            user.telegram_id,
            "🚩 You can report from inside a chat, or with the 🚩 button shown after a chat ends.",
          );
          return;
        }
        await sendMessage(
          user.telegram_id,
          "🚩 What is wrong with this chat?",
          REPORT_REASONS.map((r) => [
            { text: r.label, callback_data: `rs:${r.code}:${compact(user.dialog_id!)}:${partnerId}` },
          ]),
        );
        return;
      }
      case "/stop": {
        if (user.state === "searching") {
          await setIdle(user.telegram_id);
          await sendMessage(user.telegram_id, "🛑 Search cancelled.");
          return;
        }
        if (user.state !== "chatting") {
          await sendMessage(user.telegram_id, "You are not in a chat. Use /search to find a partner.");
          return;
        }
        await endDialog(user, { notifyPartner: true });
        return;
      }
      case "/next": {
        const config = await settings();
        const cooldown = num(config, "next_cooldown_seconds") * 1000;
        const last = user.last_next_at ? new Date(user.last_next_at).getTime() : 0;
        if (cooldown > 0 && Date.now() - last < cooldown) {
          await sendMessage(user.telegram_id, "⏱ Slow down a moment before skipping again.");
          return;
        }
        await update(user.telegram_id, { last_next_at: new Date().toISOString() });
        if (user.state === "chatting") {
          await endDialog(user, { notifyPartner: true });
        }
        const refreshed = await getUser(user.telegram_id);
        if (refreshed) await startSearch(refreshed);
        return;
      }
      case "/link": {
        if (user.state !== "chatting" || !user.partner_id) {
          await sendMessage(user.telegram_id, "You need an active chat first. Use /search.");
          return;
        }
        const lastLink = user.last_link_at ? new Date(user.last_link_at).getTime() : 0;
        if (Date.now() - lastLink < 60_000) {
          await sendMessage(user.telegram_id, "⏱ You just shared your profile. Please wait a minute.");
          return;
        }
        await sendMessage(
          user.telegram_id,
          "🔗 This will send your Telegram profile link to your partner. <b>You will no longer be anonymous to them.</b> Continue?",
          [
            [
              { text: "✅ Send my profile", callback_data: "link:yes" },
              { text: "❌ Cancel", callback_data: "link:no" },
            ],
          ],
        );
        return;
      }
      case "/admin":
      case "/panel": {
        if (!(await isBotAdmin(user.telegram_id))) {
          await sendMessage(user.telegram_id, "Unknown command. See /help for the full list.");
          return;
        }
        await adminMenu(user.telegram_id);
        return;
      }
      case "/cancel":
        await sendMessage(user.telegram_id, "Nothing to cancel.");
        return;
      case "/testers": {
        if (!(await isBotAdmin(user.telegram_id))) {
          await sendMessage(user.telegram_id, "Unknown command. See /help for the full list.");
          return;
        }
        const [, action, value] = text.split(/\s+/);
        if (action === "add" && value) {
          const list = await addTester(Number(value));
          await sendMessage(user.telegram_id, `✅ Tester <code>${value}</code> added.\nTesters: ${list.join(", ") || "—"}`);
          const state = await launchState();
          await sendMessage(
            Number(value),
            `🎟 <b>You are now a Mist Chat tester.</b>\n\nYou can use /search before the public premiere.\n\n${premiereMessage(state)}`,
          );
          return;
        }
        if ((action === "remove" || action === "del") && value) {
          const list = await removeTester(Number(value));
          await sendMessage(user.telegram_id, `🗑 Tester <code>${value}</code> removed.\nTesters: ${list.join(", ") || "—"}`);
          return;
        }
        const list = await listTesters();
        await sendMessage(
          user.telegram_id,
          `🎟 <b>Testers</b>\n${list.length ? list.map((id) => `• <code>${id}</code>`).join("\n") : "No testers yet."}\n\n<code>/testers add &lt;id&gt;</code>\n<code>/testers remove &lt;id&gt;</code>\n\nIDs from <code>*_TESTER_ID</code> secrets are also allowed automatically.`,
        );
        return;
      }
      default:
        await sendMessage(user.telegram_id, "Unknown command. See /help for the full list.");
        return;
    }
  }

  if (await onboardingGate(user)) return;

  if (user.state !== "chatting" || !user.partner_id) {
    const gate = await chatBlocked(user.telegram_id);
    await sendMessage(
      user.telegram_id,
      gate ?? "You are not chatting with anyone. Tap /search to find a partner 🔍",
    );
    return;
  }

  const config = await settings();
  const kind = messageKind(message);
  if (kind !== "text" && !bool(config, "enable_media")) {
    await sendMessage(user.telegram_id, "📵 Media sharing is temporarily disabled. Text still works.");
    return;
  }
  if ((kind === "video" || kind === "video_note") && !bool(config, "enable_video")) {
    await sendMessage(user.telegram_id, "📵 Video sharing is temporarily disabled.");
    return;
  }

  const relayed = await copyMessage(user.partner_id, message.chat.id, message.message_id);
  if (!relayed) {
    await sendMessage(user.telegram_id, "Your partner is unreachable. Use /next to find someone new.");
  }
}

async function handleCallback(callback: TgCallback) {
  const data = callback.data ?? "";
  const user = await ensureUser(callback.from);
  await answerCallbackQuery(callback.id);

  if (data === "ob:age:yes") {
    await update(user.telegram_id, {
      age_confirmed_at: new Date().toISOString(),
      onboarding_status: "terms",
      account_status: "active",
    });
    await sendMessage(user.telegram_id, TERMS_GATE, TERMS_KEYBOARD);
    return;
  }
  if (data === "ob:age:no") {
    await update(user.telegram_id, { account_status: "under_age", onboarding_status: "blocked" });
    await sendMessage(user.telegram_id, AGE_DENIED);
    return;
  }
  if (data === "ob:terms:yes") {
    const config = await settings();
    await update(user.telegram_id, {
      terms_accepted_at: new Date().toISOString(),
      terms_version: config["terms_version"] ?? "1",
      onboarding_status: "done",
      account_status: "active",
    });
    await sendMessage(user.telegram_id, ONBOARDING_DONE);
    const gate = await chatBlocked(user.telegram_id);
    if (gate) await sendMessage(user.telegram_id, gate);
    return;
  }

  if (data === "vip") {
    await sendVipOffer(user);
    return;
  }

  if (data === "search") {
    await startSearch(user);
    return;
  }

  if (data === "link:no") {
    await sendMessage(user.telegram_id, "Cancelled — you are still anonymous.");
    return;
  }

  if (data === "link:yes") {
    if (user.state !== "chatting" || !user.partner_id) {
      await sendMessage(user.telegram_id, "That chat has already ended.");
      return;
    }
    const link = user.username
      ? `https://t.me/${user.username}`
      : `<a href="tg://user?id=${user.telegram_id}">Telegram profile</a>`;
    await sendMessage(user.partner_id, `🔗 Your partner shared their profile: ${link}`);
    await update(user.telegram_id, { last_link_at: new Date().toISOString() });
    await sendMessage(user.telegram_id, "🔗 Profile sent to your partner.");
    return;
  }

  const rate = /^r:(l|d):([0-9a-f]{32}):(\d+)$/.exec(data);
  if (rate) {
    await handleRating(user, Number(rate[3]), expand(rate[2]!), rate[1] === "l" ? 1 : -1);
    return;
  }

  const report = /^rp:([0-9a-f]{32}):(\d+)$/.exec(data);
  if (report) {
    await sendMessage(
      user.telegram_id,
      "🚩 What is wrong with this chat?",
      REPORT_REASONS.map((r) => [
        { text: r.label, callback_data: `rs:${r.code}:${report[1]}:${report[2]}` },
      ]),
    );
    return;
  }

  const reason = /^rs:([a-z]+):([0-9a-f]{32}):(\d+)$/.exec(data);
  if (reason) {
    await openReport(user, Number(reason[3]), expand(reason[2]!), reason[1]!);
    return;
  }
}

export async function handleUpdate(update: TgUpdate) {
  try {
    if (update.pre_checkout_query) {
      await answerPreCheckoutQuery(update.pre_checkout_query.id, true);
      return;
    }
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }
    const message = update.message ?? update.edited_message;
    if (message) await handleMessage(message);
  } catch (error) {
    console.error("handleUpdate failed", error);
  }
}
