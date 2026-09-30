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
} from "lucide-react";
import Image from "next/image";
import { useNavigationState } from "@/lib/navigation/useNavigationState";
import { RequestError, RequestProgress } from "@/components/ui/RequestFeedback";
import { externalHistoryState, isClientRoute, LAYER } from "@/lib/navigation/state";
import { dismissEventHistory } from "@/lib/navigation/dismissEventHistory";
import { usePathname, useRouter } from "next/navigation";
import { Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventSocialProof } from "@/components/EventSocialProof";
import { EventAttendees } from "@/components/social/EventAttendees";
import { EventLineup } from "@/features/events/lineup/EventLineup";
import { EventOrganizerProfile } from "@/components/EventOrganizerProfile";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import {
  calculateServiceFeeRon,
  formatRon,
} from "@/features/events/serviceFee";
import { formatEventDateTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { shareEvent } from "@/lib/native/share";
import { routeForPlatform } from "@/lib/native/navigation";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useDrawerViewport } from "@/components/ui/useDrawerViewport";
import { toast } from "sonner";
import { TicketTypeSelector } from "@/features/checkout/TicketTypeSelector";
import { TicketCheckoutDrawer } from "@/features/checkout/TicketCheckoutDrawer";

interface EventDetailsContextType {
  open: (event: Event) => void;
  close: () => void;
  selectedEvent: Event | null;
}

const EventDetailsContext = createContext<EventDetailsContextType | undefined>(
  undefined,
);

