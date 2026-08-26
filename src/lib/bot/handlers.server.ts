import { sendMessage, copyMessage, answerCallbackQuery, type InlineKeyboard } from "./telegram.server";
import { WELCOME, HELP, RULES, TERMS, VIP, PAYSUPPORT, REPORT_REASONS, reasonLabel } from "./texts";
import { chatBlocked, launchState, premiereMessage } from "./gate.server";
import { consume, FLOOD_MESSAGE } from "./limits.server";

type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
};

type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
};

type TgCallback = {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
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
};

const DISLIKE_THRESHOLD = 0.65;
const MIN_RATINGS_FOR_BLOCK = 10;
const REPORTS_FOR_BAN = 10;
const BLOCK_HOURS = 24;

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

async function setIdle(id: number) {
  const supabase = await db();
  await supabase
    .from("bot_users")
    .update({ state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", id);
}

function tag(user: BotUser | null, id: number) {
  const uname = user?.username ? `@${user.username}` : "no username";
  return `<code>${id}</code> (${uname})`;
}

function isBlocked(user: BotUser) {
  return user.blocked_until != null && new Date(user.blocked_until).getTime() > Date.now();
}

function blockedMessage(user: BotUser) {
  const until = new Date(user.blocked_until!);
  return `⏳ You are temporarily blocked from searching because too many partners disliked you.\n\nYou can chat again after <b>${until.toUTCString()}</b>.`;
}

const BANNED_MESSAGE =
  "🚫 Your account has been permanently banned for breaking the /rules. You can no longer use this bot.";

async function mirror(dialogId: string | null, label: string, message: TgMessage) {
  const chat = await adminChatId();
  if (!chat || !dialogId) return;
  const short = compact(dialogId).slice(0, 8);
  await sendMessage(chat, `🗂 <code>${short}</code> · <b>${label}</b>`);
  await copyMessage(chat, message.chat.id, message.message_id);
}

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

/** Ends a dialog for both sides and offers the rating buttons. */
async function endDialog(user: BotUser, opts: { notifyPartner: boolean; reason?: string }) {
  const supabase = await db();
  const partnerId = user.partner_id;
  const dialogId = user.dialog_id;

  await setIdle(user.telegram_id);
  if (partnerId) await setIdle(partnerId);

  if (dialogId) {
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

async function startSearch(user: BotUser) {
  const supabase = await db();

  if (user.banned) {
    await sendMessage(user.telegram_id, BANNED_MESSAGE);
    return;
  }
  if (isBlocked(user)) {
    await sendMessage(user.telegram_id, blockedMessage(user));
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


  await supabase.from("bot_users").update({ state: "searching" }).eq("telegram_id", user.telegram_id);

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

  const found =
    "✅ <b>Partner found!</b>\n\nSay hi 👋 Everything you send is delivered anonymously.\n\n🆕 /next — new partner · 🛑 /stop — end chat";
  await sendMessage(user.telegram_id, found);
  await sendMessage(match.partner as number, found);
}

async function applyDislikeRule(ratedId: number) {
  const supabase = await db();
  const { data } = await supabase
    .from("bot_users")
    .select("dislikes, total_ratings")
    .eq("telegram_id", ratedId)
    .maybeSingle();
  if (!data || data.total_ratings < MIN_RATINGS_FOR_BLOCK) return;
  if (data.dislikes / data.total_ratings < DISLIKE_THRESHOLD) return;

  const until = new Date(Date.now() + BLOCK_HOURS * 3600 * 1000).toISOString();
  await supabase
    .from("bot_users")
    .update({ blocked_until: until, state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", ratedId);
  await sendMessage(
    ratedId,
    `⏳ <b>You have been blocked for ${BLOCK_HOURS} hours.</b>\n\n${Math.round(
      (data.dislikes / data.total_ratings) * 100,
    )}% of your ratings are dislikes. Please read the /rules before chatting again.`,
  );
}

async function applyReportRule(reportedId: number) {
  const supabase = await db();
  const { data } = await supabase.from("reports").select("reporter_id").eq("reported_id", reportedId);
  const distinct = new Set((data ?? []).map((r: { reporter_id: number }) => r.reporter_id)).size;
  await supabase.from("bot_users").update({ report_count: distinct }).eq("telegram_id", reportedId);

  if (distinct >= REPORTS_FOR_BAN) {
    await banUser(reportedId, "10 reports from different users");
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
    .update({ banned: true, state: "idle", partner_id: null, dialog_id: null })
    .eq("telegram_id", id);
  await sendMessage(id, BANNED_MESSAGE);
  const admin = await adminChatId();
  if (admin) await sendMessage(admin, `🔨 Banned ${tag(target, id)} — ${reason}`);
}

async function handleReport(reporter: BotUser, reportedId: number, dialogId: string, reasonCode: string) {
  const supabase = await db();
  const reported = await getUser(reportedId);

  const { error } = await supabase.from("reports").insert({
    reporter_id: reporter.telegram_id,
    reported_id: reportedId,
    dialog_id: dialogId,
    reason: reasonCode,
  });
  if (error && error.code === "23505") {
    await sendMessage(reporter.telegram_id, "You have already reported this chat. Thank you.");
    return;
  }

  const distinct = await applyReportRule(reportedId);

  const admin = await adminChatId();
  if (admin) {
    await sendMessage(
      admin,
      `🚩 <b>NEW REPORT</b>\nDialog: <code>${compact(dialogId).slice(0, 8)}</code>\nReason: ${reasonLabel(
        reasonCode,
      )}\n\n<b>Partner 1 (reporter)</b>: ${tag(reporter, reporter.telegram_id)}\n<b>Partner 2 (reported)</b>: ${tag(
        reported,
        reportedId,
      )}\n\nDistinct reports against Partner 2: <b>${distinct}/${REPORTS_FOR_BAN}</b>\n\nBan with <code>/ban ${reportedId}</code>`,
    );
  }

  await sendMessage(
    reporter.telegram_id,
    "🚩 Report sent to our moderators along with the conversation. Thank you for keeping the bot safe.",
  );
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
    value === 1 ? "👍 Thanks for the feedback! Use /search for a new partner." : "👎 Noted. Use /search for a new partner.",
  );
  await applyDislikeRule(ratedId);
}

async function handleAdminCommand(text: string, chatId: number) {
  const [cmd, arg] = text.trim().split(/\s+/);

  if (cmd === "/whereami") {
    const supabase = await db();
    await supabase
      .from("bot_settings")
      .upsert({ key: "admin_chat_id", value: String(chatId), updated_at: new Date().toISOString() }, { onConflict: "key" });
    await sendMessage(
      chatId,
      `✅ Saved. This chat (<code>${chatId}</code>) is now the moderation destination for reports and dialog mirroring.`,
    );
    return true;
  }

  const admin = await adminChatId();
  if (!admin || String(chatId) !== admin) return false;

  if (cmd === "/ban" && arg) {
    await banUser(Number(arg), "manual admin ban");
    return true;
  }
  if (cmd === "/unban" && arg) {
    const supabase = await db();
    await supabase
      .from("bot_users")
      .update({ banned: false, blocked_until: null, report_count: 0 })
      .eq("telegram_id", Number(arg));
    await supabase.from("reports").delete().eq("reported_id", Number(arg));
    await sendMessage(chatId, `♻️ Unbanned <code>${arg}</code>.`);
    await sendMessage(Number(arg), "♻️ Your ban has been lifted. Please follow the /rules — use /search to chat.");
    return true;
  }
  if (cmd === "/stats") {
    const supabase = await db();
    const { data } = await supabase.rpc("bot_public_stats");
    const s = Array.isArray(data) ? data[0] : data;
    await sendMessage(
      chatId,
      `📊 Users: <b>${s?.total_users ?? 0}</b>\nActive dialogs: <b>${s?.active_dialogs ?? 0}</b>\nWaiting: <b>${
        s?.waiting ?? 0
      }</b>`,
    );
    return true;
  }
  if (cmd === "/info" && arg) {
    const u = await getUser(Number(arg));
    await sendMessage(
      chatId,
      u
        ? `ℹ️ ${tag(u, u.telegram_id)}\nState: ${u.state}\n👍 ${u.likes} · 👎 ${u.dislikes} of ${u.total_ratings}\nReports: ${u.report_count}\nBanned: ${u.banned}\nBlocked until: ${u.blocked_until ?? "—"}`
        : "Unknown user.",
    );
    return true;
  }
  return false;
}

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

  if (user.banned && text !== "/myid") {
    await sendMessage(user.telegram_id, BANNED_MESSAGE);
    return;
  }

  const rate = await consume(user.telegram_id, text.startsWith("/") ? "command" : "message");
  if (!rate.allowed) {
    if (rate.warn) await sendMessage(user.telegram_id, FLOOD_MESSAGE);
    return;
  }

  if (text.startsWith("/")) {
    const command = text.split(/[\s@]/)[0];
    switch (command) {
      case "/start":
        await sendMessage(user.telegram_id, WELCOME);
        return;
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
        await sendMessage(user.telegram_id, VIP);
        return;
      case "/paysupport":
        await sendMessage(user.telegram_id, PAYSUPPORT);
        return;
      case "/myid":
        await sendMessage(
          user.telegram_id,
          `🆔 Your Telegram ID is <code>${user.telegram_id}</code>\n\nYour partner never sees this.`,
        );
        return;
      case "/search":
        await startSearch(user);
        return;
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
      default:
        await sendMessage(user.telegram_id, "Unknown command. See /help for the full list.");
        return;
    }
  }

  if (user.state !== "chatting" || !user.partner_id) {
    const gate = await chatBlocked(user.telegram_id);
    await sendMessage(
      user.telegram_id,
      gate ?? "You are not chatting with anyone. Tap /search to find a partner 🔍",
    );
    return;
  }

  const relayed = await copyMessage(user.partner_id, message.chat.id, message.message_id);
  if (!relayed) {
    await sendMessage(user.telegram_id, "Your partner is unreachable. Use /next to find someone new.");
    return;
  }
  await mirror(user.dialog_id, `Partner ${user.telegram_id}`, message);
}

async function handleCallback(callback: TgCallback) {
  const data = callback.data ?? "";
  const user = await ensureUser(callback.from);
  await answerCallbackQuery(callback.id);

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
      "🚩 What is wrong with this chat? The conversation will be sent to our moderators.",
      REPORT_REASONS.map((r) => [
        { text: r.label, callback_data: `rs:${r.code}:${report[1]}:${report[2]}` },
      ]),
    );
    return;
  }

  const reason = /^rs:([a-z]+):([0-9a-f]{32}):(\d+)$/.exec(data);
  if (reason) {
    await handleReport(user, Number(reason[3]), expand(reason[2]!), reason[1]!);
    return;
  }
}

export async function handleUpdate(update: TgUpdate) {
  try {
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
