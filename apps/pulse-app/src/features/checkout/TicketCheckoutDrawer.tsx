"use client";
import { CheckoutTicketsStep } from "./presentation/CheckoutTicketsStep";
import { CheckoutBillingStep } from "./presentation/CheckoutBillingStep";
import { CheckoutSummaryStep } from "./presentation/CheckoutSummaryStep";
import { PriceRow } from "./presentation/primitives";

import { useTicketCheckout } from "./useTicketCheckout";

import { sidePanelWidth } from "@/components/ui/sidePanel";

import { AnimatePresence, animate, motion } from "framer-motion";

import { ArrowLeft, ArrowRight, Loader2, Ticket, X } from "lucide-react";

import { createPortal } from "react-dom";

import { formatRon } from "@packages/app-core/events/serviceFee";

import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';

export function TicketCheckoutDrawer(props: Parameters<typeof useTicketCheckout>[0]) {
  const model = useTicketCheckout(props);
  const {
    billingLoading,
    busy,
    cancelEdgeSwipe,
    changeStep,
    continueStep,
    discountAmount,
    endEdgeSwipe,
    event,
    eventDate,
    handleCheckout,
    historyDismissed,
    i18n,
    id,
    isCheckingOut,
    mounted,
    moveEdgeSwipe,
    nativeSwipeEnabled,
    onClose,
    open,
    panelRef,
    promo,
    purchaseUnavailable,
    scrollRef,
    selectionAvailable,
    serviceFee,
    startEdgeSwipe,
    step,
    stepIndex,
    swipeBackdropOpacity,
    swipeX,
    t,
    ticketCount,
    ticketSubtotal,
    titleRef,
    total,
  } = model;

  const prices = (
    <>
      {" "}
      <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs">
        <PriceRow
          label={t("checkout.tickets")}
          value={formatRon(ticketSubtotal)}
        />
        {promo.applied && discountAmount > 0 && (
          <PriceRow
            label={t("checkout.discount", {
              code: promo.applied.code,
              percent: promo.applied.discountPercent,
            })}
            value={`-${formatRon(discountAmount)}`}
            highlighted
          />
        )}
        <PriceRow
          label={
            event.organizerAbsorbsServiceFee
              ? t("checkout.ticketingProcessingFeeCoveredByOrganizer")
              : t("checkout.ticketingProcessingFee")
          }
          value={
            event.organizerAbsorbsServiceFee ? "0 RON" : formatRon(serviceFee)
          }
        />
        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-base font-bold">
          <span>{t("checkout.total")}</span>
          <span className="text-primary">{formatRon(total)}</span>
        </div>
      </div>
    </>
  );

  const content = (
    <>
      <div
        ref={scrollRef}
        data-vaul-no-drag
        data-drawer-keyboard-scroll
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-5 [-webkit-overflow-scrolling:touch]"
      >
        <header
          data-drawer-keyboard-header
          className="px-4 pb-3 pt-[max(1rem,calc(var(--native-safe-top)+0.75rem))]"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                step === "tickets"
                  ? onClose()
                  : changeStep(step === "billing" ? "tickets" : "billing")
              }
              aria-label={t("common.back")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.06] disabled:opacity-40"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2
                ref={titleRef}
                tabIndex={-1}
                id={id + "-title"}
                className="text-lg font-bold"
              >
                {t("checkout.checkoutTitle")}
              </h2>
              <p
                data-drawer-keyboard-hide
                className="mt-1 text-xs tracking-wider text-white/45"
                aria-live="polite"
              >
                {t("checkout.stepOf", { step: stepIndex + 1, total: 3 })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label={t("checkout.backToTickets")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/5 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol
            className="mt-5 flex gap-2"
            aria-label={t("checkout.checkoutTitle")}
          >
            {[
              t("checkout.tickets"),
              t("checkout.billingPayment"),
              t("checkout.orderSummary"),
            ].map((label, index) => (
              <li
                key={label}
                aria-current={index === stepIndex ? "step" : undefined}
                className={
                  "h-1 flex-1 rounded-full " +
                  (index <= stepIndex ? "bg-[var(--ui-action)]" : "bg-white/10")
                }
              >
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ol>
        </header>
        <div className="space-y-3 px-4 pt-3">
          <div
            data-drawer-keyboard-hide
            className="mb-5 flex items-center gap-3 px-1"
          >
            <div className="shrink-0 border-r border-white/20 pr-3 text-center text-white/55">
              <span className="block text-2xl font-bold leading-none">
                {eventDate.toLocaleDateString(i18n.language, {
                  day: "2-digit",
                })}
              </span>
              <span className="mt-1 block text-xs uppercase">
                {eventDate.toLocaleDateString(i18n.language, {
                  month: "short",
                })}
              </span>
            </div>
            <div className="min-w-0">
              <p className="break-words text-lg font-semibold leading-tight">
                {event.title}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">
                {event.category}
              </p>
            </div>
          </div>
          <CheckoutTicketsStep model={model} prices={prices}/>
          <CheckoutBillingStep model={model} />
          <CheckoutSummaryStep model={model} prices={prices}/>
        </div>
      </div>
      <footer
        data-drawer-keyboard-footer
        className="relative z-10 flex shrink-0 items-center gap-2.5 bg-linear-to-b from-black/10 via-black/70 to-black px-4 pt-3 pb-7"
      >
        <UIActionButton
          type="button"
          onClick={() =>
            step === "summary" ? void handleCheckout() : void continueStep()
          }
          disabled={
            busy ||
            billingLoading ||
            purchaseUnavailable ||
            !ticketCount ||
            !selectionAvailable ||
            promo.isValidating ||
            Boolean(promo.code && !promo.applied)
          }
          className="flex h-11 flex-1 items-center justify-center gap-2 px-8 text-sm font-semibold shadow-lg shadow-primary/20 transition-all  hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : step === "summary" ? (
            <Ticket className="h-4 w-4 shrink-0" />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0" />
          )}
          {isCheckingOut
            ? t("checkout.preparingPayment")
            : step === "summary"
              ? t("checkout.confirmAndPay", { total: formatRon(total) })
              : step === "billing"
                ? t("checkout.continueToSummary")
                : t("common.next")}
        </UIActionButton>
      </footer>
    </>
  );

  if (!mounted) return null;

  return createPortal(
    historyDismissed ? null : (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.32, delay: 0.06 } }}
              transition={{ duration: 0.22 }}
              className="pointer-events-none fixed inset-0 z-[230]"
            >
              <motion.button
                type="button"
                aria-label={t("common.close")}
                style={{ opacity: swipeBackdropOpacity }}
                onClick={() => !busy && onClose()}
                className="pointer-events-auto absolute inset-0 bg-black/75 backdrop-blur-sm"
              />
            </motion.div>
            <motion.aside
              ref={panelRef}
              data-drawer-viewport
              role="dialog"
              aria-modal="true"
              aria-labelledby={id + "-title"}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className={`pointer-events-auto fixed right-0 top-0 z-[231] h-[100dvh] ${sidePanelWidth}`}
            >
              <motion.div
                style={{
                  x: swipeX,
                  touchAction: nativeSwipeEnabled ? "pan-y" : undefined,
                }}
                onPointerDownCapture={startEdgeSwipe}
                onPointerMoveCapture={moveEdgeSwipe}
                onPointerUpCapture={endEdgeSwipe}
                onPointerCancelCapture={cancelEdgeSwipe}
                className="flex h-full flex-col overflow-hidden border-white/10 bg-[#080909] text-foreground shadow-2xl md:border-l"
              >
                {content}
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    ),
    document.body,
  );
}
