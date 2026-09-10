"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, Ticket, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import type { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { PromoCodeField } from "@/features/events/PromoCodeField";
import { calculateServiceFeeRon, formatRon } from "@/features/events/serviceFee";
import { discountedUnitPrice, useEventPromoCode } from "@/features/events/useEventPromoCode";
import {
  emptyInvoiceDetails,
  InvoiceDetailsFields,
  type InvoiceDetails,
  validateInvoiceDetails,
} from "@/features/checkout/InvoiceDetailsFields";

export function TicketCheckoutDrawer({
  event,
  quantities,
  open,
  onClose,
}: {
  event: Event;
  quantities: Record<string, number>;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const panelRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails>(() =>
    emptyInvoiceDetails(user?.properties.username ?? ""),
  );
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const promo = useEventPromoCode(event.id);
  const ticketTypes = event.ticketTypes ?? [];
  const selectedTickets = ticketTypes.filter((ticket) => (quantities[ticket.id] ?? 0) > 0);
  const ticketCount = selectedTickets.reduce((sum, ticket) => sum + (quantities[ticket.id] ?? 0), 0);
  const ticketSubtotal = selectedTickets.reduce(
    (sum, ticket) => sum + (quantities[ticket.id] ?? 0) * ticket.priceRon,
    0,
  );
  const discountedTicketSubtotal = selectedTickets.reduce(
    (sum, ticket) =>
      sum
      + (quantities[ticket.id] ?? 0)
      * discountedUnitPrice(ticket.priceRon, promo.applied?.discountPercent ?? 0),
    0,
  );
  const discountAmount = ticketSubtotal - discountedTicketSubtotal;
  const serviceFee = event.organizerAbsorbsServiceFee
    ? 0
    : calculateServiceFeeRon(discountedTicketSubtotal, ticketCount);
  const total = discountedTicketSubtotal + serviceFee;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setGuestEmail(user?.properties.email ?? "");
    setInvoiceDetails(emptyInvoiceDetails(user?.properties.username ?? ""));
    setIsCheckingOut(false);
  }, [event.id, user?.properties.email, user?.properties.username]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const updateVisualViewport = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const viewport = window.visualViewport;
      panel.style.height = `${viewport?.height ?? window.innerHeight}px`;
      panel.style.top = `${viewport?.offsetTop ?? 0}px`;
    };
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !isCheckingOut) onClose();
    };

    updateVisualViewport();
    window.visualViewport?.addEventListener("resize", updateVisualViewport);
    window.visualViewport?.addEventListener("scroll", updateVisualViewport);
    window.addEventListener("resize", updateVisualViewport);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener("resize", updateVisualViewport);
      window.visualViewport?.removeEventListener("scroll", updateVisualViewport);
      window.removeEventListener("resize", updateVisualViewport);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCheckingOut, onClose, open]);

  const handleCheckout = async () => {
    if (!ticketCount || isCheckingOut) return;
    const email = guestEmail.trim();
    if (!email) {
      toast.error(t("eventSheet.emailRequired"));
      return;
    }
    const validationKey = validateInvoiceDetails(invoiceDetails);
    if (validationKey) {
      toast.error(t(validationKey));
      return;
    }

    setIsCheckingOut(true);
    try {
      const checkout = await ApiClient.instance.post("/events/{id}/tickets/purchase", {
        params: { path: { id: event.id } },
        body: {
          email,
          items: selectedTickets.map((ticket) => ({
            ticketTypeId: ticket.id,
            quantity: quantities[ticket.id] ?? 0,
          })),
          promoCode: promo.applied?.code,
          billingDetails: invoiceDetails,
        },
      });
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.detail || error.title
        : t("eventSheet.purchaseError");
      toast.error(message);
      setIsCheckingOut(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label={t("common.close")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isCheckingOut && onClose()}
            className="pointer-events-auto fixed inset-0 z-[230] bg-black/75 backdrop-blur-sm"
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-checkout-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="pointer-events-auto fixed right-0 top-0 z-[231] flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden border-l border-white/10 bg-[#080909] text-foreground shadow-2xl"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 pb-4 pt-[max(1rem,calc(var(--native-safe-top)+0.75rem))] sm:px-5">
              <button
                type="button"
                onClick={onClose}
                disabled={isCheckingOut}
                aria-label={t("checkout.backToTickets")}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] transition hover:bg-white/[0.08] disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 id="ticket-checkout-title" className="text-lg font-bold">
                  {t("checkout.checkoutTitle")}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {event.title} · {t("checkout.ticketCount", { count: ticketCount })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={isCheckingOut}
                aria-label={t("common.close")}
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-white sm:grid disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-5 [-webkit-overflow-scrolling:touch] sm:px-5">
              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <h3 className="text-sm font-semibold">{t("checkout.orderSummary")}</h3>
                <div className="mt-3 space-y-2.5 border-b border-white/10 pb-4">
                  {selectedTickets.map((ticket) => (
                    <div key={ticket.id} className="flex items-start justify-between gap-4 text-sm">
                      <span className="min-w-0 text-white/70">
                        <span className="font-semibold text-white">{quantities[ticket.id]}×</span> {ticket.name}
                      </span>
                      <span className="shrink-0 font-medium">{formatRon((quantities[ticket.id] ?? 0) * ticket.priceRon)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <PromoCodeField
                    code={promo.code}
                    applied={promo.applied}
                    error={promo.error}
                    isValidating={promo.isValidating}
                    onChange={promo.setCode}
                    onApply={() => void promo.apply()}
                    onClear={promo.clear}
                  />
                </div>

                <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs">
                  <PriceRow label={t("checkout.tickets")} value={formatRon(ticketSubtotal)} />
                  {promo.applied && discountAmount > 0 && (
                    <PriceRow
                      label={t("checkout.discount", { code: promo.applied.code, percent: promo.applied.discountPercent })}
                      value={`-${formatRon(discountAmount)}`}
                      highlighted
                    />
                  )}
                  <PriceRow
                    label={event.organizerAbsorbsServiceFee
                      ? t("checkout.ticketingProcessingFeeCoveredByOrganizer")
                      : t("checkout.ticketingProcessingFee")}
                    value={event.organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)}
                  />
                  <div className="flex items-center justify-between border-t border-white/10 pt-3 text-base font-bold">
                    <span>{t("checkout.total")}</span>
                    <span className="text-primary">{formatRon(total)}</span>
                  </div>
                </div>
              </section>

              <section className="mt-5">
                <label className="block text-sm font-semibold" htmlFor="drawer-ticket-email">
                  {t("eventSheet.emailForTickets")}
                </label>
                <input
                  id="drawer-ticket-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(inputEvent) => setGuestEmail(inputEvent.target.value)}
                  placeholder={t("checkout.emailPlaceholder")}
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary/60 sm:text-sm"
                />
                {!user && (
                  <GoogleSignInButton returnTo={`/events/${event.id}?checkout=1`} className="mt-3 h-11 rounded-xl text-xs" />
                )}
                <InvoiceDetailsFields
                  value={invoiceDetails}
                  onChange={setInvoiceDetails}
                  idPrefix="drawer-checkout"
                />
              </section>
            </div>

            <footer className="shrink-0 border-t border-white/10 bg-[#080909]/95 px-4 pb-[max(1rem,calc(var(--native-safe-bottom)+0.75rem))] pt-3 backdrop-blur-xl sm:px-5">
              <button
                type="button"
                onClick={() => void handleCheckout()}
                disabled={isCheckingOut || Boolean(promo.code && !promo.applied)}
                className="flex h-12 w-full items-center justify-between rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <span className="inline-flex items-center gap-2">
                  {isCheckingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                  {isCheckingOut ? t("checkout.preparingPayment") : t("checkout.goToPayment")}
                </span>
                <span>{formatRon(total)}</span>
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PriceRow({ label, value, highlighted = false }: { label: string; value: string; highlighted?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${highlighted ? "text-primary" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}
