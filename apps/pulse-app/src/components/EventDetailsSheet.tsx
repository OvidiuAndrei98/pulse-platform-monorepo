"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import { Calendar, Bookmark, Check, Share2, Ticket as TicketIcon } from "lucide-react";
import Image from "next/image";
import { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ApiClient } from "@packages/api-client/src/Client";
import { EventSocialProof } from "@/components/EventSocialProof";
import { EventAttendees } from "@/components/social/EventAttendees";
import { EventLineup } from "@/features/events/lineup/EventLineup";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { calculateServiceFeeRon, formatRon } from "@/features/events/serviceFee";
import { formatEventDateTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";

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
      <AnimatePresence>
        {selectedEvent && (
          <EventDetailsSheet event={selectedEvent} onClose={close} />
        )}
      </AnimatePresence>
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
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [guestEmail, setGuestEmail] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [shared, setShared] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mobileOffset, setMobileOffset] = useState(0);
  const [isPullingSheet, setIsPullingSheet] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const mobileOffsetRef = useRef(0);

  const setSheetOffset = (nextOffset: number) => {
    mobileOffsetRef.current = nextOffset;
    setMobileOffset(nextOffset);
  };

  const handleTouchStart = (touchEvent: ReactTouchEvent<HTMLDivElement>) => {
    touchStartY.current = touchEvent.touches[0]?.clientY ?? null;
    setIsPullingSheet(false);
  };

  const handleTouchMove = (touchEvent: ReactTouchEvent<HTMLDivElement>) => {
    const startY = touchStartY.current;
    const currentY = touchEvent.touches[0]?.clientY;
    if (startY === null || currentY === undefined) return;

    const distance = currentY - startY;
    if (distance <= 0 || (contentRef.current?.scrollTop ?? 0) > 0) return;

    touchEvent.preventDefault();
    setIsPullingSheet(true);
    setSheetOffset(distance * 0.82);
  };

  const handleTouchEnd = () => {
    const shouldDismiss = mobileOffsetRef.current > 150;
    touchStartY.current = null;
    setIsPullingSheet(false);

    if (shouldDismiss) {
      setSheetOffset(window.innerHeight);
      window.setTimeout(onClose, 220);
      return;
    }

    setSheetOffset(0);
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    setSheetOffset(0);
  }, [event?.id]);

  // Resetăm biletele selectate de fiecare dată când se deschide un alt eveniment
  useEffect(() => {
    if (event) {
      setQty({});
      setGuestEmail(user?.properties.email ?? "");
      setIsCheckingOut(false);
      setCheckoutError("");
      setPurchased(false);
      setFavorited(Boolean(event.stats?.isFavorited));
      setShared(false);
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
  const isOwnEvent = user?.properties.id === event.organizerId;
  const ticketSubtotal = ticketTypes.reduce(
    (sum, t) => sum + (qty[t.id] ?? 0) * (t.priceRon ?? 0),
    0,
  );
  const count = ticketTypes.reduce((sum, t) => sum + (qty[t.id] ?? 0), 0);
  const serviceFee = event.organizerAbsorbsServiceFee
    ? 0
    : calculateServiceFeeRon(ticketSubtotal, count);
  const total = ticketSubtotal + serviceFee;

  const setTierQty = (id: string, delta: number) =>
    setQty((q) => ({
      ...q,
      [id]: Math.max(0, Math.min(8, (q[id] ?? 0) + delta)),
    }));

  const handleShare = async () => {
    const url = new URL(`/events/${event.id}`, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: event.description, url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 1800);
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    }
  };

  const toggleFavorite = async () => {
    if (!user) return;
    const nextFavorite = !favorited;
    setFavorited(nextFavorite);
    try {
      await user.setEventFavorite(event.id, nextFavorite);
    } catch {
      setFavorited(!nextFavorite);
    }
  };

  const handleCheckout = async () => {
    if (isOwnEvent) {
      setCheckoutError(t("eventSheet.ownEvent"));
      return;
    }
    if (count === 0 || isCheckingOut) return;

    const email = guestEmail.trim();
    if (!email) {
      setCheckoutError(t("eventSheet.emailRequired"));
      return;
    }

    setCheckoutError("");
    setIsCheckingOut(true);
    setPurchased(true);
    try {
      const checkout = await ApiClient.instance.post("/events/{id}/tickets/purchase", {
        params: { path: { id: event.id } },
        body: {
          email,
          items: ticketTypes
            .filter((ticket) => (qty[ticket.id] ?? 0) > 0)
            .map((ticket) => ({
              ticketTypeId: ticket.id,
              quantity: qty[ticket.id] ?? 0,
            })),
        },
      });
      window.location.assign(checkout.checkoutUrl);
    } catch {
      setCheckoutError(t("eventSheet.purchaseError"));
      setIsCheckingOut(false);
      setPurchased(false);
    }
  };

  const sheetContent = (
    <>
      <div ref={contentRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
              <div className="relative">
                <div className="relative h-48 w-full bg-muted md:h-72">
                  {event.bannerUrl && (
                    <Image
                      src={event.bannerUrl}
                      alt={event.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 672px"
                      priority
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/55 to-transparent" />

                <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-2">
                  {event.isLive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-400 backdrop-blur">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                      {t("common.liveNow")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-background/50 px-2.5 py-1 text-[11px] text-foreground backdrop-blur">
                      <Calendar className="h-3 w-3" />{" "}
                      {formatEventDateTime(event.startTime)}
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
                <EventSocialProof eventId={event.id} />
                <EventAttendees eventId={event.id} />

                <section>
                  <h3 className="text-sm font-semibold">{t("eventSheet.about")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {event.description || "Nicio descriere disponibilă."}
                  </p>
                </section>

                <EventLineup artists={event.lineup} />

                {ticketTypes.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold">{t("eventSheet.tickets")}</h3>
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
                    <CheckoutPriceSummary
                      ticketSubtotal={ticketSubtotal}
                      ticketCount={count}
                      serviceFee={serviceFee}
                      total={total}
                      organizerAbsorbsServiceFee={event.organizerAbsorbsServiceFee}
                      t={t}
                    />
                  </section>
                )}

                <section>
                  <label className="block text-sm font-semibold" htmlFor="checkout-email">
                    {t("eventSheet.emailForTickets")}
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    value={guestEmail}
                    onChange={(event) => setGuestEmail(event.target.value)}
                    placeholder={t("checkout.emailPlaceholder")}
                    className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60"
                  />
                  {!user && (
                    <GoogleSignInButton
                      returnTo={`/events/${event.id}?checkout=1`}
                      className="mt-3 h-10 text-xs"
                    />
                  )}
                  {checkoutError && <p className="mt-2 text-xs text-red-400">{checkoutError}</p>}
                </section>
              </div>
      </div>

      <div className="relative z-10 flex items-center gap-2 border-t border-white/10 bg-background/90 px-4 py-3 backdrop-blur md:bg-background/60">
              {user && (
                <button
                  type="button"
                  onClick={toggleFavorite}
                  aria-label={favorited ? t("eventSheet.removeFavorite") : t("eventSheet.addFavorite")}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg border transition ${favorited ? "border-primary/40 bg-primary/15 text-primary" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
                >
                  <Bookmark className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
                </button>
              )}
              <button
                type="button"
                onClick={handleShare}
                  aria-label={shared ? t("checkout.copiedLink") : t("eventSheet.share")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 transition hover:bg-white/10"
              >
                {shared ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={count === 0 || purchased || isOwnEvent}
                onClick={handleCheckout}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                <TicketIcon className="h-4 w-4" />
                {isOwnEvent
                  ? t("eventSheet.ownEvent")
                  : purchased
                  ? "Rezervat ✓"
                  : count === 0
                    ? "Selectează bilete"
                    : `Cumpără ${count} · ${formatRon(total)}`}
              </button>
      </div>
    </>
  );

  if (!isDesktop) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center md:hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75"
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          className="relative h-[78svh] max-h-[42rem] w-full max-w-md"
        >
          <div
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="relative flex h-full w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-950 shadow-2xl"
            style={{
              transform: `translateY(${mobileOffset}px)`,
              transition: isPullingSheet
                ? "none"
                : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
            }}
          >
            <div className="absolute left-0 right-0 top-0 z-20 flex h-10 cursor-grab items-center justify-center active:cursor-grabbing">
              <div className="h-1.5 w-12 rounded-full bg-white/20" />
            </div>
            {sheetContent}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] hidden items-center justify-center md:flex">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 260 }} onClick={(clickEvent) => clickEvent.stopPropagation()} className="relative z-10 flex h-[min(88vh,48rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-background/80 text-foreground shadow-2xl backdrop-blur-xl backdrop-saturate-150">
        {sheetContent}
      </motion.div>
    </div>
  );
}

function CheckoutPriceSummary({
  ticketSubtotal,
  ticketCount,
  serviceFee,
  total,
  organizerAbsorbsServiceFee,
  t,
}: {
  ticketSubtotal: number;
  ticketCount: number;
  serviceFee: number;
  total: number;
  organizerAbsorbsServiceFee: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (ticketCount === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {organizerAbsorbsServiceFee
          ? "Preț final, fără taxe adăugate la checkout."
          : "Taxa de servicii se calculează înainte de plată."}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-white/10 bg-black/15 px-3 py-2.5 text-xs">
      <div className="flex justify-between text-muted-foreground"><span>{t("checkout.tickets")}</span><span>{formatRon(ticketSubtotal)}</span></div>
      <div className="flex justify-between text-muted-foreground"><span>{organizerAbsorbsServiceFee ? "Taxă de servicii suportată de organizator" : "Taxă de servicii (4% + 2,50 RON/bilet)"}</span><span>{organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)}</span></div>
      <div className="flex justify-between border-t border-white/10 pt-1.5 text-sm font-semibold"><span>{t("checkout.total")}</span><span>{formatRon(total)}</span></div>
    </div>
  );
}
