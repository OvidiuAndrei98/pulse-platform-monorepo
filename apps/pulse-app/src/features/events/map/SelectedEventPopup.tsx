import { useEffect, useRef } from "react";
import Image from "next/image";
import L from "leaflet";
import { Clock, X } from "lucide-react";
import { Popup, useMap } from "react-leaflet";
import { Event } from "@/core/DataProvider";
import { EventStatusBadge } from "@/features/events/components/EventStatusBadge";

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
      {/* Container Glassmorphic: Transparent + Blur masiv pe fundal */}
      <div className="relative w-[320px] rounded-[24px] border border-white/10 bg-white/[0.06] p-3.5 text-left antialiased backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {" "}
        {/* Buton Închidere */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close popup"
          className="absolute right-3 top-3 z-20 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/10 text-zinc-300 transition duration-200 hover:bg-white/20 hover:text-white backdrop-blur-md"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex gap-3">
          {/* Banner / Imagine Event */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-white/10">
            <Image
              src={event.bannerUrl || "/images/events/default.jpg"}
              alt={event.title}
              fill
              sizes="64px"
              className="object-cover"
            />
          </div>

          {/* Informații Event */}
          <div className="min-w-0 flex-1 pr-6">
            {/* Titlu */}
            <h3 className="truncate text-sm font-bold leading-snug tracking-wide text-white">
              {event.title}
            </h3>

            {/* Ora / Data */}
            <div className="mt-1 flex items-center gap-1.5 text-xs leading-none text-zinc-400">
              <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>
                {new Date(event.startTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* Badges / Categorie */}
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/10 px-2.5 text-[10px] font-semibold uppercase leading-none text-zinc-200 backdrop-blur-sm">
                {event.category || "General"}
              </span>

              {event.isLive && (
                <EventStatusBadge
                  event={event}
                  compact
                  className="!h-6 !text-[10px] !font-semibold !uppercase"
                />
              )}
            </div>
          </div>
        </div>
        {/* Buton Acțiune */}
        <button
          type="button"
          onClick={onOpen}
          className="mt-3.5 flex h-9 w-full items-center justify-center rounded-xl border border-white/10 bg-white/10 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition duration-200 hover:bg-white/20 hover:border-white/20 active:scale-[0.98]"
        >
          View event
        </button>
      </div>
    </Popup>
  );
}
