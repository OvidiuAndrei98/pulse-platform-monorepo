"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  X,
  Calendar,
  Heart,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Notif = {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  time: string;
};

const notifs: Notif[] = [
  {
    id: "1",
    icon: <Sparkles className="h-4 w-4 text-primary" />,
    title: "Neon Warehouse is live",
    body: "The rave just started at Docks 7. Tap to join.",
    time: "2m",
  },
  {
    id: "2",
    icon: <Calendar className="h-4 w-4 text-primary" />,
    title: "Event reminder",
    body: "Summer Fest starts in 3 hours at Central Park.",
    time: "1h",
  },
  {
    id: "3",
    icon: <Heart className="h-4 w-4 text-primary" />,
    title: "Alex liked your event",
    body: "Retro Disco Night got a new fan.",
    time: "3h",
  },
  {
    id: "4",
    icon: <MessageCircle className="h-4 w-4 text-primary" />,
    title: "New message",
    body: 'Mia: "Are you going tonight?"',
    time: "5h",
  },
];

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
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

  return (
    <div ref={wrapperRef} className="inline-flex items-center justify-center">
      <AnimatePresence mode="popLayout">
        {!open && (
          <motion.button
            key="bell"
            layoutId="notif-morph"
            type="button"
            aria-label="Notifications"
            onClick={() => setOpen(true)}
            className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] text-foreground transform-gpu"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <motion.span
              layoutId="notif-morph-inner"
              className="relative grid place-items-center"
            >
              <Bell className="h-4 w-4" strokeWidth={2.2} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            layoutId="notif-morph"
            className="absolute right-0 top-0 z-[100] w-[min(20rem,calc(100vw-2.5rem))] origin-top-right overflow-hidden rounded-3xl border border-white/20 bg-[#141614]/95 md:bg-[#141614]/85 text-foreground md:backdrop-blur-xl transform-gpu"
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
          >
            {/* Sheen efect */}
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
                <span className="text-sm font-semibold">Notifications</span>
              </motion.div>
              <button
                type="button"
                aria-label="Close notifications"
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
              {notifs.map((n) => (
                <motion.li
                  key={n.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0 },
                  }}
                  className="flex gap-3 rounded-2xl px-3 py-3 hover:bg-white/5 transition-colors duration-150 transform-gpu"
                >
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10">
                    {n.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {n.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
