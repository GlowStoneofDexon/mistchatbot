const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function authHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!telegramKey) throw new Error("TELEGRAM_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": telegramKey,
    "Content-Type": "application/json",
  };
}

export async function tg<T = unknown>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<T | null> {
  const response = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Telegram ${method} failed [${response.status}]: ${text}`);
    return null;
  }
  let parsed: { ok?: boolean; result?: T; description?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    console.error(`Telegram ${method} returned non-JSON: ${text}`);
    return null;
  }
  if (!parsed.ok) {
    console.error(`Telegram ${method} error: ${parsed.description ?? text}`);
    return null;
  }
  return (parsed.result ?? null) as T | null;
}

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = InlineButton[][];

export function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/** Copies a message so the receiver never sees who sent it. */
export function copyMessage(toChatId: number | string, fromChatId: number, messageId: number) {
  return tg("copyMessage", {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: messageId,
  });
}

export function answerCallbackQuery(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

/** Telegram Stars invoice (currency XTR, no provider token). */
export function sendStarsInvoice(opts: {
  chatId: number;
  title: string;
  description: string;
  payload: string;
  stars: number;
}) {
  return tg("sendInvoice", {
    chat_id: opts.chatId,
    title: opts.title,
    description: opts.description,
    payload: opts.payload,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: opts.title, amount: opts.stars }],
  });
}

export function answerPreCheckoutQuery(id: string, ok = true, errorMessage?: string) {
  return tg("answerPreCheckoutQuery", {
    pre_checkout_query_id: id,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? "Payment could not be processed." }),
  });
}

/** Membership status of a user in a channel/group ("left" when not joined). */
export async function getChatMemberStatus(chat: string, userId: number): Promise<string | null> {
  const result = await tg<{ status?: string }>("getChatMember", { chat_id: chat, user_id: userId });
  return result?.status ?? null;
}

export function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}
