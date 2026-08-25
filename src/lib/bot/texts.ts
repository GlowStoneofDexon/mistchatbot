export const BOT_NAME = "Mist Chat Bot";

export const WELCOME = `<b>🌫 Welcome to ${BOT_NAME}</b>

Chat anonymously with a random stranger. Nobody sees your name, username or photo — only what you send.

🔍 /search — find a partner
🆕 /next — skip to a new partner
🛑 /stop — end the chat
🆘 /help — all commands

By using this bot you accept the /rules and /terms.`;

export const HELP = `<b>🆘 How to use ${BOT_NAME}</b>

🔍 /search — Find a partner
🆕 /next — Stop current dialog and find a new partner
🛑 /stop — Stop current dialog
🆘 /help — How to use the bot
💎 /vip — Become a VIP
🔗 /link — Send your Telegram profile URL to your partner
🆔 /myid — View your Telegram account ID
💰 /paysupport — Payment support
📋 /rules — Rules of the chat
📖 /terms — Terms and Conditions

You can send text, photos, videos, voice, GIFs, stickers and documents. Everything is copied to your partner anonymously.

After each chat you can rate your partner 👍 / 👎 or 🚩 report them.`;

export const RULES = `<b>📋 Rules of the chat</b>

1. No illegal content or activity of any kind.
2. No selling or advertising goods, services or channels.
3. No sexual content involving minors — ever. Instant permanent ban.
4. No harassment, threats, hate speech or doxxing.
5. No spam, flooding or scam links.
6. Do not share other people's private information.
7. Respect your partner. If you do not like the chat, just use /next.

<b>Enforcement</b>
• 👎 If 65% or more of your ratings are dislikes (after at least 10 ratings), you cannot search for 24 hours.
• 🚩 10 reports from 10 different people = permanent ban.
• Illegal activity found in a report = immediate permanent ban.`;

export const TERMS = `<b>📖 Terms and Conditions</b>

• You must be 18 or older to use ${BOT_NAME}.
• You are solely responsible for everything you send.
• We store only your Telegram ID, username and moderation counters — no chat history is kept in our database.
• Active dialogs may be mirrored to a private moderation log so reports can be reviewed. Do not share sensitive personal data.
• We may block or ban any account that breaks the /rules, without notice or refund.
• The service is provided "as is", without warranty of any kind.
• Anonymity is not a guarantee of privacy — never share information that could identify you.
• Using the bot means you accept these terms and our /rules.`;

export const VIP = `<b>💎 VIP</b>

Right now everything is <b>free and unlimited</b> — chat with as many people as you want, no limits.

VIP is coming soon and will add:
• Gender and country preferences
• Priority in the matching queue
• A VIP badge shown to your partner

Payments will be accepted via <b>bKash</b>, <b>Nagad</b> and <b>cryptocurrency</b>. Nothing is charged today.`;

export const PAYSUPPORT = `<b>💰 Payment support</b>

There are no paid features yet, so no payments are being collected and there is nothing to refund.

When VIP launches (bKash / Nagad / crypto), refund requests can be sent here with /paysupport and will be handled within 72 hours.`;

export const REPORT_REASONS: { code: string; label: string }[] = [
  { code: "illegal", label: "🚫 Illegal goods or activity" },
  { code: "sexual", label: "🔞 Sexual / abusive content" },
  { code: "harassment", label: "😡 Harassment or threats" },
  { code: "spam", label: "📢 Spam or advertising" },
  { code: "other", label: "❓ Other" },
];

export function reasonLabel(code: string) {
  return REPORT_REASONS.find((r) => r.code === code)?.label ?? code;
}
