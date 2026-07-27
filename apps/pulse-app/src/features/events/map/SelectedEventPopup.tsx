import { useEffect, useRef } from "react";
import Image from "next/image";
import L from "leaflet";
import { Clock, X } from "lucide-react";
import { Popup, useMap } from "react-leaflet";
import { Event } from "@/core/DataProvider";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";
import { formatEventTime } from "@/features/events/dateFormat";

interface SelectedEventPopupProps {
  event: Event;
  onClose: () => void;
  onOpen: () => void;
}

export function SelectedEventPopup({
  event,
  onClose,
  onOpen,
}: SelectedEventPopupProps) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);

  useEffect(() => {
    popupRef.current?.openOn(map);
  }, [event.id, map]);

  return (
    <Popup
      ref={popupRef}
      position={[event.latitude, event.longitude]}
      offset={[0, -27]}
      closeButton={false}
      closeOnClick={false}
      autoPan={false}
      keepInView={false}
      className="event-preview-popup"
    >
      {/* Container Glassmorphic Optimizat cu transform-gpu */}
      <div className="relative w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-white/10 bg-[#121418]/95 p-3 text-left antialiased shadow-[0_8px_32px_rgba(0,0,0,0.5)] transform-gpu md:w-[20rem] md:bg-white/[0.06] md:backdrop-blur-md">
        {/* Buton Închidere - Fără blur redundant pe mobil */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close popup"
          className="absolute right-3 top-3 z-20 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/15 text-zinc-300 transition duration-200 hover:bg-white/25 hover:text-white md:backdrop-blur-md"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex gap-3">
          {/* Banner / Imagine Event */}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10">
            <Image
              src={event.bannerUrl || "/images/events/default.jpg"}
              alt={event.title}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>

          {/* Informații Event */}
          <div className="min-w-0 flex-1 pr-5">
            {/* Titlu */}
            <h3 className="truncate text-sm font-bold leading-snug tracking-wide text-white">
              {event.title}
            </h3>

            {/* Ora / Data */}
            <div className="mt-1 flex items-center gap-1.5 text-xs leading-none text-zinc-400">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>
                {formatEventTime(event.startTime)}
              </span>
            </div>

            {/* Badges / Categorie */}
            <div className="mt-2.5 flex flex-nowrap items-center gap-1.5">
              <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/15 px-2.5 text-[10px] font-semibold uppercase leading-none text-zinc-200 md:backdrop-blur-sm">
                {event.category || "General"}
              </span>

              {event.isLive && (
                <EventStatusBadge
                  event={event}
                  compact
                  className="!h-6 shrink-0 !whitespace-nowrap !text-[10px] !font-semibold !uppercase"
                />
              )}
            </div>
          </div>
        </div>

        {/* Buton Acțiune - Fundal solid/semi-transparent pe mobil pt. răspuns instant la click */}
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-white/15 text-xs font-semibold text-white shadow-sm transition duration-200 hover:bg-white/25 hover:border-white/20 active:scale-[0.98] md:backdrop-blur-md"
        >
          View event
        </button>
      </div>
    </Popup>
  );
}
