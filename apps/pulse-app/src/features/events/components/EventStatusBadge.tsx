import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Event } from "@/core/DataProvider";
import { formatEventDateShort } from "@/features/events/dateFormat";

export function EventStatusBadge({
  event,
  compact = false,
  className = "",
}: {
  event: Event;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (event.isLive) {
    return (
      <span
        className={`spottr-live-badge relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-red-500/40 bg-red-500/20 font-semibold uppercase tracking-wide text-red-400 transform-gpu md:bg-red-500/15 [--live-badge-blur:0px] md:[--live-badge-blur:8px] ${
          compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[11px]"
        } ${className}`}
      >
        <LiveIndicator />
        {t("common.liveNow")}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-white/20 bg-neutral-900/80 md:bg-background/50 px-3 py-1.5 text-[11px] text-foreground md:backdrop-blur-sm transform-gpu ${className}`}
    >
      <Calendar className="h-3 w-3" />
      {formatEventDateShort(event.startTime)}
    </span>
  );
}
