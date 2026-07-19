import { createPortal } from "react-dom";
import { useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  QrCode,
  Ticket,
  Receipt,
  ChevronRight,
  MapPin,
  Calendar,
  Download,
  Wallet,
  User,
  Lock,
  Trash2,
  LogOut,
  Mail,
  Sparkles,
  X,
} from "lucide-react";

type TicketData = {
  id: string;
  event: string;
  date: string;
  time: string;
  location: string;
  type: "VIP" | "Regular" | "Early Bird";
  hash: string;
};

const activeTickets: TicketData[] = [
  {
    id: "TCK-8821",
    event: "Neon Warehouse — Techno Night",
    date: "Sat, 21 Nov 2026",
    time: "23:00",
    location: "Expirat, Str. Halelor 5, București",
    type: "VIP",
    hash: "a1f4c9b2e8d7",
  },
  {
    id: "TCK-8734",
    event: "Sunset Rooftop w/ Barac",
    date: "Fri, 04 Dec 2026",
    time: "20:30",
    location: "Nomad Skybar, București",
    type: "Regular",
    hash: "77bde12aa903",
  },
];

type Order = {
  id: string;
  event: string;
  date: string;
  amount: string;
  status: "completed" | "refunded" | "failed";
  stripeId: string;
};

const orderHistory: Order[] = [
  {
    id: "ORD-1042",
    event: "Neon Warehouse",
    date: "12 Nov 2026",
    amount: "220.00 RON",
    status: "completed",
    stripeId: "pi_3PxQ2k…9f",
  },
  {
    id: "ORD-1039",
    event: "Sunset Rooftop",
    date: "08 Nov 2026",
    amount: "150.00 RON",
    status: "completed",
    stripeId: "pi_3PwLm1…2c",
  },
];

