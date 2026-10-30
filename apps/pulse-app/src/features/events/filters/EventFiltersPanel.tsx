import { Check, MapPin, SlidersHorizontal, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  eventCities,
  eventDateFilters,
  eventVibes,
} from "@/features/events/constants";
import { eventCategories } from "@/core/mappers";
import { EventFilters } from "@/features/events/types";
import { DiscoveryCalendar } from './DiscoveryCalendar';

const dateLabelKeys: Record<string, string> = {
  "See all": "filters.seeAll",
  Tonight: "filters.tonight",
  Tomorrow: "filters.tomorrow",
  "This weekend": "filters.weekend",
  "Next week": "filters.nextWeek",
};

export function EventFiltersPanel({
  filters,
  onChange,
  onClose,
  onReset,
  onApply,
  compact = false,
  distanceReady = true,
  error = '',
}: {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
  compact?: boolean;
  distanceReady?: boolean;
  error?:string;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const toggle = (key: "categories" | "vibes", value: string) => {
    const values = filters[key];
    onChange({
      ...filters,
      [key]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-6 pt-5">
        <motion.div layoutId="filter-morph-inner" className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" strokeWidth={2.2} />
          <span className="text-sm font-semibold">{t("filters.title")}</span>
        </motion.div>
        <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: reduced?0:0.05, delayChildren: reduced?0:0.15 } } }}
        className="min-h-0 flex-1 select-none space-y-6 overflow-y-auto overscroll-contain px-6 pb-4 pt-5"
      >
        {!compact && <FilterSection title={t("filters.when")}>
          <div className="flex flex-wrap gap-2">
            {eventDateFilters.map((date) => (
              <FilterChip key={date} active={filters.date === date} onClick={() => onChange({ ...filters, date, dateFrom:undefined,dateTo:undefined })}>
                {t(dateLabelKeys[date])}
              </FilterChip>
            ))}
          </div>
          <DiscoveryCalendar from={filters.dateFrom} to={filters.dateTo} onChange={(dateFrom,dateTo)=>onChange({...filters,date:dateFrom?'Custom':'See all',dateFrom,dateTo})}/>
        </FilterSection>}
        {!compact && <FilterSection title={t("filters.city")}>
          <label className="flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4"><MapPin aria-hidden className="h-4 w-4 shrink-0"/><span className="sr-only">{t('filters.city')}</span><select value={filters.city} onChange={event=>onChange({...filters,city:event.target.value})} className="min-w-0 flex-1 bg-transparent py-2 text-base text-white"><option className="bg-[#191919]" value="">{t('filters.allCities')}</option>{eventCities.map(city=><option className="bg-[#191919]" key={city}>{city}</option>)}</select></label>
        </FilterSection>}
        <FilterSection title={t("filters.categories")}>
          <div className="flex flex-wrap gap-2">
            {eventCategories.map((category) => (
              <FilterChip key={category} active={filters.categories.includes(category)} onClick={() => toggle("categories", category)}>
                {filters.categories.includes(category) && <Check className="h-3 w-3" strokeWidth={3} />}
                {category}
              </FilterChip>
            ))}
          </div>
        </FilterSection>
        <FilterSection title={t("filters.vibe")}>
          <div className="flex flex-wrap gap-2">
            {eventVibes.map((vibe) => (
              <FilterChip key={vibe} active={filters.vibes.includes(vibe)} onClick={() => toggle("vibes", vibe)}>
                {filters.vibes.includes(vibe) && <Check className="h-3 w-3" strokeWidth={3} />}
                {vibe}
              </FilterChip>
            ))}
          </div>
        </FilterSection>
        <FilterSection title={`${t("filters.distance")} · ${t("filters.distanceValue", { distance: filters.distance })}`}>
          <input aria-label={t('filters.distance')} type="range" min={1} max={50} disabled={!distanceReady} value={filters.distance} onChange={(event) => onChange({ ...filters, distance: Number(event.target.value) })} className="w-full accent-primary disabled:opacity-40" />
          {!distanceReady&&<p className="text-xs text-muted-foreground">{t('filters.distanceHint')}</p>}
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{t("filters.distanceValue", { distance: 1 })}</span><span>{t("filters.distanceValue", { distance: 50 })}</span></div>
        </FilterSection>
      </motion.div>
      {error&&<p role="alert" className="shrink-0 px-6 pb-3 text-sm text-red-400">{error}</p>}
      <div className="relative flex shrink-0 items-center gap-3 border-t border-white/10 px-6 py-4">
        <button type="button" onClick={onReset} className="flex-1 rounded-full border border-white/15 bg-white/5 py-3 text-sm font-medium">{t("common.reset")}</button>
        <button type="button" onClick={onApply} className="flex-[1.6] rounded-full bg-primary py-3 text-xl font-bold text-white">{t("common.applyFilters")}</button>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const reduced=useReducedMotion();
  return <motion.div variants={{ hidden: { opacity: 0, y: reduced?0:8 }, show: { opacity: 1, y: 0 } }}><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>{children}</motion.div>;
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={!!active} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-primary/60 bg-primary/15 text-white" : "border-white/15 bg-white/5 text-foreground/85 hover:bg-white/10"}`}>{children}</button>;
}
