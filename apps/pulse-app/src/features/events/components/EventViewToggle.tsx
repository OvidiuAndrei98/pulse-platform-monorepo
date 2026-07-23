"use client";

import { motion } from "framer-motion";
import { List, Map as MapIcon } from "lucide-react";

export function EventViewToggle({
  view,
  onChange,
}: {
  view: "list" | "map";
  onChange: (view: "list" | "map") => void;
}) {
  return (
    <div
      className="relative inline-flex h-[44px] items-center rounded-full p-1"
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        backdropFilter: "blur(14px) saturate(160%)",
        WebkitBackdropFilter: "blur(14px) saturate(160%)",
        boxShadow:
          "rgba(255, 255, 255, 0.18) 0px 1px 0px inset, rgba(255, 255, 255, 0.05) 0px -1px 0px inset, rgba(0, 0, 0, 0.35) 0px 6px 20px",
        opacity: 1,
      }}
    >
      {["list", "map"].map((item) => {
        const active = view === item;

        return (
          <button
            key={item}
            onClick={() => onChange(item as "list" | "map")}
            className={`relative z-10 flex h-full min-w-[72px] items-center justify-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors duration-200 ${
              active ? "text-black" : "text-white/70 hover:text-white"
            }`}
          >
            {active && (
              <motion.div
                layoutId="toggle-pill"
                className="absolute inset-[1px] -z-10 rounded-full bg-primary"
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
                <span className="hidden sm:inline">List</span>
              </>
            ) : (
              <>
                <MapIcon className="h-4 w-4 transition-colors" />
                <span className="hidden sm:inline">Map</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
