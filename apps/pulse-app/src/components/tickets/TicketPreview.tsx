"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReadableSchema } from "@packages/api-client/src/Client";
import { Drawer, DrawerContent, DrawerHandleOverlay, DrawerTitle } from "@/components/ui/drawer";
import { TicketPass } from "./TicketPass";
import { TicketPdfButton } from "./TicketPdfButton";
import styles from "./ticketPass.module.css";
import { useTicketBrightness } from "@/lib/native/useTicketBrightness";

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
  const [open, setOpen] = useState(true);
  const brightnessActive = useTicketBrightness(open);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const dismissed = useRef(false);
  const finishClose = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    closeCallback.current();
  }, []);
  const requestClose = useCallback(() => {
    if (isDesktop) finishClose();
    else setOpen(false);
  }, [isDesktop, finishClose]);
  const reducedMotion = useReducedMotion();
  const index = tickets.findIndex(item => item.id === ticket.id);
  const status = ticketStatus(ticket, now);
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isDesktop, requestClose]);

  useEffect(() => {
    if (open) return;
    if (isDesktop) { finishClose(); return; }
    // Keep the ticket and the modal scroll lock until the actual exit finishes,
    // including Back/Escape, which change the controlled prop outside Vaul.
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      const animations = mobileSheetRef.current?.getAnimations() ?? [];
      void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (!cancelled) finishClose();
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [open, isDesktop, finishClose]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const content = (
    <div data-ticket-preview={ticket.id} className={styles.preview}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>{t("tickets.yourEntrance")}</p>
          <h1 className={styles.heading}>{t("tickets.showAtDoor")}</h1>
        </div>
      </header>
      <TicketPass ticket={ticket} status={status} />
      {brightnessActive && <p className={styles.brightness}><Zap aria-hidden="true" />{t("tickets.autoBrightness")}</p>}
      <div className={styles.actions}>
        {tickets.length > 1 && <div className={styles.paging}>
          <button type="button" aria-label={t("tickets.previousTicket")} disabled={index <= 0} onClick={() => onSelect?.(tickets[index - 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft className="h-5 w-5" /></button>
          <p aria-live="polite" className="text-sm font-semibold tabular-nums">{t("tickets.ticketPosition", { current: index + 1, total: tickets.length })}</p>
          <button type="button" aria-label={t("tickets.nextTicket")} disabled={index >= tickets.length - 1} onClick={() => onSelect?.(tickets[index + 1])} className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight className="h-5 w-5" /></button>
        </div>}
        <TicketPdfButton
          key={ticket.id}
          ticket={ticket}
          className={styles.download}
        />
      </div>
    </div>
  );

  if (!isDesktop) {
    return (
      <Drawer
        historyBack={false}
        open={open}
        onOpenChange={(nextOpen) => !nextOpen && requestClose()}
        onAnimationEnd={(nextOpen) => !nextOpen && finishClose()}
        modal
        repositionInputs={false}
        shouldScaleBackground={false}
        closeThreshold={0.35}
        fixed
      >
        <DrawerContent
          ref={mobileSheetRef}
          showHandle={false}
          sideInset
          lockDocument={false}
          aria-describedby={undefined}
          className="h-[90svh] max-h-none rounded-t-4xl border-none bg-black p-0 touch-none"
        >
          <DrawerTitle className="sr-only">{ticket.eventTitle}</DrawerTitle>
          <DrawerHandleOverlay />
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
      onClick={requestClose}
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
