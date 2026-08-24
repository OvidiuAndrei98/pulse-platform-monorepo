"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Bookmark,
  Check,
  Share2,
  Ticket as TicketIcon,
  CheckCircle2,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ApiClient } from "@packages/api-client/src/Client";
import { EventSocialProof } from "@/components/EventSocialProof";
import { EventAttendees } from "@/components/social/EventAttendees";
import { EventLineup } from "@/features/events/lineup/EventLineup";
import { EventOrganizerProfile } from "@/components/EventOrganizerProfile";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import {
  calculateServiceFeeRon,
  formatRon,
} from "@/features/events/serviceFee";
import { formatEventDateTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { shareEvent } from "@/lib/native/share";
import { routeForPlatform } from "@/lib/native/navigation";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

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
  const pathname = usePathname();
  const router = useRouter();
  const suppressEventRestoreRef = useRef(false);

  const open = (event: Event) => setSelectedEvent(event);
  const close = () => setSelectedEvent(null);

  const openOrganizerProfile = (organizerId: string, returnTo: string) => {
    suppressEventRestoreRef.current = true;
    window.history.replaceState(window.history.state, "", returnTo);
    setSelectedEvent(null);
    const destination = routeForPlatform(
      `/users/${organizerId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
    router.push(destination);
  };

  useEffect(() => {
    if (suppressEventRestoreRef.current) return;
    // Mobile static routes use eventId for dashboard editing too. Only the
    // public discovery route may restore the Event Details sheet from it.
    if (pathname !== "/events") return;
    const eventId = new URLSearchParams(window.location.search).get("eventId");
    if (!eventId || selectedEvent?.id === eventId) return;

    let active = true;
    User.getPublicEventById(eventId)
      .then((event) => active && setSelectedEvent(event))
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [pathname, selectedEvent?.id]);

  useEffect(() => {
    if (pathname?.startsWith("/users/")) {
      suppressEventRestoreRef.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    // Dashboard event IDs identify editor records, never public event sheets.
    if (pathname?.startsWith("/dashboard")) {
      setSelectedEvent(null);
    }
  }, [pathname]);

  return (
    <EventDetailsContext.Provider value={{ open, close, selectedEvent }}>
      {children}
      <EventDetailsSheet
        event={selectedEvent}
        onClose={close}
        onOpenOrganizerProfile={openOrganizerProfile}
      />
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
  onOpenOrganizerProfile?: (organizerId: string, returnTo: string) => void;
}

export function EventDetailsSheet({
  event: activeEvent,
  onClose,
  onOpenOrganizerProfile,
}: EventDetailsSheetProps) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const router = useRouter();
  const [displayedEvent, setDisplayedEvent] = useState<Event | null>(
    activeEvent,
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const [guestEmail, setGuestEmail] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [shared, setShared] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const handleClose = (clearReturnEvent = true) => {
    if (isDesktop) setDisplayedEvent(null);
    onClose();

    const url = new URL(window.location.href);
    if (clearReturnEvent && url.searchParams.has("eventId")) {
      url.searchParams.delete("eventId");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  };

  useEffect(() => {
    if (activeEvent) {
      setDisplayedEvent(activeEvent);
      return;
    }

    if (isDesktop) {
      setDisplayedEvent(null);
      return;
    }

    const closeTimer = window.setTimeout(() => setDisplayedEvent(null), 350);
    return () => window.clearTimeout(closeTimer);
  }, [activeEvent, isDesktop]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktop(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (activeEvent) {
      setQty({});
      setGuestEmail(user?.properties.email ?? "");
      setIsCheckingOut(false);
      setCheckoutError("");
      setPurchased(false);
      setFavorited(Boolean(activeEvent.stats?.isFavorited));
      setShared(false);
    }
  }, [activeEvent?.id, user?.properties.email]);

  useEffect(() => {
    if (!displayedEvent) return;

    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [displayedEvent]);

  if (!displayedEvent) return null;

  const event = displayedEvent;

  const ticketTypes = event.ticketTypes ?? [];
  const isOwnEvent = user?.properties.id === event.organizerId;
  const isFinished = new Date(event.endTime).getTime() <= Date.now();
  const ticketSubtotal = ticketTypes.reduce(
    (sum, t) => sum + (qty[t.id] ?? 0) * (t.priceRon ?? 0),
    0,
  );
  const count = ticketTypes.reduce((sum, t) => sum + (qty[t.id] ?? 0), 0);
  const serviceFee = event.organizerAbsorbsServiceFee
    ? 0
    : calculateServiceFeeRon(ticketSubtotal, count);
  const total = ticketSubtotal + serviceFee;
  const checkoutLabel = isFinished
    ? t("eventSheet.viewOrganizerEvents")
    : isOwnEvent
      ? t("eventSheet.ownEvent")
      : purchased
        ? t("checkout.reserved")
        : count === 0
          ? t("eventSheet.selectTickets")
          : t("eventSheet.buy", { count, total: formatRon(total) });

  const setTierQty = (id: string, delta: number) =>
    setQty((q) => ({
      ...q,
      [id]: Math.max(0, Math.min(8, (q[id] ?? 0) + delta)),
    }));

  const handleShare = async () => {
    try {
      await shareEvent(event);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
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
    if (isFinished) return;
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
      const checkout = await ApiClient.instance.post(
        "/events/{id}/tickets/purchase",
        {
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
        },
      );
      window.location.assign(checkout.checkoutUrl);
    } catch {
      setCheckoutError(t("eventSheet.purchaseError"));
      setIsCheckingOut(false);
      setPurchased(false);
    }
  };

  const viewOrganizerEvents = () => {
    handleClose();
    const destination = routeForPlatform(`/users/${event.organizerId}`);
    router.push(destination);
  };

  const viewOrganizerProfile = () => {
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set("eventId", event.id);
    const returnTo = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;

    if (onOpenOrganizerProfile) {
      onOpenOrganizerProfile(event.organizerId, returnTo);
      return;
    }

    // Keep this event in the current history entry so browser Back restores it.
    window.history.replaceState(window.history.state, "", returnTo);
    handleClose(false);
    window.requestAnimationFrame(() => {
      const destination = routeForPlatform(
        `/users/${event.organizerId}?returnTo=${encodeURIComponent(returnTo)}`,
      );
      router.push(destination);
    });
  };

  const sheetContent = (
    <>
      <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-none touch-pan-y">
        {/* HEADER CU IMAGINE SI OVERLAY */}
        <div className="relative">
          <div className="relative h-64 w-full overflow-hidden bg-neutral-950 md:h-72">
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

            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent to-black/95" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/95 via-[#050505]/40 to-transparent" />
          </div>

          {/* BADGES (LIVE / DATA / COMPLET) */}
          <div className="absolute left-4 right-4 top-10 md:top-6 flex flex-wrap items-center gap-2 z-10">
            {isFinished ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur-md shadow-lg">
                {t("eventSheet.eventCompleted")}
              </span>
            ) : event.isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-400 backdrop-blur-md shadow-lg">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                {t("common.liveNow")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-md shadow-lg">
                <Calendar className="h-3.5 w-3.5 text-primary" />{" "}
                {formatEventDateTime(event.startTime)}
              </span>
            )}
          </div>

          {/* TITLU + CATEGORIE + ORGANIZATOR MINIMALIST SUB TITLU */}
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 z-10">
            <p className="text-xs font-semibold tracking-wider uppercase text-primary">
              {event.category}
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight md:text-3xl tracking-tight text-white drop-shadow-sm">
              {event.title}
            </h2>

            {/* ORGANIZATOR INTEGRAT DYNAMIC DIRECT SUB TITLU */}
            <div className="mt-2.5">
              <EventOrganizerProfile
                organizerId={event.organizerId}
                onOpen={viewOrganizerProfile}
              />
            </div>
          </div>
        </div>

        {/* CONTINUT PRINCIPAL */}
        <div className="space-y-6 px-5 pb-8 pt-5 md:px-6">
          <EventSocialProof eventId={event.id} />
          <EventAttendees eventId={event.id} />

          {/* DESPRE EVENIMENT (Formatat corect) */}
          <section>
            <h3 className="text-sm font-semibold text-foreground/90">
              {t("eventSheet.about")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
              {event.description || t("eventSheet.noDescription")}
            </p>
          </section>

          <EventOrganizerUpdates eventId={event.id} />

          {/* LINEUP */}
          <EventLineup artists={event.lineup} />

          {/* SECTIUNE BILETE */}
          {ticketTypes.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground/90">
                {t("eventSheet.tickets")}
              </h3>
              <div className="mt-3 space-y-2.5">
                {ticketTypes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors hover:bg-white/[0.05]"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-primary">
                        {t.priceRon} RON
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTierQty(t.id, -1)}
                        disabled={isFinished}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-bold transition hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-white">
                        {qty[t.id] ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTierQty(t.id, 1)}
                        disabled={isFinished}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/20 text-sm font-bold text-primary transition hover:bg-primary/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {isFinished ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("eventSheet.eventCompleted")}
                </p>
              ) : (
                <CheckoutPriceSummary
                  ticketSubtotal={ticketSubtotal}
                  ticketCount={count}
                  serviceFee={serviceFee}
                  total={total}
                  organizerAbsorbsServiceFee={event.organizerAbsorbsServiceFee}
                  t={t}
                />
              )}
            </section>
          )}

          {/* FORMULAR EMAIL CHECKOUT */}
          {!isFinished && (
            <section>
              <label
                className="block text-sm font-semibold text-foreground/90"
                htmlFor="checkout-email"
              >
                {t("eventSheet.emailForTickets")}
              </label>
              <input
                id="checkout-email"
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                placeholder={t("checkout.emailPlaceholder")}
                className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:bg-white/[0.07]"
              />
              {!user && (
                <GoogleSignInButton
                  returnTo={`/events/${event.id}?checkout=1`}
                  className="mt-3 h-10 text-xs rounded-xl"
                />
              )}
              {checkoutError && (
                <p className="mt-2 text-xs font-medium text-red-400">
                  {checkoutError}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* BOTTOM BAR / ACTIONS */}
      <div className="relative z-10 flex items-center gap-2.5 bg-linear-to-b from-black/10 via-black/70 to-black px-4 pt-3 pb-7">
        {user && (
          <button
            type="button"
            onClick={toggleFavorite}
            aria-label={
              favorited
                ? t("eventSheet.removeFavorite")
                : t("eventSheet.addFavorite")
            }
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all active:scale-95 ${
              favorited
                ? "border-primary/40 bg-primary/20 text-primary"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            }`}
          >
            <Bookmark
              className={`h-4 w-4 ${favorited ? "fill-current" : ""}`}
            />
          </button>
        )}
        <button
          type="button"
          onClick={handleShare}
          aria-label={shared ? t("checkout.copiedLink") : t("eventSheet.share")}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 transition-all active:scale-95 hover:bg-white/10"
        >
          {shared ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          disabled={!isFinished && (count === 0 || purchased || isOwnEvent)}
          onClick={isFinished ? viewOrganizerEvents : handleCheckout}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          <TicketIcon className="h-4 w-4" />
          {checkoutLabel}
        </button>
      </div>
    </>
  );
  if (!isDesktop) {
    return (
      <Drawer
        open={Boolean(activeEvent)}
        onOpenChange={(open) => !open && handleClose()}
        shouldScaleBackground={false}
        closeThreshold={0.35}
      >
        <DrawerContent className="h-[82svh] max-h-[46rem] overflow-hidden rounded-t-4xl border-none bg-[#050505] p-0 touch-none [&>div:first-child]:hidden">
          <DrawerTitle className="sr-only">{event.title}</DrawerTitle>

          {/* HANDLE OPTIMIZAT: Randat hardware direct (translate-z-0), fara efecte de blur care cauzeaza delay */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-8 items-center justify-center bg-gradient-to-b from-black/60 to-transparent transform-gpu translate-z-0">
            <div className="h-1.5 w-12 rounded-full bg-white/70 shadow-sm" />
          </div>

          {sheetContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <div
      onClick={() => handleClose()}
      className="fixed inset-0 z-[100] hidden items-center justify-center bg-black/70 backdrop-blur-sm md:flex cursor-pointer"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        className="relative z-10 flex h-[min(88vh,49rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#050505] text-foreground shadow-2xl backdrop-blur-xl cursor-default"
      >
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
    <div className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-xs">
      <div className="flex justify-between text-muted-foreground">
        <span>{t("checkout.tickets")}</span>
        <span>{formatRon(ticketSubtotal)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>
          {organizerAbsorbsServiceFee
            ? "Taxă de servicii suportată de organizator"
            : "Taxă de servicii (4% + 2,50 RON/bilet)"}
        </span>
        <span>
          {organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)}
        </span>
      </div>
      <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-foreground">
        <span>{t("checkout.total")}</span>
        <span className="text-primary">{formatRon(total)}</span>
      </div>
    </div>
  );
}
