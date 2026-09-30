"use client";

import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { useDrawerViewport } from "@/components/ui/useDrawerViewport";

import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { defaultEventFilters } from "@/features/events/constants";
import { EventFilters } from "@/features/events/types";
import { EventFiltersPanel } from "@/features/events/filters/EventFiltersPanel";

type FiltersSheetProps = {
  value?: EventFilters;
  onChange?: (value: EventFilters) => void;
};

export function FiltersSheet({ value, onChange }: FiltersSheetProps = {}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useBackLayer(open, () => setOpen(false));
  const [filters, setFilters] = useState<EventFilters>(
    value ?? defaultEventFilters,
  );
  const [mounted, setMounted] = useState(false);
  const viewportRef = useDrawerViewport(open && mounted);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open && value) setFilters(value);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const reset = () => {
    setFilters(defaultEventFilters);
    onChange?.(defaultEventFilters);
  };
  const apply = () => {
    onChange?.(filters);
    setOpen(false);
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="filter-btn"
            layoutId="filter-morph"
            type="button"
            aria-label={t("common.filters")}
            onClick={() => setOpen(true)}
            className="group grid h-[44px] w-[44px] shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 md:backdrop-blur-md bg-[#121418]/85 md:bg-white/[0.06] text-white/70 shadow-lg transition-colors hover:text-white transform-gpu"
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <motion.span
              layoutId="filter-morph-inner"
              className="grid place-items-center"
            >
              <SlidersHorizontal
                className="h-4 w-4 transition-colors"
                strokeWidth={2.2}
              />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm md:bg-black/60 transform-gpu"
                />
                <motion.div
                  key="sheet"
                  ref={viewportRef}
                  data-drawer-viewport
                  layoutId="filter-morph"
                  className="fixed inset-x-3 bottom-3 top-16 z-[10000] overflow-hidden rounded-lg border border-white/15 bg-[#141414]/95 text-foreground shadow-2xl backdrop-blur-xl md:inset-x-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[85vh] md:w-[min(32rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:bg-[#141414]/85 md:backdrop-blur-2xl transform-gpu"
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"
                  />
                  <EventFiltersPanel
                    filters={filters}
                    onChange={setFilters}
                    onClose={() => setOpen(false)}
                    onReset={reset}
                    onApply={apply}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
