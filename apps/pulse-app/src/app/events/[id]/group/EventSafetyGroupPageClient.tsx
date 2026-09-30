"use client";

import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDate, formatEventTime } from "@/features/events/dateFormat";
import { routeForPlatform } from "@/lib/native/navigation";
import {
  ArrowLeft,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  Send,
  ShieldAlert,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type SafetyEnvelope = ReadableSchema<"EventSafetyGroupEnvelopeResponse">;
type SafetyFriend = ReadableSchema<"EligibleSafetyFriendResponse">;

export default function EventSafetyGroupPageClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading } = useDataProvider();
  const eventId = params.id === "mobile" ? searchParams.get("eventId") ?? "" : params.id;
  const [data, setData] = useState<SafetyEnvelope | null>(null);
  const [pending, setPending] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!eventId) return;
    if (!quiet) setPending(true);
    try {
      const response: SafetyEnvelope = await ApiClient.instance.get(
        "/events/{id}/safety-group",
        { params: { path: { id: eventId } } },
      );
      setData(response);
      setError(null);
      setConnectionLost(false);
    } catch (requestError) {
      setConnectionLost(true);
      if (!quiet) setError(requestError instanceof Error ? requestError.message : t("safetyGroup.loadFailed"));
    } finally {
      if (!quiet) setPending(false);
    }
  }, [eventId, t]);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace(`/login?returnTo=${encodeURIComponent(routeForPlatform(`/events/${eventId}/group`))}`);
      return;
    }
    if (user) void load();
  }, [eventId, load, router, sessionLoading, user]);

  useEffect(() => {
    if (!user || data?.group?.currentMemberStatus !== "accepted") return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [data?.group?.currentMemberStatus, load, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [data?.group?.messages.length]);

  const createGroup = async () => {
    setWorking(true);
    try {
      await ApiClient.instance.post("/events/{id}/safety-group", {
        params: { path: { id: eventId } },
        body: { friendIds: selectedFriends },
      });
      toast.success(t("safetyGroup.created"));
      await load(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : t("safetyGroup.createFailed"));
    } finally {
      setWorking(false);
    }
  };

  const respond = async (status: "accepted" | "declined") => {
    setWorking(true);
    try {
      await ApiClient.instance.post("/events/{id}/safety-group/respond", {
        params: { path: { id: eventId } }, body: { status },
      });
      await load(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : t("safetyGroup.responseFailed"));
    } finally {
      setWorking(false);
    }
  };

  const sendMessage = async () => {
    const content = message.trim();
    if (!content || working) return;
    setWorking(true);
    try {
      await ApiClient.instance.post("/events/{id}/safety-group/messages", {
        params: { path: { id: eventId } }, body: { content },
      });
      setMessage("");
      await load(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : t("safetyGroup.sendFailed"));
    } finally {
      setWorking(false);
    }
  };

  const sendHelp = async () => {
    setWorking(true);
    try {
      await ApiClient.instance.post("/events/{id}/safety-group/help", {
        params: { path: { id: eventId } }, body: { content: t("safetyGroup.helpMessage") },
      });
      toast.success(t("safetyGroup.helpSent"));
      await load(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : t("safetyGroup.helpFailed"));
    } finally {
      setWorking(false);
    }
  };

  const resolveHelp = async () => {
    setWorking(true);
    try {
      await ApiClient.instance.post("/events/{id}/safety-group/help-resolved", {
        params: { path: { id: eventId } }, body: { content: t("safetyGroup.safeMessage") },
      });
      await load(true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : t("safetyGroup.sendFailed"));
    } finally {
      setWorking(false);
    }
  };

  if (sessionLoading || pending) {
    return <GroupShell onBack={() => router.back()}><div className="mt-10 h-48 animate-pulse rounded-[28px] bg-white/5" /></GroupShell>;
  }

  if (error || !data) {
    return (
      <GroupShell onBack={() => router.back()}>
        <div className="mt-10 rounded-[28px] border border-primary/30 bg-primary/10 p-6 text-center">
          <p>{error || t("safetyGroup.loadFailed")}</p>
          <button className="mt-5 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground" onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      </GroupShell>
    );
  }

  if (!data.group) {
    return (
      <GroupShell onBack={() => router.back()}>
        <section className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary"><UsersRound /></span>
            <div>
              <h2 className="text-lg font-semibold">{t("safetyGroup.createTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("safetyGroup.createHint")}</p>
            </div>
          </div>

          {data.eligibleFriends.length > 0 ? (
            <div className="mt-6 space-y-2">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("safetyGroup.inviteFriends")}</p>
              {data.eligibleFriends.map((friend) => (
                <FriendChoice
                  key={friend.userId}
                  friend={friend}
                  selected={selectedFriends.includes(friend.userId)}
                  onToggle={() => setSelectedFriends((current) => current.includes(friend.userId)
                    ? current.filter((id) => id !== friend.userId)
                    : current.length < 7 ? [...current, friend.userId] : current)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-6 rounded-2xl bg-white/5 p-4 text-sm text-muted-foreground">{t("safetyGroup.noEligibleFriends")}</p>
          )}

          <button
            type="button"
            disabled={!data.canCreate || selectedFriends.length === 0 || working}
            onClick={createGroup}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 font-semibold text-primary-foreground disabled:opacity-40"
          >
            <UserPlus className="h-5 w-5" /> {working ? t("safetyGroup.creating") : t("safetyGroup.create")}
          </button>
          {!data.canCreate && <p className="mt-3 text-center text-xs text-muted-foreground">{t("safetyGroup.ticketRequired")}</p>}
        </section>
        <RetentionNote />
      </GroupShell>
    );
  }

  const group = data.group;
  if (group.currentMemberStatus === "pending") {
    return (
      <GroupShell onBack={() => router.back()}>
        <section className="mt-8 rounded-[30px] border border-primary/25 bg-primary/[0.08] p-6 text-center">
          <UserPlus className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">{t("safetyGroup.invitationTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("safetyGroup.invitationBody", { event: group.eventTitle })}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button disabled={working} onClick={() => void respond("declined")} className="rounded-full border border-white/15 px-4 py-3 font-semibold"><X className="mr-1 inline h-4 w-4" />{t("common.decline")}</button>
            <button disabled={working} onClick={() => void respond("accepted")} className="rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground"><Check className="mr-1 inline h-4 w-4" />{t("common.accept")}</button>
          </div>
        </section>
        <RetentionNote />
      </GroupShell>
    );
  }

  return (
    <GroupShell onBack={() => router.back()}>
      {connectionLost && (
        <p role="status" className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {t("safetyGroup.connectionLost")}
        </p>
      )}
      <section className="mt-3 border-b border-white/10 pb-5">
        <h2 className="text-xl font-semibold">{group.eventTitle}</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary" />{group.eventLocation}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4 text-primary" />{formatEventDate(group.startTime)} · {formatEventTime(group.startTime)}</p>
        <div className="mt-4 flex -space-x-2">
          {group.members.filter((member) => member.status === "accepted").map((member) => (
            member.avatarUrl ? <img key={member.userId} src={member.avatarUrl} alt={member.username} className="h-9 w-9 rounded-full border-2 border-black object-cover" />
              : <span key={member.userId} title={member.username} className="grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-[#182019] text-xs font-semibold">{member.username.slice(0, 1).toUpperCase()}</span>
          ))}
        </div>
      </section>

      <section className="mt-5">
        {group.currentUserNeedsHelp ? (
          <button disabled={working} onClick={resolveHelp} className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-5 py-4 font-semibold text-emerald-300">
            <Check className="h-5 w-5" /> {t("safetyGroup.iAmSafe")}
          </button>
        ) : (
          <HoldForHelp disabled={!group.canSendHelp || working} onComplete={sendHelp} />
        )}
        {!group.canSendHelp && <p className="mt-2 text-center text-xs text-muted-foreground">{t("safetyGroup.helpAfterValidation")}</p>}
      </section>

      <section className="mt-6 flex min-h-[42vh] flex-col rounded-[28px] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" />{t("safetyGroup.messages")}</div>
        <div className="flex-1 space-y-3 py-4">
          {group.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("safetyGroup.noMessages")}</p>}
          {group.messages.map((item) => {
            const mine = item.senderId === user?.properties.id;
            const alert = item.kind === "help";
            const resolved = item.kind === "help_resolved";
            return (
              <div key={item.id} className={`max-w-[88%] rounded-2xl px-4 py-3 ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-white/[0.08]"} ${alert ? "border border-red-400 bg-red-500/15 text-white" : ""} ${resolved ? "border border-emerald-400/30 bg-emerald-400/10 text-white" : ""}`}>
                <p className="text-[11px] font-semibold opacity-70">{item.senderUsername}</p>
                <p className="mt-1 text-sm leading-5">{item.content}</p>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex items-end gap-2 border-t border-white/10 pt-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
            }}
            maxLength={500}
            rows={1}
            placeholder={t("safetyGroup.messagePlaceholder")}
            className="min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-primary/60"
          />
          <button disabled={!message.trim() || working} onClick={sendMessage} aria-label={t("safetyGroup.send")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"><Send className="h-5 w-5" /></button>
        </div>
      </section>
      <RetentionNote />
    </GroupShell>
  );
}

function GroupShell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="min-h-screen bg-black pb-[calc(8rem+var(--native-safe-bottom))] text-foreground">
      <div className="app-page-gutter mx-auto max-w-2xl pt-[max(1rem,var(--native-safe-top))]">
        <header className="flex items-center gap-3 py-3">
          <button type="button" onClick={onBack} aria-label={t("common.back")} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5"><ArrowLeft /></button>
          <div><h1 className="text-xl font-semibold">{t("safetyGroup.title")}</h1><p className="text-xs text-muted-foreground">{t("safetyGroup.private")}</p></div>
        </header>
        {children}
      </div>
    </main>
  );
}

function FriendChoice({ friend, selected, onToggle }: { friend: SafetyFriend; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${selected ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/[0.025]"}`}>
      {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 font-semibold">{friend.username.slice(0, 1).toUpperCase()}</span>}
      <span className="flex-1 font-medium">{friend.username}</span>
      <span className={`grid h-6 w-6 place-items-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-white/20"}`}>{selected && <Check className="h-4 w-4" />}</span>
    </button>
  );
}

function HoldForHelp({ disabled, onComplete }: { disabled: boolean; onComplete: () => Promise<void> }) {
  const { t } = useTranslation();
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    timer.current = window.setTimeout(() => { timer.current = null; setHolding(false); void onComplete(); }, 1400);
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      className="relative flex w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full border border-red-400/50 bg-red-500/10 px-5 py-4 font-semibold text-red-300 disabled:opacity-40"
    >
      {holding && <span className="absolute inset-y-0 left-0 animate-[help-fill_1.4s_linear_forwards] bg-red-500/25" />}
      <ShieldAlert className="relative h-5 w-5" /><span className="relative">{holding ? t("safetyGroup.keepHolding") : t("safetyGroup.holdForHelp")}</span>
    </button>
  );
}

function RetentionNote() {
  const { t } = useTranslation();
  return <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">{t("safetyGroup.retention")}</p>;
}
