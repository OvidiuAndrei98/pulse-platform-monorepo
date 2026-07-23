import { useEffect, useRef } from "react";
import Image from "next/image";
import L from "leaflet";
import { Clock, X } from "lucide-react";
import { Popup, useMap } from "react-leaflet";
import { Event } from "@/core/DataProvider";

export function SelectedEventPopup({
  event,
  onClose,
  onOpen,
}: {
  event: Event;
  onClose: () => void;
  onOpen: () => void;
}) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);

  useEffect(() => {
    popupRef.current?.openOn(map);
  }, [event.id, map]);

  return (
    <Popup
      ref={popupRef}
      position={[event.latitude, event.longitude]}
      offset={[0, -18]}
      closeButton={false}
      closeOnClick={false}
      autoPan={false}
      keepInView={false}
      autoPanPadding={[32, 48]}
      className="event-preview-popup"
    >
      <div className="relative p-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md border border-white/15 bg-white/5 transition hover:bg-white/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-muted">
            <Image
              src={event.bannerUrl || "/images/events/default.jpg"}
              alt={event.title}
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-[11px] font-medium text-primary">
              {event.category}
            </p>
            <h3 className="truncate text-sm font-semibold">{event.title}</h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(event.startTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 flex h-9 w-full items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          View event
        </button>
      </div>
    </Popup>
  );
}
