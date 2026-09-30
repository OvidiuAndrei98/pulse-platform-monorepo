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
  const eventId = params.id === "mobile" ? searchParams.get("groupEventId") ?? "" : params.id;
  const [data, setData] = useState<SafetyEnvelope | null>(null);
  const [pending, setPending] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const messagesListRef = useRef<HTMLDivElement>(null);

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
    const list = messagesListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
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

  const acceptedMembers = group.members.filter((member) => member.status === "accepted");
  const visibleMembers = acceptedMembers.slice(0, 3);
  const hiddenMemberCount = acceptedMembers.length - visibleMembers.length;

  return (
    <GroupShell chat onBack={() => router.back()}>
      <div className="flex min-h-0 flex-1 flex-col">
        {connectionLost && (
          <p data-chat-keyboard-hide role="status" className="mb-2 shrink-0 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {t("safetyGroup.connectionLost")}
          </p>
        )}

        <section data-chat-keyboard-hide className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{group.eventTitle}</h2>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate">{group.eventLocation}</span>
              <span aria-hidden="true">·</span>
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="shrink-0">{formatEventDate(group.startTime)} · {formatEventTime(group.startTime)}</span>
            </p>
          </div>
          <div className="flex shrink-0 -space-x-2">
            {visibleMembers.map((member) => (
              member.avatarUrl ? <img key={member.userId} src={member.avatarUrl} alt={member.username} className="h-8 w-8 rounded-full border-2 border-black object-cover" />
                : <span key={member.userId} title={member.username} className="grid h-8 w-8 place-items-center rounded-full border-2 border-black bg-[#182019] text-[11px] font-semibold">{member.username.slice(0, 1).toUpperCase()}</span>
            ))}
            {hiddenMemberCount > 0 && <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-black bg-white/10 text-[10px] font-semibold">+{hiddenMemberCount}</span>}
          </div>
        </section>

        <section data-chat-keyboard-hide className="shrink-0 py-3">
          {group.currentUserNeedsHelp ? (
            <button disabled={working} onClick={resolveHelp} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-5 py-2.5 text-sm font-semibold text-emerald-300">
              <Check className="h-4 w-4" /> {t("safetyGroup.iAmSafe")}
            </button>
          ) : (
            <HoldForHelp disabled={!group.canSendHelp || working} onComplete={sendHelp} />
          )}
          {!group.canSendHelp && <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{t("safetyGroup.helpAfterValidation")}</p>}
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] px-3 pt-3">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-1 pb-2.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" />{t("safetyGroup.messages")}</div>
          <div ref={messagesListRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain py-3 pr-1 [scrollbar-gutter:stable]">
            <RetentionNote compact />
            {group.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("safetyGroup.noMessages")}</p>}
            {group.messages.map((item) => {
              const mine = item.senderId === user?.properties.id;
              const alert = item.kind === "help";
              const resolved = item.kind === "help_resolved";
              return (
                <div key={item.id} className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${mine ? "ml-auto bg-primary text-primary-foreground" : "bg-white/[0.08]"} ${alert ? "border border-red-400 bg-red-500/15 text-white" : ""} ${resolved ? "border border-emerald-400/30 bg-emerald-400/10 text-white" : ""}`}>
                  <p className="text-[11px] font-semibold opacity-70">{item.senderUsername}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5">{item.content}</p>
                </div>
              );
            })}
          </div>
          <div className="flex shrink-0 items-end gap-2 border-t border-white/10 bg-black/20 py-2.5">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
              }}
              maxLength={500}
              rows={1}
              placeholder={t("safetyGroup.messagePlaceholder")}
              className="min-h-11 max-h-24 flex-1 resize-none overflow-y-auto rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-primary/60"
            />
            <button disabled={!message.trim() || working} onClick={sendMessage} aria-label={t("safetyGroup.send")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"><Send className="h-5 w-5" /></button>
          </div>
        </section>
      </div>
    </GroupShell>
  );
}

function useChatViewport(enabled: boolean) {
  const [panel, setPanel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !panel) return;
    const viewport = window.visualViewport;
    const media = window.matchMedia("(max-width: 767px), (hover: none) and (pointer: coarse)");
    if (!viewport) return;

    const originalHeight = panel.style.getPropertyValue("height");
    const originalHeightPriority = panel.style.getPropertyPriority("height");
    let frame = 0;
    let adjusted = false;
    let baseViewportHeight = window.innerHeight;
    let baseWidth = window.innerWidth;
    let basePanelHeight = panel.offsetHeight;

    const restore = () => {
      if (originalHeight) panel.style.setProperty("height", originalHeight, originalHeightPriority);
      else panel.style.removeProperty("height");
      delete panel.dataset.keyboardOpen;
      delete document.documentElement.dataset.chatKeyboardOpen;
      adjusted = false;
    };
    const measure = () => {
      baseViewportHeight = window.innerHeight;
      baseWidth = window.innerWidth;
      basePanelHeight = panel.offsetHeight;
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!media.matches || Math.abs(viewport.scale - 1) > 0.01) {
          restore();
          return;
        }
        if (window.innerWidth !== baseWidth) {
          restore();
          measure();
        }
        const field = document.activeElement;
        const editing = field instanceof HTMLElement
          && panel.contains(field)
          && field.matches("input,textarea,select,[contenteditable=true]");
        const keyboardOpen = (editing || adjusted)
          && Math.max(baseViewportHeight, window.innerHeight) - viewport.height > 100;
        if (!keyboardOpen) {
          restore();
          measure();
          return;
        }

        const panelTop = panel.getBoundingClientRect().top;
        const visibleBottom = viewport.offsetTop + viewport.height;
        const height = Math.max(0, Math.min(basePanelHeight, visibleBottom - Math.max(viewport.offsetTop, panelTop)));
        panel.style.setProperty("height", `${height}px`, "important");
        panel.dataset.keyboardOpen = "true";
        document.documentElement.dataset.chatKeyboardOpen = "true";
        adjusted = true;
      });
    };

    measure();
    update();
    panel.addEventListener("focusin", update);
    panel.addEventListener("focusout", update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      panel.removeEventListener("focusin", update);
      panel.removeEventListener("focusout", update);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      restore();
    };
  }, [enabled, panel]);

  return setPanel;
}

function GroupShell({ children, onBack, chat = false }: { children: React.ReactNode; onBack: () => void; chat?: boolean }) {
  const { t } = useTranslation();
  const setChatViewport = useChatViewport(chat);
  return (
    <main ref={setChatViewport} data-chat-viewport={chat || undefined} className={`${chat ? "h-dvh overflow-hidden pb-24 data-[keyboard-open=true]:pb-2" : "min-h-screen pb-[calc(8rem+var(--native-safe-bottom))]"} bg-black text-foreground`}>
      <div className={`app-page-gutter mx-auto max-w-2xl pt-3 ${chat ? "flex h-full min-h-0 flex-col" : ""}`}>
        <header data-chat-keyboard-hide={chat || undefined} className="flex shrink-0 items-center gap-3 py-2.5">
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
  const completedByHold = useRef(false);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const beginHold = () => {
    if (disabled || timer.current !== null) return;
    completedByHold.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      completedByHold.current = true;
      setHolding(false);
      void onComplete();
    }, 1400);
  };
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginHold();
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
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) beginHold();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          stop();
        }
      }}
      onBlur={stop}
      onClick={(event) => {
        // Virtual screen-reader activation has no pointer hold gesture.
        if (disabled) return;
        if (event.detail !== 0) {
          completedByHold.current = false;
          return;
        }
        if (completedByHold.current) {
          completedByHold.current = false;
          return;
        }
        stop();
        void onComplete();
      }}
      aria-label={holding ? t("safetyGroup.keepHolding") : t("safetyGroup.holdForHelp")}
      className="relative flex min-h-11 w-full touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full border border-red-400/50 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-40"
    >
      {holding && <span className="absolute inset-y-0 left-0 animate-[help-fill_1.4s_linear_forwards] bg-red-500/25" />}
      <ShieldAlert className="relative h-5 w-5" /><span className="relative">{holding ? t("safetyGroup.keepHolding") : t("safetyGroup.holdForHelp")}</span>
    </button>
  );
}

function RetentionNote({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return <p className={`${compact ? "mb-3 rounded-xl bg-white/[0.035] px-3 py-2 text-[10px] leading-4" : "mt-5 text-xs leading-5"} text-center text-muted-foreground`}>{t("safetyGroup.retention")}</p>;
}
