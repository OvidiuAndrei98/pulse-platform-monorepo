"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  QrCode,
  Calendar,
  Plus,
  Menu,
  X,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";

const organizerItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/profile", label: "Profil", icon: User },
  { href: "/dashboard/ticket-validation", label: "Validare bilete", icon: QrCode },
  { href: "/dashboard/finance", label: "Finante", icon: WalletCards },
  { href: "/dashboard/events", label: "Evenimente", icon: Calendar },
] as const;

const validatorItems = [
  { href: "/users/me", label: "Profil", icon: User, exact: true },
  { href: "/dashboard/ticket-validation", label: "Validare bilete", icon: QrCode },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isOrganizer } = useDataProvider();
  const items = isOrganizer ? organizerItems : validatorItems;

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full flex-col justify-between">
      {/* HEADER & NAV */}
      <div>
        <div className="px-5 pt-8 pb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
            Eventify
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
            {isOrganizer ? "Organizer" : "Validare bilete"}
          </h2>
        </div>

        {/* Navigation Items */}
        <nav className="relative space-y-1 px-3">
          {items.map((it) => {
            const active = isActive(it.href, "exact" in it ? it.exact : false);
            const Icon = it.icon;

            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                className="relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-xs font-semibold transition-colors duration-200 z-10"
                style={{
                  color: active ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                {/* Pastilă animată doar pe tab-ul activ */}
                {active && (
                  <motion.div
                    layoutId="activeSidebarItem"
                    className="absolute inset-0 rounded-xl bg-primary/15 border border-primary/20"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}

                <Icon className="relative z-10 h-4 w-4 shrink-0" />
                <span className="relative z-10">{it.label}</span>
              </Link>
            );
          })}

          {/* Quick Action - Event Nou */}
          {isOrganizer && (
            <div className="pt-3">
              <Link
                href="/dashboard/events/new"
                onClick={onNavigate}
                className="flex h-11 items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 text-xs font-bold text-primary transition hover:bg-primary/20 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                <span>Event nou</span>
              </Link>
            </div>
          )}
        </nav>
      </div>

      {/* FOOTER */}
      <div className="p-4 text-[10px] font-medium text-muted-foreground/60">
        © {new Date().getFullYear()} Eventify. All rights reserved.
      </div>
    </div>
  );
}

export function OrganizerSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Închide sertarul automat când se schimbă ruta
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Previne scroll-ul pe body când meniul mobil este deschis
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* DESKTOP SIDEBAR - Optimizat fundalul transparent + backdrop-blur */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/10 bg-background/40 backdrop-blur-xl md:flex md:flex-col">
        <SidebarBody />
      </aside>

      {/* MOBILE MENU BUTTON - Blur optimizat cu opacitate de fundal */}
      <button
        type="button"
        aria-label="Deschide meniul"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-3.5 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-background/40 text-foreground backdrop-blur-md transition hover:bg-background/60 active:scale-95 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* MOBILE DRAWER */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Sliding Panel - Efect frosted glass accentuat cu backdrop-blur-2xl și opacitate 80% */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 || info.velocity.x < -300)
                  setOpen(false);
              }}
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-white/10 bg-background/80 backdrop-blur-2xl shadow-2xl"
            >
              <button
                type="button"
                aria-label="Închide meniul"
                onClick={() => setOpen(false)}
                className="absolute right-3.5 top-3.5 flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-background/50 text-muted-foreground backdrop-blur-md transition hover:text-foreground active:scale-95 z-20"
              >
                <X className="h-4 w-4" />
              </button>

              <SidebarBody onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
