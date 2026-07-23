import { Calendar } from "lucide-react";
import { Event } from "@/core/DataProvider";

export function EventStatusBadge({
  event,
  compact = false,
  className = "",
}: {
  event: Event;
  compact?: boolean;
  className?: string;
}) {
  if (event.isLive) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 font-semibold uppercase tracking-wide text-red-400 backdrop-blur ${
          compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]"
        } ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Live Now
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-background/50 px-3 py-1.5 text-[11px] text-foreground backdrop-blur">
      <Calendar className="h-3 w-3" />
      {event.startTime && new Date(event.startTime).toLocaleDateString()}
    </span>
  );
}
