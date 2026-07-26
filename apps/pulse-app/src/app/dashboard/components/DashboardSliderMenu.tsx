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
  WalletCards,
} from "lucide-react";
import { useDataProvider } from "@/core/DataProviderContext";

const organizerTabs = [
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
  { href: "/dashboard/events/new", label: "Event nou", icon: Plus },
] as const;

const validatorTabs = [
  { href: "/users/me", label: "Profil", icon: User, exact: true },
  { href: "/dashboard/ticket-validation", label: "Validare bilete", icon: QrCode },
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
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer } = useDataProvider();
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
    ? [{ label: "Dashboard", href: "/dashboard" }]
    : [{ label: "Profil", href: "/users/me" }];

  if (active && active.href !== (isOrganizer ? "/dashboard" : "/users/me")) {
    crumbs.push({ label: active.label, href: active.href });
  }
  if (isEventDetail) crumbs.push({ label: "Detalii" });

  return (
    <header className="sticky top-0 z-20 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-3 pb-2.5 pl-16 md:pl-6">
        {/* BREADCRUMB NAVIGATION */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
              {c.href && i < crumbs.length - 1 ? (
                <Link
                  href={c.href}
                  className="rounded-lg px-2 py-0.5 transition hover:bg-white/5 hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="rounded-lg bg-white/5 px-2 py-0.5 font-semibold text-foreground">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>

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
            {tabs.map((t) => {
              const isActive = active?.href === t.href;
              const Icon = t.icon;

              return (
                <motion.button
                  key={t.href}
                  type="button"
                  onTap={() => router.push(t.href)}
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
                  <span className="relative z-10">{t.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      </div>
    </header>
  );
}
