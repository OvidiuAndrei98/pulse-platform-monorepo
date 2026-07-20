"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  ShieldCheck,
  Calendar,
  Plus,
  Menu,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const items = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/dashboard/profile", label: "Profil", icon: User },
  { href: "/dashboard/verify", label: "Verificare", icon: ShieldCheck },
  { href: "/dashboard/events", label: "Evenimente", icon: Calendar },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-8 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Eventify
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Organizer</h2>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((it) => {
          const active = isActive(it.href, "exact" in it ? it.exact : false);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
                (active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground")
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}

        <div className="pt-3">
          <Link
            href="/dashboard/events/new"
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            <Plus className="h-4 w-4" />
            Event nou
          </Link>
        </div>
      </nav>

      <div className="p-4 text-[10px] text-muted-foreground/70">
        © {new Date().getFullYear()} Eventify
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-white/10 bg-background/80 backdrop-blur-xl md:flex md:flex-col">
        <SidebarBody />
      </aside>

      {/* Mobile menu button */}
      <button
        type="button"
        aria-label="Deschide meniul"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-3 z-40 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-background/70 text-foreground backdrop-blur-xl md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
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
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-white/10 bg-background shadow-2xl"
            >
              <button
                type="button"
                aria-label="Închide meniul"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground"
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
