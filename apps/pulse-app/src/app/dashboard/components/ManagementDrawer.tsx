"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useDrawerViewport } from "@/components/ui/useDrawerViewport";

export function ManagementDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const viewportRef = useDrawerViewport(open && mounted, "panel");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div ref={viewportRef} data-drawer-viewport className="fixed inset-0 z-[240]">
          <motion.button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/10 bg-[#0b0d0c] shadow-[-24px_0_70px_rgba(0,0,0,0.5)] sm:w-[min(30rem,92vw)]"
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-white/10 px-5 pb-4 pt-[max(1.25rem,var(--native-safe-top))] sm:px-6 sm:pt-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                {subtitle && <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(2rem,var(--native-safe-bottom))] sm:px-6">
              {children}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
