"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Calendar,
  Check,
  Clock,
  MapPin,
  Minus,
  Plus,
  Share2,
  Ticket,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { EventSocialProof } from "@/components/EventSocialProof";
import { EventAttendees } from "@/components/social/EventAttendees";
import { EventLineup } from "@/features/events/lineup/EventLineup";
import { EventOrganizerProfile } from "@/components/EventOrganizerProfile";
import { EventOrganizerUpdates } from "@/components/EventOrganizerUpdates";
import { ApiClient } from "@packages/api-client/src/Client";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { calculateServiceFeeRon, formatRon } from "@/features/events/serviceFee";
import { formatEventDate, formatEventTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import { shareEvent as shareNativeEvent } from "@/lib/native/share";
import { EventDetailsSkeleton } from "@/components/ui/loading";

export default function EventStandalonePage() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [event, setEvent] = useState<Event | undefined>();
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shared, setShared] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    void User.getPublicEventById(params.id)
      .then((fetchedEvent) => {
        if (!active) return;
        setEvent(fetchedEvent);
        setFavorite(Boolean(fetchedEvent.stats?.isFavorited));
        setGuestEmail(user?.properties.email ?? "");
      })
      .catch((error) => {
        console.error("Failed to load event details", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.id, user?.properties.email]);

  if (loading) return <EventDetailsSkeleton label={t("common.loading")} />;
  if (!event) notFound();

  const formattedDate = formatEventDate(event.startTime);
  const formattedTime = formatEventTime(event.startTime);
  const formattedEndTime = event.endTime ? formatEventTime(event.endTime) : undefined;
  const ticketTypes = event.ticketTypes ?? [];
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
  const bannerUrl = event.bannerUrl || "/images/events/default.jpg";

  const changeQuantity = (ticketId: string, amount: number) => {
    setQuantities((current) => ({
      ...current,
      [ticketId]: Math.max(0, Math.min(8, (current[ticketId] ?? 0) + amount)),
    }));
  };

  const shareEvent = async () => {
    try {
      await shareNativeEvent(event);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        console.error("Unable to share event", error);
      }
    }
  };

  const toggleFavorite = async () => {
    if (!user) return;

    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    try {
      await user.setEventFavorite(event.id, nextFavorite);
    } catch {
      setFavorite(!nextFavorite);
    }
  };

  const handleCheckout = async () => {
    if (isFinished) return;
    if (isOwnEvent) {
      setCheckoutError(t("eventPage.cannotBuyOwn"));
      return;
    }
    if (ticketCount === 0 || isCheckingOut) return;

    const email = guestEmail.trim();
    if (!email) {
      setCheckoutError(t("eventSheet.emailRequired"));
      return;
    }

    setCheckoutError("");
    setIsCheckingOut(true);

    try {
      const checkout = await ApiClient.instance.post("/events/{id}/tickets/purchase", {
        params: { path: { id: event.id } },
        body: {
          email,
          items: ticketTypes
            .filter((ticket) => (quantities[ticket.id] ?? 0) > 0)
            .map((ticket) => ({
              ticketTypeId: ticket.id,
              quantity: quantities[ticket.id] ?? 0,
            })),
        },
      });
      window.location.assign(checkout.checkoutUrl);
    } catch {
      setCheckoutError(t("eventSheet.purchaseError"));
      setIsCheckingOut(false);
    }
  };

  return (
    <main className="relative isolate min-h-screen bg-[#090b0a] pb-32 text-foreground">
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

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-8 sm:pt-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/events"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3.5 text-xs font-semibold text-foreground backdrop-blur-md transition hover:border-white/30 hover:bg-black/50"
          >
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </Link>
          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={toggleFavorite}
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

        <div className="mt-6 grid gap-9 lg:mt-10 lg:grid-cols-[minmax(0,1.16fr)_minmax(21rem,0.84fr)] lg:items-start lg:gap-12">
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
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
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

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <section className="overflow-hidden rounded-2xl border border-white/12 bg-[#0c0f0d]/88 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t("eventPage.tickets")}</p>
                <p className="mt-1 text-sm text-white/60">
                  {isFinished ? t("eventPage.eventCompleted") : t("eventPage.eventAccess")}
                </p>
              </div>

              <div className="p-3 sm:p-4">
                {ticketTypes.length > 0 ? (
                  <div className="space-y-2">
                    {ticketTypes.map((ticket) => (
                      <div
                        key={ticket.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-3.5 sm:px-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{ticket.name}</p>
                          <p className="mt-1 truncate text-xs text-white/55">
                            {ticket.description || t("eventPage.eventAccess")}
                          </p>
                          <p className="mt-1.5 text-sm font-semibold text-primary">{formatRon(ticket.priceRon)}</p>
                        </div>
                        {!isFinished && (
                          <div className="flex shrink-0 items-center gap-2.5">
                            <QuantityButton
                              label={t("eventPage.decrease")}
                              onClick={() => changeQuantity(ticket.id, -1)}
                              disabled={!quantities[ticket.id]}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </QuantityButton>
                            <span className="w-3 text-center text-sm font-semibold text-white">
                              {quantities[ticket.id] ?? 0}
                            </span>
                            <QuantityButton
                              label={t("eventPage.increase")}
                              variant="primary"
                              onClick={() => changeQuantity(ticket.id, 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </QuantityButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-sm leading-6 text-white/60">{t("eventPage.noTickets")}</p>
                )}

                {ticketTypes.length > 0 && !isFinished && (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs">
                      {ticketCount > 0 ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-white/55"><span>{t("checkout.tickets")}</span><span>{formatRon(ticketSubtotal)}</span></div>
                          <div className="flex justify-between gap-3 text-white/55"><span>{event.organizerAbsorbsServiceFee ? t("checkout.organizerFee") : t("checkout.serviceFee")}</span><span>{event.organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)}</span></div>
                          <div className="flex justify-between border-t border-white/10 pt-2 text-sm font-semibold text-white"><span>{t("checkout.total")}</span><span>{formatRon(total)}</span></div>
                        </div>
                      ) : (
                        <p className="leading-5 text-white/55">
                          {event.organizerAbsorbsServiceFee ? t("checkout.finalPrice") : t("checkout.feeBeforePayment")}
                        </p>
                      )}
                    </div>

                    <label className="mt-4 block text-xs font-semibold text-white" htmlFor="ticket-email">
                      {t("eventSheet.emailForTickets")}
                    </label>
                    <input
                      id="ticket-email"
                      type="email"
                      autoComplete="email"
                      value={guestEmail}
                      onChange={(inputEvent) => setGuestEmail(inputEvent.target.value)}
                      placeholder={t("checkout.emailPlaceholder")}
                      className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-white/[0.035] px-3.5 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-primary/60"
                    />
                    {!user && (
                      <GoogleSignInButton returnTo={`/events/${event.id}?checkout=1`} className="mt-3" />
                    )}
                    {checkoutError && <p className="mt-2 text-xs text-red-400">{checkoutError}</p>}

                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={ticketCount === 0 || isCheckingOut || isOwnEvent}
                      className="mt-4 flex h-12 w-full items-center justify-between rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Ticket className="h-4 w-4" />
                        {isOwnEvent
                          ? t("eventPage.ownEvent")
                          : isCheckingOut
                            ? t("checkout.preparingPayment")
                            : ticketCount
                              ? t("eventPage.buyTickets", { count: ticketCount })
                              : t("checkout.selectTickets")}
                      </span>
                      {ticketCount > 0 && <span>{formatRon(total)}</span>}
                    </button>
                  </div>
                )}

                {isFinished && (
                  <button
                    type="button"
                    onClick={() => router.push(`/users/${event.organizerId}`)}
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

function QuantityButton({
  label,
  onClick,
  disabled,
  variant = "default",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-lg border font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
        variant === "primary"
          ? "border-primary/45 bg-primary/15 text-primary hover:bg-primary/25"
          : "border-white/15 bg-white/[0.04] text-foreground hover:bg-white/[0.1]"
      }`}
    >
      {children}
    </button>
  );
}
