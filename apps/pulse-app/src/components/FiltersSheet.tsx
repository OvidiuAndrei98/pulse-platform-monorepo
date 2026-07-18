"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const categories = [
  "Rave",
  "House",
  "Techno",
  "Disco",
  "Festival",
  "Rooftop",
  "Warehouse",
];
const vibes = [
  "Chill",
  "Energetic",
  "Underground",
  "Mainstream",
  "Outdoor",
  "Indoor",
];
const dates = ["Tonight", "Tomorrow", "This weekend", "Next week"];

export function FiltersSheet() {
  const [open, setOpen] = useState(false);
  const [distance, setDistance] = useState(15);
  const [selectedCats, setSelectedCats] = useState<string[]>(["Rave"]);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("Tonight");
  const [mounted, setMounted] = useState(false);

  // Evită erorile de tip Hydration Mismatch în Next.js la folosirea Portalurilor
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="filter-btn"
            layoutId="filter-morph"
            type="button"
            aria-label="Filters"
            onClick={() => setOpen(true)}
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 text-foreground"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(14px) saturate(160%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.05), 0 6px 20px rgba(0,0,0,0.35)",
            }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
          >
            <motion.span
              layoutId="filter-morph-inner"
              className="grid place-items-center"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={2.2} />
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* Fundal întunecat (Scrim) - Forțat pe tot ecranul printr-un z-index maxim global */}
                <motion.div
                  key="scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md"
                />

                {/* Foaia de Filtre (Sheet/Modal) */}
                <motion.div
                  key="sheet"
                  layoutId="filter-morph"
                  className="fixed inset-x-3 bottom-3 top-16 z-[10000] overflow-hidden rounded-[2rem] border border-white/15 text-foreground md:inset-x-auto md:left-1/2 md:top-1/2 md:h-auto md:max-h-[85vh] md:w-[min(32rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2"
                  style={{
                    backgroundColor: "rgba(20,22,20,0.75)",
                    backdropFilter: "blur(28px) saturate(180%)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.05), 0 24px 60px rgba(0,0,0,0.5)",
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                >
                  {/* Gloss sheen */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 40%)",
                    }}
                  />

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
                        onClick={() => setOpen(false)}
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
                        show: {
                          transition: {
                            staggerChildren: 0.05,
                            delayChildren: 0.15,
                          },
                        },
                      }}
                      className="flex-1 space-y-6 overflow-y-auto px-6 pb-4 pt-5"
                    >
                      <Section title="When">
                        <div className="flex flex-wrap gap-2">
                          {dates.map((d) => {
                            const on = selectedDate === d;
                            return (
                              <Chip
                                key={d}
                                active={on}
                                onClick={() => setSelectedDate(d)}
                              >
                                {d}
                              </Chip>
                            );
                          })}
                        </div>
                      </Section>

                      <Section title="Categories">
                        <div className="flex flex-wrap gap-2">
                          {categories.map((c) => {
                            const on = selectedCats.includes(c);
                            return (
                              <Chip
                                key={c}
                                active={on}
                                onClick={() =>
                                  toggle(selectedCats, setSelectedCats, c)
                                }
                              >
                                {on && (
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                )}
                                {c}
                              </Chip>
                            );
                          })}
                        </div>
                      </Section>

                      <Section title="Vibe">
                        <div className="flex flex-wrap gap-2">
                          {vibes.map((v) => {
                            const on = selectedVibes.includes(v);
                            return (
                              <Chip
                                key={v}
                                active={on}
                                onClick={() =>
                                  toggle(selectedVibes, setSelectedVibes, v)
                                }
                              >
                                {on && (
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                )}
                                {v}
                              </Chip>
                            );
                          })}
                        </div>
                      </Section>

                      <Section title={`Distance · ${distance} km`}>
                        <input
                          type="range"
                          min={1}
                          max={50}
                          value={distance}
                          onChange={(e) => setDistance(Number(e.target.value))}
                          className="w-full accent-[hsl(var(--primary))]"
                          style={{ accentColor: "oklch(0.88 0.22 135)" }}
                        />
                        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                          <span>1 km</span>
                          <span>50 km</span>
                        </div>
                      </Section>
                    </motion.div>

                    <div className="relative flex items-center gap-3 border-t border-white/10 px-6 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCats([]);
                          setSelectedVibes([]);
                          setSelectedDate("Tonight");
                          setDistance(15);
                        }}
                        className="flex-1 rounded-full border border-white/15 bg-white/5 py-3 text-sm font-medium"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="flex-[1.6] rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(163,255,64,0.5)]"
                      >
                        Apply filters
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0 },
      }}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </motion.div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors " +
        (active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-white/15 bg-white/5 text-foreground/85 hover:bg-white/10")
      }
    >
      {children}
    </button>
  );
}
