"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  X,
  Calendar,
  Share2,
  Ticket as TicketIcon,
  MapPin,
  Clock,
} from "lucide-react";
import Image from "next/image";
import { Event } from "@/core/DataProvider";

interface EventDetailsContextType {
  open: (event: Event) => void;
  close: () => void;
  selectedEvent: Event | null;
}

const EventDetailsContext = createContext<EventDetailsContextType | undefined>(
  undefined,
);

export function EventDetailsProvider({ children }: { children: ReactNode }) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const open = (event: Event) => setSelectedEvent(event);
  const close = () => setSelectedEvent(null);

  return (
    <EventDetailsContext.Provider value={{ open, close, selectedEvent }}>
      {children}
      <EventDetailsSheet event={selectedEvent} onClose={close} />
    </EventDetailsContext.Provider>
  );
}

export function useEventDetails() {
  const context = useContext(EventDetailsContext);
  if (!context) {
    throw new Error(
      "useEventDetails must be used within an EventDetailsProvider",
    );
  }
  return context;
}

export interface EventDetailsSheetProps {
  event: Event | null;
  onClose: () => void;
}

export function EventDetailsSheet({ event, onClose }: EventDetailsSheetProps) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [purchased, setPurchased] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Resetăm biletele selectate de fiecare dată când se deschide un alt eveniment
  useEffect(() => {
    if (event) {
      setQty({});
      setPurchased(false);
    }
  }, [event?.id]);

  // Lock body scroll și închidere pe tastă Escape
  useEffect(() => {
    if (!event) return;

    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [event, onClose]);

  if (!event) return null;

  const ticketTypes = event.ticketTypes ?? [];
  const total = ticketTypes.reduce(
    (sum, t) => sum + (qty[t.id] ?? 0) * (t.priceRon ?? 0),
    0,
  );
  const count = ticketTypes.reduce((sum, t) => sum + (qty[t.id] ?? 0), 0);

  const setTierQty = (id: string, delta: number) =>
    setQty((q) => ({
      ...q,
      [id]: Math.max(0, Math.min(8, (q[id] ?? 0) + delta)),
    }));

  return (
    <AnimatePresence>
      {event && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center">
          {/* Overlay Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/15 bg-background/80 text-foreground shadow-2xl md:max-h-[88vh] md:max-w-2xl md:rounded-xl"
            style={{ backdropFilter: "blur(24px) saturate(160%)" }}
          >
            {/* Mobile Drag Handle */}
            <div
              onPointerDown={(e) =>
                dragControls.start(e, { snapToCursor: false })
              }
              className="relative z-20 flex cursor-grab touch-none justify-center py-2 active:cursor-grabbing md:hidden"
            >
              <span className="h-1.5 w-10 rounded-full bg-white/25" />
            </div>

            {/* Scroll Content */}
            <div
              ref={scrollRef}
              className="relative z-10 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="relative">
                <div className="relative h-56 w-full bg-muted md:h-72">
                  {event.bannerUrl && (
                    <Image
                      src={event.bannerUrl}
                      alt={event.title}
                      fill
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />

                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-background/50 backdrop-blur transition hover:bg-background/80"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-2 pr-12">
                  {event.isLive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-400 backdrop-blur">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                      Live Now
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-background/50 px-2.5 py-1 text-[11px] text-foreground backdrop-blur">
                      <Calendar className="h-3 w-3" />{" "}
                      {event.startTime ||
                        (event.startTime &&
                          new Date(event.startTime).toLocaleTimeString())}
                    </span>
                  )}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-xs font-medium text-primary">
                    {event.category}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold leading-tight md:text-3xl">
                    {event.title}
                  </h2>
                </div>
              </div>

              <div className="space-y-6 px-5 pb-6 pt-5 md:px-6">
                <section>
                  <h3 className="text-sm font-semibold">Despre eveniment</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {event.description || "Nicio descriere disponibilă."}
                  </p>
                </section>

                {ticketTypes.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold">Bilete</h3>
                    <div className="mt-3 space-y-2">
                      {ticketTypes.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{t.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.priceRon} RON
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTierQty(t.id, -1)}
                              className="h-8 w-8 rounded-md border border-white/15 bg-white/5 font-bold transition hover:bg-white/10"
                            >
                              -
                            </button>
                            <span className="w-5 text-center text-sm font-medium">
                              {qty[t.id] ?? 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => setTierQty(t.id, 1)}
                              className="h-8 w-8 rounded-md border border-primary/40 bg-primary/15 font-bold text-primary transition hover:bg-primary/25"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="relative z-10 flex items-center gap-2 border-t border-white/10 bg-background/60 px-4 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copiat!");
                }}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 transition hover:bg-white/10"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={count === 0 || purchased}
                onClick={() => {
                  setPurchased(true);
                  setTimeout(() => {
                    setPurchased(false);
                    onClose();
                  }, 1400);
                }}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                <TicketIcon className="h-4 w-4" />
                {purchased
                  ? "Rezervat ✓"
                  : count === 0
                    ? "Selectează bilete"
                    : `Cumpără ${count} · ${total} RON`}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
