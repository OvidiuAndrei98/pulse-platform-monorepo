"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReadableSchema } from "@packages/api-client/src/Client";
import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { TicketPass } from "./TicketPass";
import { TicketPdfButton } from "./TicketPdfButton";

type UserTicket = ReadableSchema<"UserTicketResponse">;
function ticketStatus(ticket: UserTicket, now: number) {
  if (ticket.isValidated) return "used";
  return new Date(ticket.endTime).getTime() <= now ? "expired" : "active";
}

export function TicketPreview({
  ticket,
  tickets = [ticket],
  now = Date.now(),
  onSelect,
  onClose,
}: {
  ticket: UserTicket;
  tickets?: UserTicket[];
  now?: number;
  onSelect?: (ticket: UserTicket) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [isDesktop, setIsDesktop] = useState(false);
  const reducedMotion = useReducedMotion();
  const index = tickets.findIndex(item => item.id === ticket.id);
  const status = ticketStatus(ticket, now);
  useBackLayer(true, onClose);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const content = (
    <div data-ticket-preview={ticket.id} className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 md:px-6 md:pt-6">
      {tickets.length > 1 && <div className="mb-3 flex items-center justify-between gap-3">
        <button type="button" aria-label={t("tickets.previousTicket")} disabled={index <= 0} onClick={() => onSelect?.(tickets[index - 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft className="h-5 w-5" /></button>
        <p aria-live="polite" className="text-sm font-semibold tabular-nums">{t("tickets.ticketPosition", { current: index + 1, total: tickets.length })}</p>
        <button type="button" aria-label={t("tickets.nextTicket")} disabled={index >= tickets.length - 1} onClick={() => onSelect?.(tickets[index + 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className="h-5 w-5" /></button>
      </div>}
      {status !== "active" && <p className="mt-5 text-center text-sm font-semibold text-primary">
        {t(status === "used" ? "tickets.alreadyUsed" : "tickets.eventEnded")}
      </p>}
      <div className="mt-5"><TicketPass ticket={ticket} /></div>
      <a href={`https://maps.google.com/?q=${encodeURIComponent(ticket.locationName)}`} target="_blank" rel="noreferrer" className="mt-4 flex min-h-11 items-center gap-2 text-sm text-primary"><MapPin className="h-4 w-4" />{ticket.locationName}</a>
      <TicketPdfButton
        key={ticket.id}
        ticket={ticket}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60"
      />
    </div>
  );

  if (!isDesktop) {
    return (
      <Drawer
        historyBack={false}
        open
        onOpenChange={(open) => !open && onClose()}
        shouldScaleBackground={false}
      >
        <DrawerContent className="h-[min(72dvh,40rem)] max-h-[calc(100dvh-2rem)] border-white/10 bg-neutral-950 p-0">
          <DrawerTitle className="sr-only">{ticket.eventTitle}</DrawerTitle>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ticket.eventTitle}
      className="fixed inset-0 z-[100] hidden bg-black/70 backdrop-blur-sm md:block"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: reducedMotion ? 0 : "100%" }}
        animate={{ x: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
        onClick={(event) => event.stopPropagation()}
        className="relative ml-auto flex h-[100dvh] w-full max-w-md flex-col border-l border-white/10 bg-neutral-950 shadow-2xl"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%)",
        }}
      >
        {content}
      </motion.aside>
    </div>, document.body
  );
}
