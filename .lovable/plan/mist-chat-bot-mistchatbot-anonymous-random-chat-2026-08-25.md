# Mist Chat Bot (@MistChatBot) — Anonymous Random Chat

An anonymous 1-to-1 Telegram chat bot. Users tap /search, get matched with a stranger, and exchange text, photos, videos, GIFs and stickers without ever seeing each other's identity. Moderation is handled through dislikes, reports and bans.

## Phase 1 scope (this build)

- Unlimited chatting for everyone. No paid tiers yet — /vip and /paysupport exist as informational commands ("VIP is coming soon; bKash/Nagad/crypto will be supported").
- The 15-chat limit / 24-hour wait is left out for now and can be switched on later without a rewrite (the counter is still tracked in the database).

## How it works for a user

1. `/search` puts the user in a waiting queue. As soon as another user is waiting, both are paired and told "Partner found".
2. Anything either side sends is copied to the other, anonymously — no forward header, no name, no username. Supported: text, photos, videos, video notes, voice, animations/GIFs, stickers, documents.
3. `/next` ends the dialog and immediately searches for a new partner. `/stop` just ends it.
4. When a dialog ends, both users get buttons: 👍 Like, 👎 Dislike, 🚩 Report.
5. `/link` sends the user's own Telegram profile link to the partner — only after that user explicitly confirms (it de-anonymises them).

## Commands

| Command | Behaviour |
|---|---|
| /start | Welcome, quick how-to, registers the user |
| /search | 🔍 Find a partner |
| /next | 🆕 End dialog and find a new partner |
| /stop | 🛑 End the current dialog |
| /help | 🆘 How to use the bot |
| /vip | 💎 VIP info (coming soon, no charge today) |
| /link | 🔗 Share your Telegram profile URL with the partner (with confirmation) |
| /myid | 🆔 Show your numeric Telegram ID |
| /paysupport | 💰 Payment support contact / refund policy |
| /rules | 📋 Rules of the chat |
| /terms | 📖 Terms and Conditions |

## Moderation rules

- **Reports** — 🚩 Report opens a short reason picker (spam / illegal goods / harassment / sexual content / other). The report is sent to the admin group with both sides labelled **Partner 1** and **Partner 2**, each with their user ID and @username, plus the reason. Only distinct reporters count: 10 reports from 10 different users = permanent ban (no bot access). Repeat reports from the same account are recorded but do not increment the ban counter.
- **Dislikes** — counted separately from reports. When a user's dislike rate reaches 65% or more (with a minimum of 10 total ratings so one bad chat can't ban anyone), they are blocked from searching for 24 hours from that moment.
- **Illegal activity** — admins can ban instantly from the admin group with a `/ban <user_id>` (and `/unban <user_id>`) command, used when a report shows illegal goods or activity.
- Banned users get a clear message on every interaction and can never be matched.

## Report evidence (live forwarding)

No conversation history is stored in the database. Instead, while a dialog is active every message is mirrored in real time to a private admin log topic/channel, tagged with the dialog ID and whether it came from Partner 1 or Partner 2. When someone reports, the admin gets a report card that points at that dialog ID, so the full exchange is already there to read.

## Data stored

Only what's needed to identify and moderate a user:

- `users` — telegram_id, username, first seen, last seen, language
- counters — likes, dislikes, total ratings, distinct report count, chats completed
- state — `searching` / `chatting` / `idle`, current partner, blocked_until, banned flag
- `reports` — reporter id, reported id, reason, dialog id, timestamp (for the distinct-reporter rule)
- `ratings` — rater id, rated id, like/dislike, timestamp (prevents double-rating one dialog)

No message text, photos or media are written to the database.

## Admin group

Reports and live dialog mirroring go to the private group behind the invite link you gave. Telegram bots can't join by invite link, so: add @MistChatBot to that group as an admin, then send `/whereami` in the group — the bot replies with the group's numeric chat ID, which gets saved as the admin destination.

## Technical approach

- Backend on Lovable Cloud (Postgres + server runtime). Bot token stored as a secret.
- A public webhook route `/api/public/telegram/webhook` receives Telegram updates, verified by a secret token header; the webhook is registered with Telegram via the Telegram connector gateway.
- Message relay uses `copyMessage` (not `forwardMessage`) so no sender identity leaks.
- Matching is done in a single Postgres transaction with row locking so two users can never be paired with the same third user.
- Rate limiting per user to stop flood/spam; media size limits left at Telegram defaults.
- A small admin web page (the site itself) shows live stats: active dialogs, users, bans, top reported — read-only, protected by login.

## Not in this phase

- Paid VIP, bKash/Nagad/crypto billing, the 15-chat cap and 24-hour cooldown for free users. All hooks are in place so this can be turned on as a follow-up.
