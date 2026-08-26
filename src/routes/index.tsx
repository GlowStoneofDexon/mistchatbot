import { createFileRoute } from "@tanstack/react-router";
import { getBotStats } from "@/lib/stats.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mist Chat Bot — Anonymous Random Chat on Telegram" },
      {
        name: "description",
        content:
          "Mist Chat Bot pairs you with a random stranger on Telegram. Chat with text, photos, videos, GIFs and stickers — fully anonymous.",
      },
      { property: "og:title", content: "Mist Chat Bot — Anonymous Random Chat on Telegram" },
      {
        property: "og:description",
        content: "Tap /search and start an anonymous 1-to-1 chat with a stranger on Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => getBotStats(),
  component: Index,
});

const COMMANDS: [string, string][] = [
  ["/search", "Find a random partner"],
  ["/next", "Skip and find a new one"],
  ["/stop", "End the current chat"],
  ["/link", "Share your profile (with confirmation)"],
  ["/myid", "Show your Telegram ID"],
  ["/rules", "Rules of the chat"],
  ["/terms", "Terms and conditions"],
  ["/vip", "VIP info — coming soon"],
];

function Index() {
  const stats = Route.useLoaderData();
  const cards = [
    ["Users", stats.total_users],
    ["Chatting now", stats.chatting_now],
    ["Searching", stats.searching_now],
    ["Chats completed", stats.chats_completed],
  ] as const;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">@MistChatBot</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
          Talk to strangers. Stay a mist.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          An anonymous 1-to-1 Telegram chat. Text, photos, videos, GIFs and stickers are relayed
          without ever revealing who you are.
        </p>
        <a
          href="https://t.me/MistChatBot"
          className="mt-8 inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open in Telegram
        </a>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border p-4">
              <div className="text-2xl font-semibold">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        <h2 className="mt-16 text-lg font-semibold">Commands</h2>
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {COMMANDS.map(([cmd, desc]) => (
            <li key={cmd} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <code className="font-mono text-foreground">{cmd}</code>
              <span className="text-muted-foreground">{desc}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-muted-foreground">
          Be kind. Reports and dislikes are reviewed — abuse, illegal goods or harassment lead to a
          permanent ban.
        </p>
      </section>
    </main>
  );
}
