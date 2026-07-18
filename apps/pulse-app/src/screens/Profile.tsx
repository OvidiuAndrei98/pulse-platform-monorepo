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
  Bell,
  User,
  Lock,
  Trash2,
  Heart,
  HelpCircle,
  FileText,
  LogOut,
  Phone,
  Mail,
  Sparkles,
  X,
} from "lucide-react";
// import avatar from "@/assets/avatar-sarah.jpg";
// import partyImage from "@/assets/party-event.jpg";

type TicketData = {
  id: string;
  event: string;
  date: string;
  time: string;
  location: string;
  type: "VIP" | "Regular" | "Early Bird";
  //   image: string;
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
    // image: partyImage,
    hash: "a1f4c9b2e8d7",
  },
  {
    id: "TCK-8734",
    event: "Sunset Rooftop w/ Barac",
    date: "Fri, 04 Dec 2026",
    time: "20:30",
    location: "Nomad Skybar, București",
    type: "Regular",
    // image: partyImage,
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
  {
    id: "ORD-1021",
    event: "Bass Church",
    date: "22 Oct 2026",
    amount: "90.00 RON",
    status: "refunded",
    stripeId: "pi_3PoAa8…1d",
  },
  {
    id: "ORD-1010",
    event: "Underground Vol.4",
    date: "05 Oct 2026",
    amount: "0.00 RON",
    status: "failed",
    stripeId: "pi_3Pn9Zz…4a",
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
  const [notif, setNotif] = useState({
    lowStock: true,
    changes: true,
    artists: false,
  });
  const favCats = ["Social", "Music", "Fashion", "Rave", "House", "Techno"];
  const [favs, setFavs] = useState<string[]>(["Music", "Techno"]);

  const toggleFav = (c: string) =>
    setFavs((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]));

  return (
    <div className="relative min-h-screen h-full overflow-y-auto bg-background pb-40 text-foreground">
      <div className="mx-auto max-w-md px-5 pt-10">
        {/* 1. Header */}
        <header className="flex items-center gap-4">
          <div className="relative">
            {/* <img
              src={avatar}
              alt="Sarah Johnson"
              className="h-20 w-20 rounded-full object-cover ring-2 ring-primary/50"
            /> */}
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

        {/* 2. My Tickets & Orders */}
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">My Tickets & Orders</h2>
          </div>

          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
            <TabBtn active={tab === "active"} onClick={() => setTab("active")}>
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

          {tab === "active" ? (
            <div className="mt-4 space-y-3">
              {activeTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTicket(t)}
                  className="group flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 text-left transition hover:bg-white/[0.08]"
                >
                  {/* <img
                    src={t.image}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  /> */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-1 pr-2">
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
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {t.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {t.time}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center pr-2 text-primary">
                    <QrCode className="h-5 w-5" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/5">
              {orderHistory.map((o) => (
                <div key={o.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{o.event}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {o.date} · {o.id} · {o.stripeId}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{o.amount}</span>
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
        </section>

        {/* 3. Account Settings */}
        <Section title="Account & Security">
          <Row icon={User} label="Personal details" hint="Name, phone number" />
          <Row icon={Phone} label="Phone number" hint="+40 7•• ••• 321" />
          <Row icon={Lock} label="Change password" />
          <Row icon={Trash2} label="Delete account" danger />
        </Section>

        {/* 4. Preferences & Notifications */}
        <Section title="Notifications">
          <ToggleRow
            icon={Bell}
            label="Low stock alerts"
            hint="When tickets are almost sold out"
            value={notif.lowStock}
            onChange={(v) => setNotif((n) => ({ ...n, lowStock: v }))}
          />
          <ToggleRow
            icon={Calendar}
            label="Schedule changes"
            hint="Event updates or cancellations"
            value={notif.changes}
            onChange={(v) => setNotif((n) => ({ ...n, changes: v }))}
          />
          <ToggleRow
            icon={Heart}
            label="Favorite artists"
            hint="New events from artists you love"
            value={notif.artists}
            onChange={(v) => setNotif((n) => ({ ...n, artists: v }))}
          />
        </Section>

        <Section title="Favorite categories">
          <div className="flex flex-wrap gap-2 px-1 pb-1 pt-2">
            {favCats.map((c) => {
              const on = favs.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleFav(c)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 5. Support & Legal */}
        <Section title="Support & Legal">
          <Row
            icon={HelpCircle}
            label="Help & Support"
            hint="Ticket or payment issues"
          />
          <Row icon={FileText} label="Terms & Conditions" />
          <Row icon={FileText} label="Privacy policy" />
        </Section>

        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15">
          <LogOut className="h-4 w-4" /> Log out
        </button>

        <p className="mt-6 text-center text-[10px] text-muted-foreground/60">
          Eventify · v1.0.0
        </p>
      </div>

      {/* Ticket detail modal */}
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
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
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
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {children}
      </div>
    </section>
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
        danger ? "text-red-400" : ""
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          danger ? "bg-red-500/10" : "bg-white/5"
        }`}
      >
        <Icon
          className={`h-4 w-4 ${danger ? "text-red-400" : "text-muted-foreground"}`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && (
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  hint,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3.5 last:border-b-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {hint && (
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
          value
            ? "border-primary/40 bg-primary/70"
            : "border-white/10 bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${
            value ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function TicketModal({
  ticket,
  onClose,
}: {
  ticket: TicketData;
  onClose: () => void;
}) {
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100) onClose();
  };

  // Folosim createPortal pentru a scoate modalul din containerul cu "overflow-hidden"
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.75 }}
        onDragEnd={handleDragEnd}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-neutral-950 p-6 pb-10 sm:rounded-3xl sm:pb-6"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0) 40%)",
        }}
      >
        {/* Drag handle */}
        <div className="absolute left-0 right-0 top-3 flex justify-center">
          <div className="h-1.5 w-12 rounded-full bg-white/20" />
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {ticket.type}
          </span>
          <span className="text-[11px] text-muted-foreground">{ticket.id}</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold leading-tight">
          {ticket.event}
        </h3>

        <div className="mt-5 flex justify-center">
          <div className="rounded-2xl bg-white p-4 shadow-xl">
            <FauxQR seed={ticket.hash} />
          </div>
        </div>

        <div className="mt-5 space-y-2 text-sm">
          <InfoLine icon={Calendar} text={`${ticket.date} · ${ticket.time}`} />
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(ticket.location)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-primary underline-offset-2 hover:underline"
          >
            <MapPin className="h-4 w-4" /> {ticket.location}
          </a>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium transition hover:bg-white/10">
            <Wallet className="h-4 w-4" /> Add to Wallet
          </button>
          <button className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium transition hover:bg-white/10">
            <Download className="h-4 w-4" /> PDF
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body, // Îl randăm direct în body-ul paginii globale
  );
}

function InfoLine({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4" /> <span>{text}</span>
    </div>
  );
}

function FauxQR({ seed }: { seed: string }) {
  // Deterministic 21x21 grid from seed for a QR-like look
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
