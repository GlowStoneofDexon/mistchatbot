/** Saved partners + re-invite system (VIP feature). */

import { sendMessage, type InlineKeyboard } from "./telegram.server";
import { settings, num, bool } from "./settings.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  };
}

export type SocialUser = {
  telegram_id: number;
  display_name: string | null;
  first_name: string | null;
  state: string;
  partner_id: number | null;
  banned: boolean;
  last_seen: string;
  vip_expires_at: string | null;
  restricted_until: string | null;
  blocked_until: string | null;
};

const compact = (uuid: string) => uuid.replace(/-/g, "");
const expand = (hex: string) =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

export const isVipUser = (u: { vip_expires_at: string | null }) =>
  u.vip_expires_at != null && new Date(u.vip_expires_at).getTime() > Date.now();

export const nameOf = (u: { display_name?: string | null; first_name?: string | null } | null) =>
  (u?.display_name || u?.first_name || "Partner").slice(0, 32);

async function getUser(id: number): Promise<SocialUser | null> {
  const supabase = await db();
  const { data } = await supabase.from("bot_users").select("*").eq("telegram_id", id).maybeSingle();
  return (data as SocialUser) ?? null;
}

export async function isOnline(user: SocialUser, config?: Record<string, string>) {
  const cfg = config ?? (await settings());
  const window = num(cfg, "online_window_minutes") * 60_000;
  return Date.now() - new Date(user.last_seen).getTime() <= window;
}

const VIP_ONLY =
  "💎 <b>VIP feature</b>\n\nSaving partners and re-inviting them later is available to VIP members.\n\nSee /vip to unlock it.";

/* ------------------------------------------------------------------ saving */

export async function savePartner(user: SocialUser, partnerId: number, dialogId: string | null) {
  const config = await settings();
  if (!bool(config, "saved_partners_enabled")) {
    await sendMessage(user.telegram_id, "💾 Saving partners is currently switched off.");
    return;
  }
  if (!isVipUser(user)) {
    await sendMessage(user.telegram_id, VIP_ONLY, [[{ text: "💎 Get VIP", callback_data: "vip" }]]);
    return;
  }

  const supabase = await db();
  const limit = num(config, "vip_saved_partner_limit");
  const { count } = await supabase
    .from("saved_partners")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.telegram_id);
  if ((count ?? 0) >= limit) {
    await sendMessage(
      user.telegram_id,
      `💾 Your saved list is full (<b>${limit}</b>). Remove someone with /reinvite first.`,
    );
    return;
  }

  const partner = await getUser(partnerId);
  const { error } = await supabase.from("saved_partners").insert({
    owner_id: user.telegram_id,
    partner_id: partnerId,
    dialog_id: dialogId,
    alias: nameOf(partner),
  });
  if (error && error.code !== "23505") {
    await sendMessage(user.telegram_id, "Could not save that partner. Please try again.");
    return;
  }
  await sendMessage(
    user.telegram_id,
    error
      ? `💾 <b>${nameOf(partner)}</b> is already in your saved list. Use /reinvite to chat again.`
      : `💾 <b>${nameOf(partner)}</b> saved!\n\nUse /reinvite whenever you want to talk to them again.`,
  );
}

export async function removeSaved(user: SocialUser, partnerId: number) {
  const supabase = await db();
  await supabase.from("saved_partners").delete().eq("owner_id", user.telegram_id).eq("partner_id", partnerId);
  await sendMessage(user.telegram_id, "🗑 Removed from your saved list.");
  await listSaved(user);
}

/* ------------------------------------------------------------------ list / invite */

export async function listSaved(user: SocialUser) {
  const config = await settings();
  if (!bool(config, "saved_partners_enabled")) {
    await sendMessage(user.telegram_id, "💾 Saving partners is currently switched off.");
    return;
  }
  if (!isVipUser(user)) {
    await sendMessage(user.telegram_id, VIP_ONLY, [[{ text: "💎 Get VIP", callback_data: "vip" }]]);
    return;
  }

  const supabase = await db();
  const { data } = await supabase
    .from("saved_partners")
    .select("partner_id, alias, created_at")
    .eq("owner_id", user.telegram_id)
    .order("created_at", { ascending: false })
    .limit(25);
  const rows = (data ?? []) as { partner_id: number; alias: string | null }[];

  if (!rows.length) {
    await sendMessage(
      user.telegram_id,
      "💾 <b>No saved partners yet</b>\n\nWhen a chat ends, tap <b>💾 Save partner</b> to keep them here — then you can re-invite them any time.",
    );
    return;
  }

  const keyboard: InlineKeyboard = [];
  const lines: string[] = [];
  for (const row of rows) {
    const partner = await getUser(row.partner_id);
    const online = partner && (await isOnline(partner, config));
    lines.push(`• ${row.alias ?? nameOf(partner)} — ${online ? "🟢 online" : "⚪️ offline"}`);
    keyboard.push([
      { text: `🔁 Invite ${row.alias ?? nameOf(partner)}`, callback_data: `inv:${row.partner_id}` },
      { text: "🗑", callback_data: `svx:${row.partner_id}` },
    ]);
  }

  await sendMessage(
    user.telegram_id,
    `🔁 <b>Re-invite a saved partner</b>\n\n${lines.join("\n")}\n\nThey get an invitation and you are connected as soon as they accept — both of you must be free and online.`,
    keyboard,
  );
}

