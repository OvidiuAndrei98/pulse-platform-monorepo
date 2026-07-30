"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronRight,
  LayoutDashboard,
  User,
  QrCode,
  Calendar,
  Plus,
  Ticket,
  WalletCards,
} from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { useTranslation } from "react-i18next";

const organizerTabs = [
  {
    href: "/dashboard",
    label: "dashboardNav.dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/profile", label: "dashboardNav.profile", icon: User },
  { href: "/dashboard/ticket-validation", label: "dashboardNav.ticketValidation", icon: QrCode },
  { href: "/dashboard/finance", label: "dashboardNav.finance", icon: WalletCards },
  { href: "/dashboard/purchases", label: "dashboardNav.purchases", icon: Ticket },
  { href: "/dashboard/events", label: "dashboardNav.events", icon: Calendar },
  { href: "/dashboard/events/new", label: "dashboardNav.newEvent", icon: Plus },
] as const;

const validatorTabs = [
  { href: "/users/me", label: "dashboardNav.profile", icon: User, exact: true },
  { href: "/dashboard/ticket-validation", label: "dashboardNav.ticketValidation", icon: QrCode },
] as const;

function matchTab(pathname: string, tabs: readonly { href: string; label: string; icon: typeof User; exact?: boolean }[]) {
  const sorted = [...tabs].sort((a, b) => b.href.length - a.href.length);
  return sorted.find((t) =>
    "exact" in t && t.exact
      ? pathname === t.href
      : pathname === t.href || pathname.startsWith(t.href + "/"),
  );
}

export function OrganizerHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer, user, loading } = useDataProvider();
  const tabs = isOrganizer ? organizerTabs : validatorTabs;
  const active = matchTab(pathname, tabs);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });

  useEffect(() => {
    const el = sliderRef.current;
    if (!el || !el.parentElement) return;
    const update = () => {
      const left = Math.min(0, el.parentElement!.clientWidth - el.scrollWidth);
      setDragConstraints({ left, right: 0 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tabs.length]);

  const isEventDetail =
    isOrganizer && /^\/dashboard\/events\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
  const crumbs: { label: string; href?: string }[] = isOrganizer
    ? [{ label: "dashboardNav.dashboard", href: "/dashboard" }]
    : [{ label: "dashboardNav.profile", href: "/users/me" }];

  if (active && active.href !== (isOrganizer ? "/dashboard" : "/users/me")) {
    crumbs.push({ label: active.label, href: active.href });
  }
  if (isEventDetail) crumbs.push({ label: "dashboardNav.details" });

  return (
    <header className="sticky top-0 z-20 -mt-[var(--native-safe-top)] w-full border-b border-white/10 bg-[#0b0e0c] pt-[var(--native-safe-top)] md:mt-0 md:pt-0 md:bg-background/60 md:backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-3 pb-2.5 pl-16 md:pl-6">
        {/* BREADCRUMB NAVIGATION */}
        <div className="flex items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />}
                {c.href && i < crumbs.length - 1 ? (
                  <Link
                    href={c.href}
                    className="truncate rounded-lg px-2 py-0.5 transition hover:bg-white/5 hover:text-foreground"
                  >
                    {t(c.label)}
                  </Link>
                ) : (
                  <span className="truncate rounded-lg bg-white/5 px-2 py-0.5 font-semibold text-foreground">
                    {t(c.label)}
                  </span>
                )}
              </span>
            ))}
          </nav>
          {!loading && user && (
            <div className="relative h-10 w-10 shrink-0">
              <NotificationsPopover />
            </div>
          )}
        </div>

        {/* MOBILE TAB SLIDER (H-11 CONSISTENT, SLIDING INDICATOR) */}
        <div className="mt-3 -mx-4 overflow-hidden md:hidden">
          <motion.div
            ref={sliderRef}
            drag="x"
            dragConstraints={dragConstraints}
            dragElastic={0.05}
            dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
            className="flex cursor-grab items-center gap-1.5 px-4 pb-1 active:cursor-grabbing"
          >
            {tabs.map((tab) => {
              const isActive = active?.href === tab.href;
              const Icon = tab.icon;

              return (
                <motion.button
                  key={tab.href}
                  type="button"
                  onTap={() => router.push(tab.href)}
                  className="relative flex h-9 shrink-0 select-none items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-semibold transition-colors duration-200"
                  style={{
                    color: isActive
                      ? "var(--primary-foreground)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {/* Sliding Background pe Tab Activ */}
                  {isActive && (
                    <motion.div
                      layoutId="activeHeaderTab"
                      className="absolute inset-0 rounded-xl bg-primary"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                    />
                  )}

                  <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                  <span className="relative z-10">{t(tab.label)}</span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      </div>
    </header>
  );
}
