import { Check, MapPin, SlidersHorizontal, X } from "lucide-react";
import { motion } from "framer-motion";
import { eventCities, eventVibes } from "@/features/events/constants";
import { eventCategories } from "@/core/mappers";
import { EventFilters } from "@/features/events/types";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

const dates = ["Tonight", "Tomorrow", "This weekend", "Next week"];

export function EventFiltersPanel({
  filters,
  onChange,
  onClose,
  onReset,
  onApply,
}: {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
}) {
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
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-5">
        <motion.div
          layoutId="filter-morph-inner"
          className="flex items-center gap-2"
        >
          <SlidersHorizontal
            className="h-4 w-4 text-primary"
            strokeWidth={2.2}
          />
          <span className="text-sm font-semibold">Filters</span>
        </motion.div>
        <button
          type="button"
          aria-label="Close filters"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } },
        }}
        className="flex-1 select-none space-y-6 overflow-y-auto px-6 pb-4 pt-5 [scrollbar-color:rgba(255,255,255,0.1)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5 hover:[&::-webkit-scrollbar-thumb]:bg-white/20"
      >
        <FilterSection title="When">
          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <FilterChip
                key={date}
                active={filters.date === date}
                onClick={() => onChange({ ...filters, date })}
              >
                {date}
              </FilterChip>
            ))}
          </div>
        </FilterSection>
        <FilterSection title="City">
          <ThemedSelect
            value={filters.city}
            options={[
              { value: "", label: "All cities" },
              ...eventCities.map((city) => ({ value: city, label: city })),
            ]}
            placeholder="All cities"
            icon={MapPin}
            onChange={(city) => onChange({ ...filters, city })}
          />
        </FilterSection>
        <FilterSection title="Categories">
          <div className="flex flex-wrap gap-2">
            {eventCategories.map((category) => (
              <FilterChip
                key={category}
                active={filters.categories.includes(category)}
                onClick={() => toggle("categories", category)}
              >
                {filters.categories.includes(category) && (
                  <Check className="h-3 w-3" strokeWidth={3} />
                )}
                {category}
              </FilterChip>
            ))}
          </div>
        </FilterSection>
        <FilterSection title="Vibe">
          <div className="flex flex-wrap gap-2">
            {eventVibes.map((vibe) => (
              <FilterChip
                key={vibe}
                active={filters.vibes.includes(vibe)}
                onClick={() => toggle("vibes", vibe)}
              >
                {filters.vibes.includes(vibe) && (
                  <Check className="h-3 w-3" strokeWidth={3} />
                )}
                {vibe}
              </FilterChip>
            ))}
          </div>
        </FilterSection>
        <FilterSection title={`Distance · ${filters.distance} km`}>
          <input
            type="range"
            min={1}
            max={50}
            value={filters.distance}
            onChange={(event) =>
              onChange({ ...filters, distance: Number(event.target.value) })
            }
            className="w-full accent-[hsl(var(--primary))]"
            style={{ accentColor: "oklch(0.88 0.22 135)" }}
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>1 km</span>
            <span>50 km</span>
          </div>
        </FilterSection>
      </motion.div>
      <div className="relative flex items-center gap-3 border-t border-white/10 px-6 py-4">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-full border border-white/15 bg-white/5 py-3 text-sm font-medium"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          className="flex-[1.6] rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(163,255,64,0.5)]"
        >
          Apply filters
        </button>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </motion.div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-primary/60 bg-primary/15 text-primary" : "border-white/15 bg-white/5 text-foreground/85 hover:bg-white/10"}`}
    >
      {children}
    </button>
  );
}
