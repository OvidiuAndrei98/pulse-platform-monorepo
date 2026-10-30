"use client";

import { motion } from "framer-motion";
import { List, Map as MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function EventViewToggle({
  view,
  onChange,
}: {
  view: "list" | "map";
  onChange: (view: "list" | "map") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative inline-flex h-[44px] items-center rounded-full p-1 border border-white/10 bg-[#121418]/85 md:bg-white/[0.06] md:backdrop-blur-md shadow-[rgba(255,255,255,0.18)_0px_1px_0px_inset,rgba(0,0,0,0.35)_0px_6px_20px] transform-gpu">
      {["list", "map"].map((item) => {
        const active = view === item;

        return (
          <button
            key={item}
            type="button"
            data-testid={'events-'+item+'-toggle'}
            aria-label={t(item==='list'?'eventMap.list':'eventMap.map')}
            onClick={() => onChange(item as "list" | "map")}
            className={`relative z-10 flex h-full min-w-[72px] items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors duration-200 ${
              active ? "text-black" : "text-white/70 hover:text-white"
            }`}
          >
            {active && (
              <motion.div
                layoutId="toggle-pill"
                className="absolute inset-[1px] -z-10 rounded-full bg-primary transform-gpu"
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}

            {item === "list" ? (
              <>
                <List className="h-4 w-4 transition-colors" />
                <span className="hidden sm:inline">{t("eventMap.list")}</span>
              </>
            ) : (
              <>
                <MapIcon className="h-4 w-4 transition-colors" />
                <span className="hidden sm:inline">{t("eventMap.map")}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
