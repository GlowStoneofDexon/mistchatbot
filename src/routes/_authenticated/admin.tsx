import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin,
  listReports,
  setBanned,
  getSettings,
  saveSettings,
  getThread,
  type AdminUser,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Moderation Dashboard — Mist Chat Bot" },
      { name: "description", content: "Review reports, ban users and manage launch settings." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Moderation Dashboard — Mist Chat Bot" },
      { property: "og:description", content: "Reports, bans and launch settings for Mist Chat Bot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function ThreadViewer({
  dialogId,
  reporterId,
  reportedId,
}: {
  dialogId: string;
  reporterId: number | null;
  reportedId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const fetchThread = useServerFn(getThread);
  const threadQuery = useQuery({
    queryKey: ["admin-thread", dialogId],
    queryFn: () => fetchThread({ data: { dialogId } }),
    enabled: open,
  });

  const messages = threadQuery.data ?? [];

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide conversation" : "View conversation"}
      </Button>
      {open && (
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
          {threadQuery.isLoading && <p className="text-sm text-muted-foreground">Loading messages…</p>}
          {!threadQuery.isLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No stored messages for this dialog (it may predate message logging).
            </p>
          )}
          {messages.map((m) => {
            const isReporter = reporterId != null && Number(m.sender_id) === Number(reporterId);
            const label = isReporter
              ? "Partner 1"
              : reportedId != null && Number(m.sender_id) === Number(reportedId)
                ? "Partner 2"
                : "Unknown";
            return (
              <div
                key={m.id}
                className={`rounded-md border border-border p-2 text-sm ${isReporter ? "" : "bg-muted/40"}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="font-mono">{m.sender_id}</span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  {m.kind !== "text" && <Badge variant="secondary">{m.kind}</Badge>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-foreground">
                  {m.content ?? <span className="text-muted-foreground">[{m.kind}]</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PartnerCard({ label, user }: { label: string; user: AdminUser | null }) {

  if (!user) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        {label}: unknown user
      </div>
    );
  }
  const ratio = user.total_ratings ? Math.round((user.dislikes / user.total_ratings) * 100) : 0;
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{label}</span>
        {user.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : (
          <Badge variant="secondary">{user.state}</Badge>
        )}
      </div>
      <p className="mt-1 text-muted-foreground">
        ID <span className="font-mono text-foreground">{user.telegram_id}</span>
        {user.username ? ` · @${user.username}` : ""}
        {user.first_name ? ` · ${user.first_name}` : ""}
      </p>
      <p className="mt-1 text-muted-foreground">
        👍 {user.likes} · 👎 {user.dislikes} ({ratio}% of {user.total_ratings}) · reports{" "}
        {user.report_count} · chats {user.chats_completed}
      </p>
      {user.blocked_until && (
        <p className="mt-1 text-muted-foreground">
          Blocked until {new Date(user.blocked_until).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const checkAdmin = useServerFn(isAdmin);
  const fetchReports = useServerFn(listReports);
  const fetchSettings = useServerFn(getSettings);
  const banFn = useServerFn(setBanned);
  const saveFn = useServerFn(saveSettings);

  const adminQuery = useQuery({ queryKey: ["is-admin"], queryFn: () => checkAdmin() });
  const allowed = adminQuery.data?.admin === true;

  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => fetchReports(),
    enabled: allowed,
  });
  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => fetchSettings(),
    enabled: allowed,
  });

  const [chatLocked, setChatLocked] = useState(true);
  const [launchAt, setLaunchAt] = useState("");
  const [testerIds, setTesterIds] = useState("");

  useEffect(() => {
    if (settingsQuery.data) {
      setChatLocked(settingsQuery.data.chat_locked);
      setLaunchAt(settingsQuery.data.launch_at);
      setTesterIds(settingsQuery.data.tester_ids);
    }
  }, [settingsQuery.data]);

  const banMutation = useMutation({
    mutationFn: (vars: { telegramId: number; banned: boolean }) => banFn({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.banned ? "User banned" : "User unbanned");
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsMutation = useMutation({
    mutationFn: () =>
      saveFn({ data: { chat_locked: chatLocked, launch_at: launchAt, tester_ids: testerIds } }),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (adminQuery.isLoading) {
    return <main className="p-8 text-muted-foreground">Loading…</main>;
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Not authorised</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This account does not have the admin role. Ask an existing admin to grant access.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </main>
    );
  }

  const reports = reportsQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Moderation dashboard</h1>
          <p className="text-sm text-muted-foreground">Mist Chat Bot reports and launch settings</p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Launch settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="lock">Chat locked (pre-launch)</Label>
              <p className="text-xs text-muted-foreground">
                When on, only testers and the admin can chat.
              </p>
            </div>
            <Switch id="lock" checked={chatLocked} onCheckedChange={setChatLocked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="launch">Premiere date (ISO, e.g. 2026-10-10T12:00:00Z)</Label>
            <Input id="launch" value={launchAt} onChange={(e) => setLaunchAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testers">Tester Telegram IDs (comma separated)</Label>
            <Input id="testers" value={testerIds} onChange={(e) => setTesterIds(e.target.value)} />
          </div>
          <Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending}>
            {settingsMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          Reports {reportsQuery.data ? `(${reports.length})` : ""}
        </h2>
        {reportsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading reports…</p>}
        {!reportsQuery.isLoading && reports.length === 0 && (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        )}
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                  <Badge variant={report.distinct_reports >= 10 ? "destructive" : "secondary"}>
                    {report.distinct_reports} distinct reporters
                  </Badge>
                </div>
                <p className="text-sm text-foreground">Reason: {report.reason}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PartnerCard label="Partner 1 (reporter)" user={report.reporter} />
                  <PartnerCard label="Partner 2 (reported)" user={report.reported} />
                </div>
                {report.reported && (
                  <div className="flex gap-2">
                    {report.reported.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={banMutation.isPending}
                        onClick={() =>
                          banMutation.mutate({
                            telegramId: report.reported!.telegram_id,
                            banned: false,
                          })
                        }
                      >
                        Unban Partner 2
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={banMutation.isPending}
                        onClick={() =>
                          banMutation.mutate({
                            telegramId: report.reported!.telegram_id,
                            banned: true,
                          })
                        }
                      >
                        Ban Partner 2
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
