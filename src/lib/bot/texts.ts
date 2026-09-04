export const BOT_NAME = "Mist Chat Bot";
export const CHANNEL = "@MistChatChannel";

export const WELCOME = `<b>🌫 Welcome to ${BOT_NAME}</b>

Chat anonymously with a random stranger. Nobody sees your name, username or photo — only what you send.

🔍 /search — find a partner
🆕 /next — skip to a new partner
🛑 /stop — end the chat
🆘 /help — all commands

📣 Updates & launch news: ${CHANNEL}

By using this bot you accept the /rules and /terms.`;

export const AGE_GATE = `<b>🔞 Adults only (18+)</b>

${BOT_NAME} is for adults. Please confirm that you are 18 years old or older.

If you are under 18 you cannot be matched with anyone.`;

export const AGE_DENIED = `🚫 <b>You must be 18 or older to chat here.</b>

You can still read /rules and /terms, but matching is disabled for your account.`;

export const TERMS_GATE = `<b>📖 One last step</b>

Please read the /terms and /rules, then accept them to start chatting.`;

export const NAME_PROMPT = `<b>✍️ Choose your profile name</b>

Send the name your partners will see (2–32 characters). Make it a nickname — do not use your real name or phone number.`;

export const NAME_INVALID = `❌ That name does not work. Send 2–32 characters, no links or @usernames.`;

export const GENDER_PROMPT = `<b>🧑 Your gender</b>

This is used for matching only.`;

export const SELF_AGE_PROMPT = `<b>🎂 Your age</b>

Send your age as a number (18 or above).`;

export const SELF_AGE_INVALID = `❌ Send a number between 18 and 99.`;

export const LANGUAGE_PROMPT = `<b>🗣 Your language</b>

Pick the language you want to chat in.`;

export const ONBOARDING_DONE = `✅ <b>All set!</b>

Tap /search whenever you want to meet someone new.
💎 /vip — unlock unlimited partners, matching filters and saved partners.`;

export const HELP = `<b>🆘 How to use ${BOT_NAME}</b>

🔍 /search — Find a partner
🆕 /next — Stop current dialog and find a new partner
🛑 /stop — Stop current dialog
🚩 /report — Report your current or last partner
🆘 /help — How to use the bot
💎 /vip — Become a VIP
🔗 /link — Send your Telegram profile URL to your partner
🔁 /reinvite — Invite a saved partner back (VIP)
👤 /profile — View or change your name, gender, age & language
🆔 /myid — View your Telegram account ID
💰 /paysupport — Payment support
📋 /rules — Rules of the chat
📖 /terms — Terms and Conditions

You can send text, photos, videos, voice, GIFs, stickers and documents. Everything is copied to your partner anonymously.

After each chat you can rate your partner 👍 / 👎, 🚩 report them, or 💾 save them (VIP) so you can /reinvite them later.`;

export const RULES = `<b>📋 Rules of the chat</b>

1. No illegal content or activity of any kind.
2. No selling or advertising goods, services or channels.
3. No sexual content involving minors — ever. Instant permanent ban.
4. No harassment, threats, hate speech or doxxing.
5. No spam, flooding or scam links.
6. Do not share other people's private information.
7. Respect your partner. If you do not like the chat, just use /next.

<b>Enforcement</b>
• Reports are reviewed by human moderators — they decide warnings, temporary restrictions or bans.
• Repeated dislikes or reports flag your account for review.
• Illegal activity found in a report = immediate permanent ban.`;

export const TERMS = `<b>📖 Terms and Conditions</b>

• You must be 18 or older to use ${BOT_NAME}.
• You are solely responsible for everything you send.
• We store only your Telegram ID, username, preferences and moderation counters.
• We do <b>not</b> store your conversations or media. Only evidence you explicitly send when filing a /report is kept, for 30 days.
• We may restrict or ban any account that breaks the /rules, without notice or refund.
• VIP is sold with Telegram Stars inside the bot. Stars purchases are handled by Telegram.
• The service is provided "as is", without warranty of any kind.
• Anonymity is not a guarantee of privacy — never share information that could identify you.
• Using the bot means you accept these terms and our /rules.`;

export type VipPlan = { code: "week" | "month" | "year"; label: string; stars: number; days: number };

/** Percentage saved against the monthly price, rounded to a clean figure. */
export function planDiscount(plan: VipPlan, monthly: VipPlan) {
  const perDayMonthly = monthly.stars / monthly.days;
  const perDay = plan.stars / plan.days;
  const off = Math.round((1 - perDay / perDayMonthly) * 20) * 5;
  return off > 0 ? off : 0;
}

export function vipText(plans: VipPlan[], limit: number, vipUntil?: string | null) {
  const monthly = plans.find((p) => p.code === "month") ?? plans[0]!;
  const status = vipUntil
    ? `\n\n✅ <b>You are VIP</b> until <b>${vipUntil}</b>.`
    : `\n\n🔓 Free plan: up to <b>${limit}</b> different partners every 24 hours.`;
  const lines = plans
    .map((p) => {
      const off = planDiscount(p, monthly);
      return `• <b>${p.stars} ⭐</b> — ${p.label}${off ? ` <i>(save ${off}%)</i>` : ""}`;
    })
    .join("\n");
  return `<b>💎 Mist VIP</b>

• ♾ Unlimited partners — no 24-hour limit
• 🎯 Matching filters: age, country and language
• ⚡ Priority in the matching queue
• 💎 VIP badge shown to your partner

<b>Plans</b>
${lines}${status}

Pick a plan below and pay with Telegram Stars. Need help? /paysupport`;
}

export const PAYSUPPORT = `⭐ <b>Payment Support</b>

Charged wrong or VIP missing? Message us with the issue — e.g. "I'm having an issue with my VIP."

Still stuck? Contact admin: @MutasimFuadAbir`;

export const PAYSUPPORT_SENT = `📨 <b>Message sent to support.</b>

We reply within 72 hours. Back to chatting 👇`;

export const REPORT_REASONS: { code: string; label: string }[] = [
  { code: "illegal", label: "🚫 Illegal goods or activity" },
  { code: "sexual", label: "🔞 Sexual / abusive content" },
  { code: "minor", label: "🧒 Content involving a minor" },
  { code: "harassment", label: "😡 Harassment or threats" },
  { code: "spam", label: "📢 Spam or advertising" },
  { code: "other", label: "❓ Other" },
];

export function reasonLabel(code: string) {
  return REPORT_REASONS.find((r) => r.code === code)?.label ?? code;
}

export const EVIDENCE_PROMPT = `🚩 <b>Report received.</b>

If you want moderators to see what happened, send or forward the messages now (up to 5). Nothing else from the chat is stored.

Send /done when you are finished, or /skip to submit the report without evidence.`;

export const EVIDENCE_SAVED = "📎 Evidence attached. Send more, or /done when finished.";
export const EVIDENCE_CLOSED =
  "✅ Report submitted to our moderators. Thank you for keeping the bot safe.";