const statusStyles: Record<Order["status"], string> = {
  completed: "bg-primary/15 text-primary border-primary/30",
  refunded: "bg-white/10 text-muted-foreground border-white/15",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function Profile() {
  const [tab, setTab] = useState<"active" | "history">("active");
  const [openTicket, setOpenTicket] = useState<TicketData | null>(null);

  return (
    <div className="relative min-h-screen w-full bg-background pb-40 text-foreground overflow-y-auto">
      {/* Pe mobil constrângem layout-ul la max-w-md original. Pe desktop se deschide la max-w-7xl. */}
      <div className="mx-auto max-w-md px-5 pt-10 md:max-w-7xl md:px-8 md:pt-16">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12 items-start">
          {/* COLOANA STÂNGA: Profil și Securitate (Blocat pe desktop) */}
          <div className="md:col-span-4 md:sticky md:top-16 space-y-6">
            <header className="flex items-center gap-4">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-white/5 ring-2 ring-primary/50 flex items-center justify-center">
                  <User className="h-10 w-10 text-muted-foreground" />
                </div>
                <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  PRO
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  Sarah Johnson
                </h1>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> sarah.j@mail.com
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Member since 2026
                </div>
              </div>
            </header>

            {/* Securitatea (Apare sub header pe ambele platforme, integrată curat în flux) */}
            <section className="hidden md:block">
              <h2 className="mb-3 text-lg font-semibold">Account & Security</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Row
                  icon={User}
                  label="Personal details"
                  hint="Name, phone number"
                />
                <Row icon={Lock} label="Change password" />
                <Row icon={Trash2} label="Delete account" danger />
              </div>
            </section>

            <button className="hidden md:flex mountaineer w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>

          {/* COLOANA DREAPTĂ: Biletele originale (Mobil folosește tab-uri, Desktop le arată direct) */}
          <div className="md:col-span-8 space-y-8">
            {/* Secțiunea Bilete & Comenzi */}
            <section className="md:border md:border-white/5 md:bg-white/[0.01] md:p-6 md:rounded-3xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">My Tickets & Orders</h2>

                {/* Selectorul de tab-uri: Activ DOAR pe mobil. Pe desktop ascundem tab-ul fiindcă arătăm tot. */}
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 md:hidden">
                  <TabBtn
                    active={tab === "active"}
                    onClick={() => setTab("active")}
                  >
                    <Ticket className="h-3.5 w-3.5" /> Active
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px] text-primary">
                      {activeTickets.length}
                    </span>
                  </TabBtn>
                  <TabBtn
                    active={tab === "history"}
                    onClick={() => setTab("history")}
                  >
                    <Receipt className="h-3.5 w-3.5" /> History
                  </TabBtn>
                </div>
              </div>

              {/* RENDER MOBIL (bazat pe tab-ul selectat) */}
              <div className="md:hidden">
                {tab === "active" ? (
                  <div className="space-y-3">
                    {activeTickets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setOpenTicket(t)}
                        className="group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 text-left transition hover:bg-white/[0.08]"
                      >
                        <div className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-2 pl-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                {t.type}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm font-medium">
                              {t.event}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {t.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {t.time}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center pr-3 text-primary">
                          <QrCode className="h-5 w-5" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
                    {orderHistory.map((o) => (
                      <div key={o.id} className="flex items-center gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {o.event}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                            {o.date} · {o.id} · {o.stripeId}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">
                            {o.amount}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${statusStyles[o.status]}`}
                          >
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RENDER DESKTOP (fără taburi, așezate paralel, păstrând stilul curat de listă) */}
              <div className="hidden md:grid md:grid-cols-1 md:gap-6">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Ticket className="h-4 w-4" /> Active Tickets (
                    {activeTickets.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {activeTickets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setOpenTicket(t)}
                        className="group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/[0.08]"
                      >
                        <div className="flex min-w-0 flex-1 flex-col justify-between py-1 px-1">
                          <div>
                            <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {t.type}
                            </span>
                            <p className="mt-2 text-sm font-medium line-clamp-1">
                              {t.event}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-4">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {t.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {t.time}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center pr-2 text-primary">
                          <QrCode className="h-6 w-6" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Order History
                  </h3>
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
                    {orderHistory.map((o) => (
                      <div key={o.id} className="flex items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.event}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {o.date} · {o.id} ·{" "}
                            <span className="font-mono text-zinc-500">
                              {o.stripeId}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-sm font-semibold">
                            {o.amount}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${statusStyles[o.status]}`}
                          >
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Secțiunile de Setări de Mobil (Rămân neschimbate în fluxul vertical de mobil) */}
            <div className="space-y-6 md:hidden">
              <section>
                <h2 className="mb-3 text-lg font-semibold">
                  Account & Security
                </h2>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  <Row
                    icon={User}
                    label="Personal details"
                    hint="Name, phone number"
                  />
                  <Row icon={Lock} label="Change password" />
                  <Row icon={Trash2} label="Delete account" danger />
                </div>
              </section>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold md:text-sm md:font-medium md:text-muted-foreground">
                Support & Legal
              </h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <Row
                  icon={ChevronRight}
                  label="Help & Support"
                  hint="Ticket or payment issues"
                />
                <Row icon={ChevronRight} label="Terms & Conditions" />
                <Row icon={ChevronRight} label="Privacy policy" />
              </div>
            </section>

            <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15 md:hidden">
              <LogOut className="h-4 w-4" /> Log out
            </button>

            <p className="text-center text-[10px] text-muted-foreground/60 md:text-left">
              Eventify · v1.0.0
            </p>
          </div>
        </div>
      </div>

      {/* TICKET DRAWER/MODAL COMPLET RESPONSIVE */}
      <AnimatePresence>
        {openTicket && (
          <TicketModal
            ticket={openTicket}
            onClose={() => setOpenTicket(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// RESTUL COMPONENTELOR ATOMICE (TICKETMODAL, ROW, TABBTN, FAUXQR) RĂMÂN EXACT CELE MAI SUS
function TicketModal({
  ticket,
  onClose,
}: {
  ticket: TicketData;
  onClose: () => void;
}) {
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (window.innerWidth < 768 && info.offset.y > 100) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center md:justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm md:hidden"
      />

      <motion.div
        initial={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
        animate={window.innerWidth >= 768 ? { x: 0 } : { y: 0 }}
        exit={window.innerWidth >= 768 ? { x: "100%" } : { y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        drag={window.innerWidth >= 768 ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.75 }}
        onDragEnd={handleDragEnd}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-neutral-950 p-6 pb-10 border border-white/10 shadow-2xl overflow-y-auto
                   rounded-t-3xl sm:rounded-b-3xl md:rounded-none md:h-screen md:max-w-md md:border-t-0 md:border-b-0 md:border-l md:pb-6"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
        }}
      >
        <div className="absolute left-0 right-0 top-3 flex justify-center md:hidden">
          <div className="h-1.5 w-12 rounded-full bg-white/20" />
        </div>

        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mt-4 flex items-center gap-2 md:mt-6">
          <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {ticket.type}
          </span>
          <span className="text-[11px] text-muted-foreground">{ticket.id}</span>
        </div>

        <h3 className="mt-2 text-xl font-bold leading-snug tracking-tight text-white">
          {ticket.event}
        </h3>

        <div className="mt-6 flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-xl">
            <FauxQR seed={ticket.hash} />
          </div>
        </div>

        <div className="mt-6 space-y-3 border-t border-b border-white/5 py-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4 shrink-0" />{" "}
            <span>
              {ticket.date} · {ticket.time}
            </span>
          </div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(ticket.location)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-2 text-primary underline-offset-2 hover:underline"
          >
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="leading-tight">{ticket.location}</span>
          </a>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium transition hover:bg-white/10 text-white">
            <Wallet className="h-4 w-4 text-primary" /> Add to Wallet
          </button>
          <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium transition hover:bg-white/10 text-white">
            <Download className="h-4 w-4" /> PDF
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-primary text-primary-foreground font-semibold"
          : "text-muted-foreground hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3.5 text-left last:border-b-0 transition hover:bg-white/[0.04] ${
        danger ? "text-red-400" : "text-white"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${danger ? "bg-red-500/10" : "bg-white/5"}`}
      >
        <Icon
          className={`h-4 w-4 ${danger ? "text-red-400" : "text-muted-foreground"}`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && (
          <p className="truncate text-[11px] text-muted-foreground mt-0.5">
            {hint}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function FauxQR({ seed }: { seed: string }) {
  const size = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < size * size; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    cells.push((h & 1) === 1);
  }
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
  };
  const finderPixel = (r: number, c: number) => {
    const inRing = (br: number, bc: number) => {
      const rr = r - br,
        cc = c - bc;
      if (rr < 0 || rr > 6 || cc < 0 || cc > 6) return null;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      if (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) return true;
      return false;
    };
    return inRing(0, 0) ?? inRing(0, size - 7) ?? inRing(size - 7, 0) ?? false;
  };
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${size}, 6px)`, gap: 0 }}
    >
      {Array.from({ length: size * size }).map((_, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const on = isFinder(r, c) ? finderPixel(r, c) : cells[i];
        return (
          <div
            key={i}
            style={{ width: 6, height: 6, background: on ? "#000" : "#fff" }}
          />
        );
      })}
    </div>
  );
}
