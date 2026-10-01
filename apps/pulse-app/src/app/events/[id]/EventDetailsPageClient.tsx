"use client";

import Image from "next/image";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { routeForPlatform } from "@/lib/native/navigation";
import { RequestError } from "@/components/ui/RequestFeedback";
import { useClientQuery } from "@/lib/useClientQuery";
import { ApiError } from "@packages/api-client/src/Client";
import { notFound, useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Clock,
  MapPin,
  Share2,
  Ticket,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventSocialProof } from "@/components/EventSocialProof";
import { EventAttendees } from "@/components/social/EventAttendees";
import { EventLineup } from "@/features/events/lineup/EventLineup";
import { EventOrganizerProfile } from "@/components/EventOrganizerProfile";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { calculateServiceFeeRon, formatRon } from "@/features/events/serviceFee";
import { formatEventDate, formatEventTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { shareEvent as shareNativeEvent } from "@/lib/native/share";
import { EventDetailsSkeleton } from "@/components/ui/loading";
import { toast } from "sonner";
import {
  isTicketSelectionAvailable,
  TicketTypeSelector,
} from "@/features/checkout/TicketTypeSelector";
import { TicketCheckoutDrawer } from "@/features/checkout/TicketCheckoutDrawer";
import { bookFreeTicket } from "@/features/checkout/freeBooking";

export default function EventStandalonePage() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shared, setShared] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [bookingFree, setBookingFree] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: loadedEvent, pending: loading, error, retry } = useClientQuery<Event | undefined>(
    `event:${params.id}`, () => User.getPublicEventById(params.id), undefined,
  );
  const [refreshedEvent, setRefreshedEvent] = useState<Event | undefined>();
  const favoriteLock = useRef(false);
  const availabilityRequestRef = useRef(0);
  const eventIdRef = useRef(params.id);
  eventIdRef.current = params.id;
  const [savingFavorite, setSavingFavorite] = useState(false);

  useEffect(() => {
    availabilityRequestRef.current += 1;
    setCheckingAvailability(false);
    setBookingFree(false);
    setCheckoutOpen(false);
    setQuantities({});
    return () => {
      availabilityRequestRef.current += 1;
    };
  }, [params.id]);

  useEffect(() => {
    setRefreshedEvent(loadedEvent);
    setFavorite(Boolean(loadedEvent?.stats?.isFavorited));
  }, [loadedEvent]);

  const event = refreshedEvent?.id === params.id ? refreshedEvent : loadedEvent;

  if (loading) return <EventDetailsSkeleton label={t("common.loading")} />;
  if (error instanceof ApiError && error.status === 404) notFound();
  if (error) return <main className="app-page-spacing mx-auto min-h-screen max-w-3xl"><BackLink href="/events">{t("common.back")}</BackLink><RequestError onRetry={retry} className="mt-6" /></main>;
  if (!event) notFound();

  const formattedDate = formatEventDate(event.startTime);
  const formattedTime = formatEventTime(event.startTime);
  const formattedEndTime = event.endTime ? formatEventTime(event.endTime) : undefined;
  const ticketTypes = event.ticketTypes ?? [];
  const externalTicketURL = event.externalTicketUrl?.trim() || "";
  const isOwnEvent = user?.properties.id === event.organizerId;
  const isFinished = new Date(event.endTime).getTime() <= Date.now();
  const ticketCount = ticketTypes.reduce(
    (count, ticket) => count + (quantities[ticket.id] ?? 0),
    0,
  );
  const ticketSubtotal = ticketTypes.reduce(
    (sum, ticket) => sum + (quantities[ticket.id] ?? 0) * ticket.priceRon,
    0,
  );
  const serviceFee = event.organizerAbsorbsServiceFee
    ? 0
    : calculateServiceFeeRon(ticketSubtotal, ticketCount);
  const total = ticketSubtotal + serviceFee;
  const isFreeSelection = ticketCount === 1 && ticketSubtotal === 0;
  const bannerUrl = event.bannerUrl || "/images/events/default.jpg";

  const shareEvent = async () => {
    try {
      await shareNativeEvent(event);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        toast.error(t("feedback.shareFailed"));
      }
    }
  };

  const toggleFavorite = async () => {
    if (!user || favoriteLock.current) return;
    favoriteLock.current = true;
    setSavingFavorite(true);

    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    try {
      await user.setEventFavorite(event.id, nextFavorite);
    } catch {
      setFavorite(!nextFavorite);
      toast.error(t("feedback.actionFailed"));
    } finally {
      favoriteLock.current = false;
      setSavingFavorite(false);
    }
  };

  const openCheckout = async () => {
    if (isFinished) return;
    if (isOwnEvent) {
      toast.error(t("eventPage.cannotBuyOwn"));
      return;
    }
    if (externalTicketURL) {
      window.location.assign(externalTicketURL);
      return;
    }
    if (ticketCount === 0) return;
    if (checkingAvailability) return;
    const eventID = event.id;
    const selectionSnapshot = { ...quantities };
    const requestID = ++availabilityRequestRef.current;
    setCheckingAvailability(true);
    let freshEvent: Event;
    try {
      freshEvent = await User.getPublicEventById(eventID);
      if (
        requestID !== availabilityRequestRef.current ||
        eventIdRef.current !== eventID
      ) return;
      setRefreshedEvent(freshEvent);
    } catch {
      if (requestID !== availabilityRequestRef.current) return;
      toast.error(t("checkout.availabilityCheckFailed"));
      setCheckingAvailability(false);
      return;
    }
    const freshTicketTypes = freshEvent.ticketTypes ?? [];
    if (!isTicketSelectionAvailable(freshTicketTypes, selectionSnapshot)) {
      setQuantities({});
      toast.error(t("checkout.selectionUnavailable"));
      setCheckingAvailability(false);
      return;
    }
    const freshSubtotal = freshTicketTypes.reduce(
      (sum, ticket) => sum + (selectionSnapshot[ticket.id] ?? 0) * ticket.priceRon,
      0,
    );
    const freshCount = freshTicketTypes.reduce(
      (sum, ticket) => sum + (selectionSnapshot[ticket.id] ?? 0),
      0,
    );
    const freshIsFreeSelection = freshCount === 1 && freshSubtotal === 0;
    if (freshIsFreeSelection) {
      if (!user) {
        setCheckingAvailability(false);
        router.push(`/login?returnTo=${encodeURIComponent(routeForPlatform(`/events/${event.id}`))}`);
        return;
      }
      const selected = freshTicketTypes.find((ticket) => (selectionSnapshot[ticket.id] ?? 0) > 0);
      if (!selected || bookingFree) {
        setCheckingAvailability(false);
        return;
      }
      setBookingFree(true);
      try {
        const result = await bookFreeTicket(eventID, selected.id);
        if (
          requestID !== availabilityRequestRef.current ||
          eventIdRef.current !== eventID
        ) return;
        toast.success(t(result.alreadyBooked ? "checkout.freeAlreadyBooked" : "checkout.freeBooked"));
        setQuantities({});
        router.push(routeForPlatform("/users/me/tickets"));
      } catch (error) {
        if (
          requestID !== availabilityRequestRef.current ||
          eventIdRef.current !== eventID
        ) return;
        if (error instanceof ApiError && error.status === 409) {
          setQuantities({});
          try {
            const refreshedEvent = await User.getPublicEventById(eventID);
            if (
              requestID !== availabilityRequestRef.current ||
              eventIdRef.current !== eventID
            ) return;
            setRefreshedEvent(refreshedEvent);
          } catch {
            // The stale selection stays cleared if the refresh also fails.
          }
        }
        toast.error(error instanceof ApiError ? error.detail || error.title : t("checkout.freeBookingFailed"));
      } finally {
        if (
          requestID === availabilityRequestRef.current &&
          eventIdRef.current === eventID
        ) {
          setBookingFree(false);
          setCheckingAvailability(false);
        }
      }
      return;
    }
    setQuantities(selectionSnapshot);
    setCheckoutOpen(true);
    setCheckingAvailability(false);
  };

  return (
    <main className="relative isolate min-h-screen overflow-x-clip bg-[#090b0a] pb-32 text-foreground">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#090b0a]">
        <Image
          src={bannerUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-125 object-cover opacity-65 blur-[34px] saturate-[1.65] md:blur-[76px]"
        />
        <div className="absolute inset-0 bg-[#090b0a]/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#090b0a]/5 via-[#090b0a]/45 to-[#090b0a]/90" />
      </div>

      <div className="app-page-gutter relative z-10 mx-auto w-full max-w-7xl pb-12 pt-5 sm:pt-8">
        <header className="flex items-center justify-between gap-4">
          <BackLink
            href="/events"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3.5 text-xs font-semibold text-foreground backdrop-blur-md transition hover:border-white/30 hover:bg-black/50"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </BackLink>
          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={toggleFavorite}
                disabled={savingFavorite}
                aria-busy={savingFavorite}
                aria-label={favorite ? t("eventSheet.removeFavorite") : t("eventSheet.addFavorite")}
                title={favorite ? t("eventSheet.removeFavorite") : t("eventSheet.addFavorite")}
                className={`grid h-10 w-10 place-items-center rounded-full border backdrop-blur-md transition hover:scale-105 active:scale-95 ${
                  favorite
                    ? "border-primary/45 bg-primary/20 text-primary"
                    : "border-white/15 bg-black/30 text-foreground hover:border-white/30"
                }`}
              >
                <Bookmark className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={shareEvent}
              aria-label={shared ? t("checkout.copiedLink") : t("eventSheet.share")}
              title={shared ? t("checkout.copiedLink") : t("eventSheet.share")}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/30 text-foreground backdrop-blur-md transition hover:scale-105 hover:border-white/30 active:scale-95"
            >
              {shared ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <div className="mt-6 grid min-w-0 gap-9 lg:mt-10 lg:grid-cols-[minmax(0,1.16fr)_minmax(21rem,0.84fr)] lg:items-start lg:gap-12">
          <div className="min-w-0">
            <section>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-2xl shadow-black/40 sm:aspect-[16/9] lg:rounded-[24px]">
                <Image
                  src={bannerUrl}
                  alt={event.title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 720px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />
                {event.isLive && !isFinished && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-red-400/45 bg-red-950/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-300 backdrop-blur-md">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
                    </span>
                    {t("common.liveNow")}
                  </span>
                )}
                {isFinished && (
                  <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-md">
                    {t("eventPage.eventCompleted")}
                  </span>
                )}
              </div>

              <div className="pt-6 sm:pt-7">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    {event.title}
                  </h1>
                  <span className="mt-1 shrink-0 rounded-full border border-white/20 bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/85">
                    {event.category}
                  </span>
                </div>

                <div className="mt-4">
                  <EventOrganizerProfile organizerId={event.organizerId} />
                </div>

                <div className="mt-5 space-y-2.5 text-sm text-white/60 sm:text-[15px]">
                  <EventMeta icon={MapPin} value={event.locationName} />
                  <EventMeta icon={Calendar} value={formattedDate} />
                  <EventMeta
                    icon={Clock}
                    value={formattedEndTime ? t("eventPage.until", { time: formattedEndTime }) : formattedTime}
                  />
                </div>

                <div className="mt-6 max-w-xl">
                  <EventSocialProof eventId={event.id} className="border-0 py-0" />
                </div>

                <div className="mt-4 max-w-xl">
                  <EventAttendees eventId={event.id} compact />
                </div>
              </div>
            </section>

            <div className="mt-10 sm:mt-12">
              <EventLineup artists={event.lineup} />
            </div>

            <section className="mt-10 sm:mt-12">
              <h2 className="text-base font-semibold text-white">{t("eventPage.about")}</h2>
              <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-7 text-white/65 sm:text-[15px]">
                {event.description || t("eventPage.noDescription")}
              </p>
            </section>

            <section className="mt-10 sm:mt-12">
              <EventOrganizerUpdates eventId={event.id} />
            </section>

            <section className="mt-10 sm:mt-12">
              <h2 className="text-base font-semibold text-white">{t("eventPage.location")}</h2>
              <div className="mt-3 flex min-w-0 max-w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{event.locationName}</p>
                  <p className="mt-1 text-xs text-white/55">{t("eventPage.directions")}</p>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 text-xs font-semibold transition hover:border-primary hover:text-primary"
                >
                  {t("eventPage.open")} <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </section>
          </div>

          <aside className="min-w-0 w-full lg:sticky lg:top-8 lg:self-start">
            <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-xl shadow-black/15 backdrop-blur-md">
              <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t("eventPage.tickets")}</p>
                <p className="mt-1 text-sm text-white/60">
                  {isFinished ? t("eventPage.eventCompleted") : t("eventPage.eventAccess")}
                </p>
              </div>

              <div className="p-3 sm:p-4">
                {!externalTicketURL && ticketTypes.length > 0 ? (
                  <div className="space-y-2">
                    <TicketTypeSelector tickets={ticketTypes} quantities={quantities} onChange={setQuantities} disabled={isFinished || isOwnEvent || checkingAvailability || bookingFree} />
                  </div>
                ) : (
                  <p className="px-2 py-3 text-sm leading-6 text-white/60">
                    {t(externalTicketURL ? "eventPage.externalTicketHint" : "eventPage.noTickets")}
                  </p>
                )}

                {(externalTicketURL || ticketTypes.length > 0) && !isFinished && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={openCheckout}
                      disabled={(!externalTicketURL && ticketCount === 0) || isOwnEvent || bookingFree || checkingAvailability}
                      className="mt-4 flex h-12 w-full items-center justify-between rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Ticket className="h-4 w-4" />
                        {checkingAvailability
                          ? t("checkout.checkingTicketAvailability")
                          : isOwnEvent
                          ? t("eventPage.ownEvent")
                          : externalTicketURL
                            ? t("eventSheet.externalTickets")
                            : ticketCount
                              ? isFreeSelection
                                ? bookingFree ? t("checkout.bookingFree") : t("checkout.bookFree")
                                : t("eventSheet.continue", { count: ticketCount, total: formatRon(total) })
                              : t("checkout.selectTickets")}
                      </span>
                    </button>
                  </div>
                )}

                {isFinished && (
                  <button
                    type="button"
                    onClick={() => router.push(routeForPlatform(`/users/${event.organizerId}`))}
                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
                  >
                    {t("eventPage.viewOrganizerEvents")}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
      <TicketCheckoutDrawer event={event} quantities={quantities} onQuantitiesChange={setQuantities} open={checkoutOpen} onEventRefresh={setRefreshedEvent} onClose={() => setCheckoutOpen(false)} />
    </main>
  );
}

function EventMeta({
  icon: Icon,
  value,
}: {
  icon: typeof Calendar;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-white/45" />
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