export function EventDetailsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const knownEvents = useRef(new Map<string, Event>());
  const closingEvent = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const open = (event: Event) => {
    closingEvent.current = null;
    knownEvents.current.set(event.id, event);
    const url = new URL(window.location.href);
    if (url.searchParams.get("eventId") === event.id) { setSelectedEvent(event); return; }
    url.searchParams.set("eventId", event.id);
    window.history.pushState(externalHistoryState({ __spottrEvent: true, [LAYER]: undefined }), "", url);
    setSelectedEvent(event);
  };
  const close = () => {
    const eventId = new URLSearchParams(window.location.search).get("eventId");
    if (eventId && closingEvent.current === eventId) return;
    closingEvent.current = eventId;
    setLoadState("idle");
    setSelectedEvent(null);
    dismissEventHistory();
  };
  const openOrganizerProfile = (organizerId: string, returnTo: string) => {
    setSelectedEvent(null);
    router.push(routeForPlatform('/users/' + organizerId + '?returnTo=' + encodeURIComponent(returnTo)));
  };
  useEffect(() => {
    let request = 0;
    const restore = () => {
      const current = ++request;
      const eventId = isClientRoute(window.location.pathname)
        && !window.location.pathname.startsWith("/auth")
        && window.location.pathname !== "/events/mobile/group"
        ? new URLSearchParams(window.location.search).get("eventId") : null;
      if (eventId && closingEvent.current === eventId) return;
      closingEvent.current = null;
      if (!eventId) { setSelectedEvent(null); setLoadState("idle"); return; }
      const cached = knownEvents.current.get(eventId);
      if (cached) { setSelectedEvent(cached); setLoadState("idle"); return; }
      setSelectedEvent(null);
      setLoadState("loading");
      User.getPublicEventById(eventId).then((event) => {
        if (current === request) {
          knownEvents.current.set(eventId, event);
          setSelectedEvent(event);
          setLoadState("idle");
        }
      }).catch(() => { if (current === request) { setSelectedEvent(null); setLoadState("error"); } });
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("spottr:navigation", restore);
    return () => { request++; window.removeEventListener("popstate", restore); window.removeEventListener("spottr:navigation", restore); };
  }, [pathname, attempt]);

  return (
    <EventDetailsContext.Provider value={{ open, close, selectedEvent }}>
      {children}
      <Drawer open={loadState !== "idle"} historyBack={false} onOpenChange={(open) => { if (!open) close(); }}>
        <DrawerContent className="bg-[#101010] px-5 pb-10">
          <DrawerTitle className="py-4">{t("search.events")}</DrawerTitle>
          {loadState === "loading" ? <RequestProgress className="py-10" /> : <RequestError onRetry={() => setAttempt((value) => value + 1)} />}
          <button type="button" onClick={close} className="mt-4 min-h-11 text-sm text-white/60">{t("common.close")}</button>
        </DrawerContent>
      </Drawer>
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
    throw new Error("EVENT_DETAILS_PROVIDER_MISSING");
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
  const [qty, setQty] = useNavigationState<Record<string, number>>("event-selection:" + (user?.properties.id ?? "guest") + ":" + (displayedEvent?.id ?? "none"), {});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutVisited, setCheckoutVisited] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const [favorited, setFavorited] = useState(false);
  const favoriteLock = useRef(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [shared, setShared] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const desktopViewportRef = useDrawerViewport(isDesktop && Boolean(displayedEvent), "panel");
  const activeEventRef = useRef(activeEvent);
  activeEventRef.current = activeEvent;

  const handleClose = (_clearReturnEvent = true) => {
    if (checkoutBusy) return;
    if (isDesktop) { setCheckoutOpen(false); setDisplayedEvent(null); }
    onClose();


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

    // On mobile, preserve the rendered event until Vaul finishes its exit.
    // Vaul's onAnimationEnd only runs for changes requested inside the drawer,
    // not when navigation sets the controlled open prop to false. Wait for the
    // actual surface animation so those exits also release the body scroll lock.
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      const animations = mobileSheetRef.current?.getAnimations() ?? [];
      void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (cancelled || activeEventRef.current) return;
        setDisplayedEvent(null);
        setCheckoutOpen(false);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
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
      setCheckoutOpen(false);
      setCheckoutVisited(false);
      setFavorited(Boolean(activeEvent.stats?.isFavorited));
      setShared(false);
    }
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!displayedEvent) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [displayedEvent, checkoutBusy]);


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
      : count === 0
        ? t("eventSheet.selectTickets")
        : t("eventSheet.continue", { count, total: formatRon(total) });

  const handleShare = async () => {
    try {
      await shareEvent(event);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
      toast.error(t("feedback.shareFailed"));
    }
  };

  const toggleFavorite = async () => {
    if (!user || favoriteLock.current) return;
    favoriteLock.current = true;
    setSavingFavorite(true);
    const nextFavorite = !favorited;
    setFavorited(nextFavorite);
    try {
      await user.setEventFavorite(event.id, nextFavorite);
    } catch {
      setFavorited(!nextFavorite);
      toast.error(t("feedback.actionFailed"));
    } finally {
      favoriteLock.current = false;
      setSavingFavorite(false);
    }
  };

  const openCheckout = () => {
    if (isFinished) return;
    if (isOwnEvent) {
      toast.error(t("eventSheet.ownEvent"));
      return;
    }
    if (count === 0) return;
    setCheckoutVisited(true);
    setCheckoutOpen(true);
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
      <div data-nav-scroll={"event-sheet:" + event.id} className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-none touch-pan-y">
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
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
                <TicketTypeSelector
                  tickets={ticketTypes}
                  quantities={qty}
                  onChange={setQty}
                  disabled={isFinished || isOwnEvent}
                />
              </div>

              {isFinished && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("eventSheet.eventCompleted")}
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
            disabled={savingFavorite}
            aria-busy={savingFavorite}
            aria-label={
              favorited
                ? t("eventSheet.removeFavorite")
                : t("eventSheet.addFavorite")
            }
            className={`isolate grid h-11 w-11 shrink-0 transform-gpu appearance-none place-items-center overflow-hidden rounded-full border transition-all [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95 ${
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
          className="isolate grid h-11 w-11 shrink-0 transform-gpu appearance-none place-items-center overflow-hidden rounded-full border border-white/10 bg-white/5 transition-all [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95 hover:bg-white/10"
        >
          {shared ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          disabled={
            !isFinished &&
            (count === 0 || isOwnEvent)
          }
          onClick={isFinished ? viewOrganizerEvents : openCheckout}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          <TicketIcon className="h-4 w-4" />
          {checkoutLabel}
        </button>
      </div>
    </>
  );
  const checkoutDrawer = (
    <TicketCheckoutDrawer
      key={event.id}
      event={event}
      quantities={qty}
      onQuantitiesChange={setQty}
      open={checkoutOpen}
      historyBack={Boolean(activeEvent)}
      onBusyChange={setCheckoutBusy}
      onClose={() => setCheckoutOpen(false)}
    />
  );
  if (!isDesktop) {
    return (
      <>
        <Drawer
          historyBack={false}
          open={Boolean(activeEvent)}
          onOpenChange={(open) => !open && !checkoutOpen && handleClose()}
          onAnimationEnd={(open) => {
            if (!open && !activeEventRef.current) {
              setDisplayedEvent(null);
              setCheckoutOpen(false);
            }
          }}
          modal={!checkoutOpen}
          dismissible={!checkoutBusy && !checkoutOpen}
          repositionInputs={false}
          shouldScaleBackground={false}
          closeThreshold={0.35}
          fixed
        >
          {/* Switching modal mode remounts Vaul's content. Keep the already-open
              sheet still beneath checkout and when returning from it. */}
          <DrawerContent
            ref={mobileSheetRef}
            showHandle={false}
            sideInset
            lockDocument={false}
            inert={checkoutOpen}
            style={{ animation: activeEvent && checkoutVisited ? "none" : undefined }}
            className="h-[90svh] max-h-none rounded-t-4xl border-none bg-black p-0 touch-none"
          >
            <DrawerTitle className="sr-only">{event.title}</DrawerTitle>

            {/* Fade out before the overlay ends, so its lower edge stays invisible. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-8 transform-gpu will-change-transform items-center justify-center [backface-visibility:hidden]">
              <div
                className="absolute inset-x-0 top-0 h-16"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.46) 15%, rgba(0,0,0,0.24) 35%, rgba(0,0,0,0.08) 60%, rgba(0,0,0,0.015) 80%, rgba(0,0,0,0) 92%, rgba(0,0,0,0) 100%)" }}
              />
              <div className="relative h-1.5 w-12 rounded-full bg-white/70 shadow-sm" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {sheetContent}
            </div>
          </DrawerContent>
        </Drawer>
        {checkoutDrawer}
      </>
    );
  }

  return (
    <>
      <div
        ref={desktopViewportRef}
        onClick={() => handleClose()}
        className="fixed inset-0 z-[100] hidden items-center justify-center bg-black/70 backdrop-blur-sm md:flex cursor-pointer"
      >
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
          className="relative z-10 flex h-[min(88vh,49rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black text-foreground shadow-2xl backdrop-blur-xl cursor-default"
        >
          {sheetContent}
        </motion.div>
      </div>
      {checkoutDrawer}
    </>
  );
}
