"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Calendar,
  Heart,
  MessageCircle,
  Sparkles,
  Ticket,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User, type AppNotification } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { formatEventDateShort } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

export function NotificationsPopover() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const { notifications, notificationsLoading, unreadCount, markRead } =
    User.useNotifications(user);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [open]);

  const openNotification = (notification: AppNotification) => {
    if (!notification.isRead) markRead(notification.id);
    setOpen(false);
    if (notification.eventId) {
      router.push(`/events/${notification.eventId}`);
    } else if (notification.actorId) {
      router.push(`/users/${notification.actorId}`);
    }
  };

  return (
    <div ref={wrapperRef} className="inline-flex items-center justify-center">
      <AnimatePresence mode="popLayout">
        {!open && (
          <motion.button
            key="bell"
            layoutId="notif-morph"
            type="button"
            aria-label={t("notifications.title")}
            onClick={() => setOpen(true)}
            className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-foreground transform-gpu"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <motion.span
              layoutId="notif-morph-inner"
              className="relative grid place-items-center"
            >
              <Bell className="h-4 w-4" strokeWidth={2.2} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            layoutId="notif-morph"
            className="absolute right-0 top-0 z-[100] w-[min(20rem,calc(100vw-2.5rem))] origin-top-right overflow-hidden rounded-[26px] border border-white/20 bg-[#141614]/95 md:bg-[#141614]/85 text-foreground md:backdrop-blur-xl transform-gpu"
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          >
            {/* Sheen effect */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent"
            />

            <div className="relative flex items-center justify-between px-5 pt-4">
              <motion.div
                layoutId="notif-morph-inner"
                className="flex items-center gap-2"
              >
                <Bell className="h-4 w-4 text-primary" strokeWidth={2.2} />
                <span className="text-sm font-semibold">
                  {t("notifications.title")}
                </span>
              </motion.div>
              <button
                type="button"
                aria-label={t("notifications.close")}
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 transition-transform active:scale-95"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <motion.ul
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{
                hidden: {},
                show: {
                  transition: { staggerChildren: 0.04, delayChildren: 0.12 },
                },
              }}
              className="relative mt-3 max-h-[60vh] space-y-1 overflow-y-auto px-2 pb-3"
            >
              {notificationsLoading ? (
                <li className="space-y-2 px-3 py-3">
                  <div className="h-10 animate-pulse rounded-2xl bg-white/5" />
                  <div className="h-10 animate-pulse rounded-2xl bg-white/5" />
                </li>
              ) : notifications.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {t("notifications.empty")}
                </li>
              ) : (
                notifications.map((notification) => (
                  <motion.li
                    key={notification.id}
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    onClick={() => openNotification(notification)}
                    className={`flex cursor-pointer gap-3 rounded-2xl px-3 py-3 transition-colors duration-150 transform-gpu hover:bg-white/5 ${notification.isRead ? "" : "bg-primary/[0.05]"}`}
                  >
                    <NotificationIcon notification={notification} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {notificationText(notification, t).title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelativeTime(notification.createdAt, t)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notificationText(notification, t).body}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </motion.li>
                ))
              )}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationIcon({ notification }: { notification: AppNotification }) {
  if (notification.actorAvatarUrl) {
    return (
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10">
        <img
          src={notification.actorAvatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  const Icon =
    notification.type === "ticket_purchased"
      ? Ticket
      : notification.type === "organizer_event"
        ? Calendar
        : notification.type === "friend_request"
          ? UserPlus
          : notification.type === "friend_accepted"
            ? UsersRound
            : notification.type === "saved_event"
              ? Heart
              : notification.type === "message"
                ? MessageCircle
                : Sparkles;
  return (
    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
  );
}

function notificationText(
  notification: AppNotification,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (notification.type === "organizer_event") {
    return {
      title: t("notifications.organizerEventTitle"),
      body: t("notifications.organizerEventBody", {
        name: notification.actorUsername || "Glow",
      }),
    };
  }
  if (notification.type === "ticket_purchased") {
    return {
      title: t("notifications.ticketPurchasedTitle"),
      body: t("notifications.ticketPurchasedBody"),
    };
  }
  return { title: notification.title, body: notification.body };
}

function formatRelativeTime(
  value: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return t("notifications.now");
  if (minutes < 60) return t("notifications.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hours", { count: hours });
  return formatEventDateShort(value);
}
