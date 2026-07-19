"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronRight,
  LayoutDashboard,
  User,
  ShieldCheck,
  Calendar,
  Plus,
} from "lucide-react";

const tabs = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/profile", label: "Profil", icon: User },
  { href: "/dashboard/verify", label: "Verificare", icon: ShieldCheck },
  { href: "/dashboard/events", label: "Evenimente", icon: Calendar },
  { href: "/dashboard/events/new", label: "Event nou", icon: Plus },
] as const;

function matchTab(pathname: string) {
  // Cel mai lung match câștigă
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
  const active = matchTab(pathname);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const update = () => {
      const left = Math.min(0, el.parentElement!.clientWidth - el.scrollWidth);
      setDragConstraints({ left, right: 0 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Breadcrumb: Organizer > <active label> (> extra if deeper)
  const isEventDetail =
    /^\/dashboard\/events\/[^/]+$/.test(pathname) && !pathname.endsWith("/new");
  const crumbs: { label: string; href?: string }[] = [
    { label: "Dashboard", href: "/dashboard" },
  ];

  if (active && active.href !== "/dashboard") {
    crumbs.push({ label: active.label, href: active.href });
  }
  if (isEventDetail) crumbs.push({ label: "Detalii" });

  return (
    <div className="sticky top-0 z-20 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-5 pt-3 pb-2 pl-16 md:pl-5">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
        >
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
              {c.href && i < crumbs.length - 1 ? (
                <Link
                  href={c.href}
                  className="hover:text-foreground transition"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground/90 font-medium">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Tab slider — draggable pe mobil, ascuns pe desktop */}
        <div className="mt-2 -mx-5 overflow-hidden md:hidden">
          <motion.div
            ref={sliderRef}
            drag="x"
            dragConstraints={dragConstraints}
            dragElastic={0.05}
            dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
            className="flex cursor-grab items-center gap-1.5 px-5 pb-1 active:cursor-grabbing"
          >
            {tabs.map((t) => {
              const isActive = active?.href === t.href;
              return (
                <motion.button
                  key={t.href}
                  type="button"
                  onTap={() => router.push(t.href)}
                  className={
                    "inline-flex shrink-0 select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition " +
                    (isActive
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground")
                  }
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
