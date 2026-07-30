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
  Users,
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
import {
  formatEventDate,
  formatEventTime,
} from "@/features/events/dateFormat";
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
    async function fetchEvent() {
      try {
        setLoading(true);
        const fetchedEvent = await User.getPublicEventById(params.id);
        setEvent(fetchedEvent);
        setFavorite(Boolean(fetchedEvent.stats?.isFavorited));
        setGuestEmail(user?.properties.email ?? "");
      } catch (error) {
        console.error("Failed to load event details", error);
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [params.id]);

  if (loading) return <EventDetailsSkeleton label={t("common.loading")} />;
  if (!event) notFound();

  const formattedDate = formatEventDate(event.startTime);
  const formattedTime = formatEventTime(event.startTime);
  const formattedEndTime = event.endTime
    ? formatEventTime(event.endTime)
    : undefined;
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
    <main className="relative min-h-screen overflow-hidden bg-background pb-40 text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[410px] overflow-hidden">
        <Image
          src={event.bannerUrl || "/images/events/default.jpg"}
          alt=""
          fill
          priority
          className="object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 pt-16 sm:px-8 sm:pt-24">
        <Link
          href="/events"
          className="mb-5 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-background/65 px-3 text-xs font-semibold text-foreground backdrop-blur transition hover:bg-surface"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("common.back")}
        </Link>
        <section className="rounded-xl border border-white/15 bg-background/90 p-6 backdrop-blur-md sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary">{event.category}</p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{event.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("eventPage.locationAt", { location: event.locationName })}</p>
              {isFinished && (
                <p className="mt-3 inline-flex rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                  {t("eventPage.eventCompleted")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {user && (
                <button
                  type="button"
                  onClick={toggleFavorite}
                  aria-label={favorite ? t("eventSheet.removeFavorite") : t("eventSheet.addFavorite")}
                  title={favorite ? t("eventSheet.removeFavorite") : t("eventSheet.addFavorite")}
                  className={`grid h-9 w-9 place-items-center rounded-full border transition hover:border-primary hover:bg-surface ${
                    favorite
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-white/15 bg-surface/60"
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
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-surface/60 transition hover:bg-surface"
              >
                {shared ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Fact icon={Clock} label={t("eventPage.time")} value={formattedEndTime ? t("eventPage.until", { time: formattedEndTime }) : formattedTime} />
            <Fact icon={MapPin} label={t("eventPage.location")} value={event.locationName} />
            <Fact icon={Calendar} label={t("eventPage.when")} value={formattedDate} />
            <Fact icon={Users} label={t("eventPage.vibe")} value={event.category} />
          </div>
        </section>

        <section className="pt-7 sm:pt-8">
          <h2 className="text-sm font-semibold">{t("eventPage.about")}</h2>
          <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {event.description || t("eventPage.noDescription")}
          </p>
        </section>

        <div className="pt-7 sm:pt-8">
          <EventOrganizerProfile organizerId={event.organizerId} />
          <EventOrganizerUpdates eventId={event.id} />
        </div>

        <EventLineup artists={event.lineup} />

        <div className="pt-7 sm:pt-8">
          <EventSocialProof eventId={event.id} />
        </div>

        <div className="pt-6">
          <EventAttendees eventId={event.id} />
        </div>

        <section className="pt-8">
          <h2 className="text-sm font-semibold">{t("eventPage.tickets")}</h2>
          {ticketTypes.length > 0 ? (
            <div className="mt-3 space-y-3">
              {ticketTypes.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/15 bg-surface/80 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ticket.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ticket.description || t("eventPage.eventAccess")} <span className="text-foreground">. {ticket.priceRon} RON</span>
                    </p>
                  </div>
                  {!isFinished && (
                    <div className="flex shrink-0 items-center gap-3">
                      <QuantityButton label={t("eventPage.decrease")} onClick={() => changeQuantity(ticket.id, -1)} disabled={!quantities[ticket.id]}>
                        <Minus className="h-3.5 w-3.5" />
                      </QuantityButton>
                      <span className="w-3 text-center text-sm font-semibold">{quantities[ticket.id] ?? 0}</span>
                      <QuantityButton label={t("eventPage.increase")} variant="primary" onClick={() => changeQuantity(ticket.id, 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </QuantityButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("eventPage.noTickets")}</p>
          )}
          {ticketTypes.length > 0 && !isFinished && (
            <>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/15 px-4 py-3 text-xs">
                {ticketCount > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-muted-foreground"><span>{t("checkout.tickets")}</span><span>{formatRon(ticketSubtotal)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>{event.organizerAbsorbsServiceFee ? "Taxă de servicii suportată de organizator" : "Taxă de servicii (4% + 2,50 RON/bilet)"}</span><span>{event.organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)}</span></div>
                    <div className="flex justify-between border-t border-white/10 pt-1.5 text-sm font-semibold"><span>{t("checkout.total")}</span><span>{formatRon(total)}</span></div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">{event.organizerAbsorbsServiceFee ? "Preț final, fără taxe adăugate la checkout." : "Taxa de servicii se calculează înainte de plată."}</p>
                )}
              </div>
              <div className="mt-4">
                <label className="text-sm font-semibold" htmlFor="ticket-email">{t("eventSheet.emailForTickets")}</label>
                <input
                  id="ticket-email"
                  type="email"
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(inputEvent) => setGuestEmail(inputEvent.target.value)}
                  placeholder={t("checkout.emailPlaceholder")}
                  className="mt-2 h-12 w-full rounded-lg border border-white/15 bg-surface/80 px-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60"
                />
                {!user && (
                  <GoogleSignInButton
                    returnTo={`/events/${event.id}?checkout=1`}
                    className="mt-3"
                  />
                )}
                {checkoutError && <p className="mt-2 text-xs text-red-400">{checkoutError}</p>}
              </div>
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
            </>
          )}
          {isFinished && (
            <button
              type="button"
              onClick={() => router.push(`/users/${event.organizerId}`)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              {t("eventPage.viewOrganizerEvents")}
              <ArrowUpRight className="h-4 w-4" />
            </button>
          )}
        </section>

        <section className="pt-8">
          <h2 className="text-sm font-semibold">{t("eventPage.location")}</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-white/15 bg-surface/80 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{event.locationName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("eventPage.directions")}</p>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-2 text-xs font-semibold transition hover:border-primary hover:text-primary"
            >
              {t("eventPage.open")} <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

      </div>
    </main>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/15 bg-surface/80 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold capitalize">{value}</p>
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
      className={`grid h-8 w-8 place-items-center rounded-md border font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
        variant === "primary"
          ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
          : "border-white/15 bg-white/5 text-foreground hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