export async function sendInvite(user: SocialUser, partnerId: number) {
  const config = await settings();
  if (!bool(config, "saved_partners_enabled")) {
    await sendMessage(user.telegram_id, "💾 The re-invite system is currently switched off.");
    return;
  }
  if (!isVipUser(user)) {
    await sendMessage(user.telegram_id, VIP_ONLY, [[{ text: "💎 Get VIP", callback_data: "vip" }]]);
    return;
  }
  if (user.state === "chatting") {
    await sendMessage(user.telegram_id, "💬 End your current chat with /stop before inviting someone.");
    return;
  }

  const supabase = await db();
  const { data: saved } = await supabase
    .from("saved_partners")
    .select("partner_id")
    .eq("owner_id", user.telegram_id)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!saved) {
    await sendMessage(user.telegram_id, "That partner is not in your saved list any more.");
    return;
  }

  const cooldown = num(config, "invite_cooldown_seconds") * 1000;
  const { data: recent } = await supabase
    .from("chat_invites")
    .select("created_at, status")
    .eq("from_id", user.telegram_id)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = (recent ?? [])[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < cooldown) {
    await sendMessage(user.telegram_id, "⏱ Please wait a moment before sending another invitation.");
    return;
  }

  const partner = await getUser(partnerId);
  if (!partner || partner.banned) {
    await sendMessage(user.telegram_id, "That partner is not available.");
    return;
  }
  if (partner.state === "chatting") {
    await sendMessage(user.telegram_id, `💬 <b>${nameOf(partner)}</b> is in another chat right now. Try again later.`);
    return;
  }

  const { data: inserted } = await supabase
    .from("chat_invites")
    .insert({
      from_id: user.telegram_id,
      to_id: partnerId,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (!inserted?.id) {
    await sendMessage(user.telegram_id, "Could not send the invitation. Please try again.");
    return;
  }

  const online = await isOnline(partner, config);
  await sendMessage(
    partnerId,
    `🔔 <b>${nameOf(user)}</b> wants to chat with you again.\n\nAccept to be connected right away.`,
    [
      [
        { text: "✅ Accept", callback_data: `iva:${compact(inserted.id)}` },
        { text: "❌ Decline", callback_data: `ivd:${compact(inserted.id)}` },
      ],
    ],
  );
  await sendMessage(
    user.telegram_id,
    `📨 Invitation sent to <b>${nameOf(partner)}</b>${
      online ? "" : " — they are offline right now, so they will see it when they come back"
    }.\n\nStay online: you are connected the moment they accept.`,
  );
}

export async function respondInvite(user: SocialUser, inviteHex: string, accept: boolean) {
  const supabase = await db();
  const id = expand(inviteHex);
  const { data: invite } = await supabase
    .from("chat_invites")
    .select("id, from_id, to_id, status, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (!invite || invite.to_id !== user.telegram_id) {
    await sendMessage(user.telegram_id, "That invitation is no longer available.");
    return;
  }
  if (invite.status !== "pending" || new Date(invite.expires_at).getTime() < Date.now()) {
    await sendMessage(user.telegram_id, "⌛ That invitation has expired.");
    return;
  }

  if (!accept) {
    await supabase
      .from("chat_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", id);
    await sendMessage(user.telegram_id, "❌ Invitation declined.");
    await sendMessage(invite.from_id, `❌ <b>${nameOf(user)}</b> declined your invitation.`);
    return;
  }

  const config = await settings();
  const inviter = await getUser(invite.from_id);
  if (!inviter || inviter.banned) {
    await sendMessage(user.telegram_id, "That partner is not available any more.");
    return;
  }
  if (user.state === "chatting") {
    await sendMessage(user.telegram_id, "💬 You are already in a chat. Use /stop first, then accept again.");
    return;
  }
  if (inviter.state === "chatting") {
    await sendMessage(user.telegram_id, `💬 <b>${nameOf(inviter)}</b> is already chatting with someone else.`);
    return;
  }
  if (!(await isOnline(inviter, config))) {
    await sendMessage(
      user.telegram_id,
      `⚪️ <b>Your partner is offline.</b>\n\n${nameOf(inviter)} is not available right now — try again when they are back, or /search for someone new.`,
    );
    return;
  }

  const { data: session } = await supabase
    .from("match_sessions")
    .insert({ user_a: inviter.telegram_id, user_b: user.telegram_id, status: "active" })
    .select("id")
    .maybeSingle();
  if (!session?.id) {
    await sendMessage(user.telegram_id, "Could not open the chat. Please try again.");
    return;
  }

  await supabase
    .from("bot_users")
    .update({ state: "chatting", partner_id: user.telegram_id, dialog_id: session.id })
    .eq("telegram_id", inviter.telegram_id);
  await supabase
    .from("bot_users")
    .update({ state: "chatting", partner_id: inviter.telegram_id, dialog_id: session.id })
    .eq("telegram_id", user.telegram_id);
  await supabase.from("partner_interactions").insert([
    { user_id: inviter.telegram_id, partner_id: user.telegram_id, match_id: session.id },
    { user_id: user.telegram_id, partner_id: inviter.telegram_id, match_id: session.id },
  ]);
  await supabase
    .from("chat_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", id);

  const note = (other: SocialUser) =>
    `✅ <b>Reconnected with ${nameOf(other)}!</b>\n\n🆕 /next — new partner · 🛑 /stop — end chat · 🚩 /report`;
  await sendMessage(user.telegram_id, note(inviter));
  await sendMessage(inviter.telegram_id, note(user));
}
