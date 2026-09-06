/**
 * Anti-spam rate limiting for the Telegram relay.
 *
 * Kept in worker memory so it costs zero database round-trips on the hot path
 * (every relayed message goes through here). A cold worker simply starts the
 * user with a fresh budget, which is harmless for flood protection.
 */

const WINDOW_MS = 10_000;
const MAX_MESSAGES = 12; // relayed messages per window
const MAX_COMMANDS = 6; // commands per window
const MAX_TRACKED = 5000;

export type RateVerdict = { allowed: boolean; warn: boolean };

type Bucket = { start: number; messages: number; commands: number; warnedAt: number };

const buckets = new Map<number, Bucket>();

/**
 * Consumes one unit of the user's budget. Returns allowed=false when the user is
 * flooding, and warn=true only the first time inside a window so we don't spam back.
 */
export function consume(telegramId: number, kind: "message" | "command"): RateVerdict {
  const now = Date.now();
  let bucket = buckets.get(telegramId);
  if (!bucket || now - bucket.start > WINDOW_MS) {
    bucket = { start: now, messages: 0, commands: 0, warnedAt: bucket?.warnedAt ?? 0 };
    buckets.set(telegramId, bucket);
  }

  if (kind === "message") bucket.messages += 1;
  else bucket.commands += 1;

  const used = kind === "message" ? bucket.messages : bucket.commands;
  const allowed = used <= (kind === "message" ? MAX_MESSAGES : MAX_COMMANDS);

  let warn = false;
  if (!allowed && now - bucket.warnedAt > WINDOW_MS) {
    bucket.warnedAt = now;
    warn = true;
  }

  if (buckets.size > MAX_TRACKED) {
    for (const [id, b] of buckets) {
      if (now - b.start > WINDOW_MS * 6) buckets.delete(id);
    }
  }

  return { allowed, warn };
}

export const FLOOD_MESSAGE =
  "🐢 <b>Slow down.</b> You are sending messages too fast — wait a few seconds and try again.";
