"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
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

export default function EventStandalonePage() {
  const { user } = useDataProvider();
  const [event, setEvent] = useState<Event | undefined>();
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shared, setShared] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const params = useParams<{ id: string }>();

  useEffect(() => {
    async function fetchEvent() {
      try {
        setLoading(true);
        const fetchedEvent = await User.getPublicEventById(params.id);
        setEvent(fetchedEvent);
        setFavorite(Boolean(fetchedEvent.stats?.isFavorited));
      } catch (error) {
        console.error("Failed to load event details", error);
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [params.id]);

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!event) notFound();

  const startDate = new Date(event.startTime);
  const formattedDate = startDate.toLocaleDateString("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = startDate.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedEndTime = event.endTime
    ? new Date(event.endTime).toLocaleTimeString("ro-RO", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;
  const when = getWhenLabel(startDate, formattedDate);
  const ticketTypes = event.ticketTypes ?? [];
  const ticketCount = ticketTypes.reduce(
    (count, ticket) => count + (quantities[ticket.id] ?? 0),
    0,
  );
  const total = ticketTypes.reduce(
    (sum, ticket) => sum + (quantities[ticket.id] ?? 0) * ticket.priceRon,
    0,
  );

  const changeQuantity = (ticketId: string, amount: number) => {
    setQuantities((current) => ({
      ...current,
      [ticketId]: Math.max(0, Math.min(8, (current[ticketId] ?? 0) + amount)),
    }));
  };

  const shareEvent = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-background pb-40 text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[410px] overflow-hidden">
        <Image
          src={event.bannerUrl || "/images/events/default.jpg"}
          alt=""
          fill
          priority
          className="object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-background/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/45 to-background" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 pt-16 sm:px-8 sm:pt-24">
        <Link
          href="/events"
          className="mb-5 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-background/65 px-3 text-xs font-semibold text-foreground backdrop-blur transition hover:bg-surface"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Inapoi
        </Link>
        <section className="rounded-[28px] border border-white/15 bg-background/90 p-6 backdrop-blur-md sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-primary">{event.category}</p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{event.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">La {event.locationName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {user && (
                <button
                  type="button"
                  onClick={toggleFavorite}
                  aria-label={favorite ? "Elimina din favorite" : "Adauga la favorite"}
                  title={favorite ? "Elimina din favorite" : "Adauga la favorite"}
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
                aria-label={shared ? "Link copiat" : "Distribuie evenimentul"}
                title={shared ? "Link copiat" : "Distribuie"}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-surface/60 transition hover:bg-surface"
              >
                {shared ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Fact icon={Clock} label="Ora" value={formattedEndTime ? `Pana la ${formattedEndTime}` : formattedTime} />
            <Fact icon={MapPin} label="Locatie" value={event.locationName} />
            <Fact icon={Calendar} label="Cand" value={when} />
            <Fact icon={Users} label="Vibe" value={event.category} />
          </div>
        </section>

        <section className="pt-7 sm:pt-8">
          <h2 className="text-sm font-semibold">Despre eveniment</h2>
          <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {event.description || "Nu exista o descriere detaliata pentru acest eveniment."}
          </p>
        </section>

        <section className="pt-8">
          <h2 className="text-sm font-semibold">Bilete</h2>
          {ticketTypes.length > 0 ? (
            <div className="mt-3 space-y-3">
              {ticketTypes.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-white/15 bg-surface/80 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ticket.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ticket.description || "Acces la eveniment"} <span className="text-foreground">. {ticket.priceRon} RON</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <QuantityButton label="Scade" onClick={() => changeQuantity(ticket.id, -1)} disabled={!quantities[ticket.id]}>
                      <Minus className="h-3.5 w-3.5" />
                    </QuantityButton>
                    <span className="w-3 text-center text-sm font-semibold">{quantities[ticket.id] ?? 0}</span>
                    <QuantityButton label="Adauga" variant="primary" onClick={() => changeQuantity(ticket.id, 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </QuantityButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Accesul este liber sau biletele se achizitioneaza direct la locatie.</p>
          )}
          {ticketTypes.length > 0 && (
            <button
              type="button"
              disabled={ticketCount === 0}
              className="mt-4 flex h-12 w-full items-center justify-between rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                {ticketCount ? `Cumpara ${ticketCount} bilete` : "Alege biletele"}
              </span>
              {ticketCount > 0 && <span>{total} RON</span>}
            </button>
          )}
        </section>

        <section className="pt-8">
          <h2 className="text-sm font-semibold">Locatie</h2>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-[24px] border border-white/15 bg-surface/80 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{event.locationName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Deschide traseul in Google Maps</p>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3 py-2 text-xs font-semibold transition hover:border-primary hover:text-primary"
            >
              Deschide <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

      </div>
    </main>
  );
}

function getWhenLabel(date: Date, fallback: string) {
  const today = new Date();
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const eventAtMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAway = Math.round((eventAtMidnight.getTime() - todayAtMidnight.getTime()) / 86_400_000);

  if (daysAway === 0) return "Astazi";
  if (daysAway === 1) return "Maine";
  return fallback;
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
    <div className="min-w-0 rounded-[24px] border border-white/15 bg-surface/80 px-4 py-3.5">
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
