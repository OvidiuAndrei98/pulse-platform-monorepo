"use client";

import { sidePanelWidth } from "@/components/ui/sidePanel";
import {
  revealDrawerField,
  useDrawerViewport,
} from "@/components/ui/useDrawerViewport";

import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { checkoutEmailError } from "./validateEmail";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
} from "framer-motion";
import { Capacitor } from "@capacitor/core";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LockKeyhole,
  Minus,
  Plus,
  Loader2,
  Ticket,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { type Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import {
  getRemainingTicketCapacity,
  isTicketSelectionAvailable,
} from "@/features/checkout/TicketTypeSelector";
import { PromoCodeField } from "@/features/events/PromoCodeField";
import {
  calculateServiceFeeRon,
  formatRon,
} from "@/features/events/serviceFee";
import {
  discountedUnitPrice,
  useEventPromoCode,
} from "@/features/events/useEventPromoCode";
import {
  emptyInvoiceDetails,
  InvoiceDetailsFields,
  type InvoiceDetails,
  validateInvoiceDetails,
  getInvoiceFieldErrors,
} from "@/features/checkout/InvoiceDetailsFields";

import {
  readSavedBillingDetails,
  removeSavedBillingDetails,
  saveBillingDetails,
} from "./savedBillingDetails";

export function TicketCheckoutDrawer({
  event,
  quantities,
  onQuantitiesChange,
  open,
  onClose,
  onEventRefresh,
  historyBack = true,
  onBusyChange,
}: {
  event: Event;
  quantities: Record<string, number>;
  onQuantitiesChange: (value: Record<string, number>) => void;
  open: boolean;
  onClose: () => void;
  onEventRefresh?: (event: Event) => void;
  historyBack?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useDataProvider();
  const userId = user?.properties.id;
  const id = useId();
  const [savedBilling, setSavedBilling] = useState<InvoiceDetails | null>(null);
  const [billingSource, setBillingSource] = useState<"saved" | "new">("new");
  const [billingLoading, setBillingLoading] = useState(false);
  const [rememberBilling, setRememberBilling] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [furthestStep, setFurthestStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [nativeSwipeEnabled, setNativeSwipeEnabled] = useState(false);
  const panelRef = useDrawerViewport(open && mounted, "panel");
  const swipeX = useMotionValue(0);
  const swipeBackdropOpacity = useMotionValue(1);
  const edgeSwipe = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    active: boolean;
  } | null>(null);
  const [step, setStep] = useState<"tickets" | "billing" | "summary">(
    "tickets",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
  const externalCheckoutRef = useRef(false);
  const checkoutResetTimerRef = useRef<number | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [billingAttempted, setBillingAttempted] = useState(false);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails>(() =>
    emptyInvoiceDetails(user?.properties.username ?? ""),
  );
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [historyDismissed, setHistoryDismissed] = useState(false);
  const billingErrors = billingAttempted
    ? getInvoiceFieldErrors(invoiceDetails)
    : {};
  const emailError = billingAttempted ? checkoutEmailError(guestEmail) : null;
  const busy = isCheckingOut || savingBilling;
  const resetCheckoutPending = useCallback(() => {
    externalCheckoutRef.current = false;
    submittingRef.current = false;
    if (checkoutResetTimerRef.current !== null) {
      window.clearTimeout(checkoutResetTimerRef.current);
      checkoutResetTimerRef.current = null;
    }
    setIsCheckingOut(false);
  }, []);
  useBackLayer(open && historyBack, () => {
    if (busy) return false;
    // The browser has already moved the previous page into view during its
    // edge-swipe. Close the entire checkout, including later steps, without
    // replaying its exit over that snapshot. The header Back still changes steps.
    flushSync(() => {
      setHistoryDismissed(true);
      onClose();
    });
  });
  const promo = useEventPromoCode(event.id);
  const ticketTypes = event.ticketTypes ?? [];
  const selectedTickets = ticketTypes.filter(
    (ticket) => (quantities[ticket.id] ?? 0) > 0,
  );
  const ticketCount = selectedTickets.reduce(
    (sum, ticket) => sum + (quantities[ticket.id] ?? 0),
    0,
  );
  const ticketSubtotal = selectedTickets.reduce(
    (sum, ticket) => sum + (quantities[ticket.id] ?? 0) * ticket.priceRon,
    0,
  );
  const discountedTicketSubtotal = selectedTickets.reduce(
    (sum, ticket) =>
      sum +
      (quantities[ticket.id] ?? 0) *
        discountedUnitPrice(
          ticket.priceRon,
          promo.applied?.discountPercent ?? 0,
        ),
    0,
  );
  const discountAmount = ticketSubtotal - discountedTicketSubtotal;
  const serviceFee = event.organizerAbsorbsServiceFee
    ? 0
    : calculateServiceFeeRon(discountedTicketSubtotal, ticketCount);
  const total = discountedTicketSubtotal + serviceFee;
  const selectionAvailable = isTicketSelectionAvailable(ticketTypes, quantities);
  const purchaseUnavailable =
    userId === event.organizerId ||
    new Date(event.endTime).getTime() <= Date.now();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setNativeSwipeEnabled(
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios",
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    edgeSwipe.current = null;
    swipeX.set(0);
    swipeBackdropOpacity.set(1);
  }, [open, swipeX, swipeBackdropOpacity]);

  useEffect(() => {
    if (!open || ticketCount === 0 || selectionAvailable) return;
    onQuantitiesChange({});
    setFurthestStep(0);
    setStep("tickets");
  }, [open, onQuantitiesChange, selectionAvailable, ticketCount]);

  const resetEdgeSwipe = () => {
    edgeSwipe.current = null;
    void animate(swipeX, 0, { type: "spring", stiffness: 420, damping: 38 });
    void animate(swipeBackdropOpacity, 1, { duration: 0.2 });
  };

  const cancelEdgeSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (edgeSwipe.current?.pointerId === event.pointerId) resetEdgeSwipe();
  };

  const startEdgeSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !nativeSwipeEnabled ||
      !historyBack ||
      busy ||
      event.pointerType !== "touch"
    )
      return;
    if (event.clientX - event.currentTarget.getBoundingClientRect().left > 32)
      return;
    if (
      (event.target as HTMLElement).closest(
        "button, a, input, select, textarea, [role='button']",
      )
    )
      return;
    edgeSwipe.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      active: false,
    };
  };

  const moveEdgeSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = edgeSwipe.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = event.clientX - gesture.startX;
    const vertical = Math.abs(event.clientY - gesture.startY);
    if (!gesture.active) {
      if (vertical > 10 && vertical > Math.abs(distance)) {
        edgeSwipe.current = null;
        return;
      }
      if (distance < 10 || distance < vertical * 1.2) return;
      gesture.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    gesture.velocity =
      ((event.clientX - gesture.lastX) /
        Math.max(1, event.timeStamp - gesture.lastTime)) *
      1000;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    swipeX.set(Math.max(0, distance));
    // Reveal the event sheet progressively as the checkout follows the finger.
    swipeBackdropOpacity.set(
      Math.max(0, 1 - distance / (window.innerWidth * 0.5)),
    );
  };

  const endEdgeSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = edgeSwipe.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    edgeSwipe.current = null;
    if (!gesture.active) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const distance = Math.max(0, event.clientX - gesture.startX);
    if (
      !busy &&
      (distance > Math.min(120, window.innerWidth * 0.28) ||
        (distance > 35 && gesture.velocity > 600))
    ) {
      onClose();
    } else {
      resetEdgeSwipe();
    }
  };

  useEffect(() => {
    const restoreAfterExternalCheckout = () => {
      if (externalCheckoutRef.current) resetCheckoutPending();
    };
    const restoreWhenVisible = () => {
      if (document.visibilityState === "visible") {
        restoreAfterExternalCheckout();
      }
    };

    window.addEventListener("pageshow", restoreAfterExternalCheckout);
    window.addEventListener("focus", restoreAfterExternalCheckout);
    document.addEventListener("visibilitychange", restoreWhenVisible);
    return () => {
      window.removeEventListener("pageshow", restoreAfterExternalCheckout);
      window.removeEventListener("focus", restoreAfterExternalCheckout);
      document.removeEventListener("visibilitychange", restoreWhenVisible);
      if (checkoutResetTimerRef.current !== null) {
        window.clearTimeout(checkoutResetTimerRef.current);
      }
    };
  }, [resetCheckoutPending]);

  useLayoutEffect(() => {
    if (open) setHistoryDismissed(false);
  }, [open]);

  useEffect(() => {
    setStep("tickets");
    setFurthestStep(0);
    setBillingSource("new");
    setBillingLoading(false);
    setRememberBilling(false);
    resetCheckoutPending();
    setBillingAttempted(false);
    setGuestEmail(user?.properties.email ?? "");
    setInvoiceDetails(emptyInvoiceDetails(user?.properties.username ?? ""));
  }, [
    event.id,
    resetCheckoutPending,
    userId,
    user?.properties.email,
    user?.properties.username,
  ]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose, open]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [step, open]);

  useEffect(() => {
    if (!open) setStep("tickets");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setBillingLoading(false);
      return;
    }
    let active = true;
    setSavedBilling(null);
    setBillingSource("new");
    setRememberBilling(false);
    setBillingLoading(Boolean(userId));
    readSavedBillingDetails(userId)
      .then((value) => {
        if (!active) return;
        setSavedBilling(value);
        if (value) {
          setInvoiceDetails({ ...value });
          setBillingSource("saved");
        }
      })
      .catch(() => {
        if (active && userId) toast.error(t("checkout.billingLoadFailed"));
      })
      .finally(() => {
        if (active) setBillingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, open, t]);

  const changeStep = (next: "tickets" | "billing" | "summary") => {
    if (busy) return;
    (document.activeElement as HTMLElement)?.blur();
    setStep(next);
  };
  const validateBilling = () => {
    setBillingAttempted(true);
    if (
      checkoutEmailError(guestEmail) ||
      validateInvoiceDetails(invoiceDetails)
    ) {
      changeStep("billing");
      requestAnimationFrame(() => {
        const invalid = scrollRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        invalid?.focus({ preventScroll: true });
        if (scrollRef.current) revealDrawerField(scrollRef.current);
      });
      return false;
    }
    return true;
  };
  const continueStep = async () => {
    if (
      busy ||
      billingLoading ||
      !ticketCount ||
      promo.isValidating ||
      Boolean(promo.code && !promo.applied)
    )
      return;
    if (step === "tickets") {
      setFurthestStep((value) => Math.max(value, 1));
      changeStep("billing");
      return;
    }
    if (!validateBilling()) return;
    if (userId && billingSource === "new" && rememberBilling) {
      setSavingBilling(true);
      try {
        const saved = await saveBillingDetails(invoiceDetails, userId);
        setSavedBilling(saved);
        setInvoiceDetails(saved);
        setBillingSource("saved");
        setRememberBilling(false);
      } catch {
        toast.error(t("checkout.billingSaveFailed"));
      } finally {
        setSavingBilling(false);
      }
    }
    (document.activeElement as HTMLElement)?.blur();
    setFurthestStep(2);
    setStep("summary");
  };
  const forgetBilling = async () => {
    setSavingBilling(true);
    try {
      await removeSavedBillingDetails(userId);
      setSavedBilling(null);
      setBillingSource("new");
      setInvoiceDetails(emptyInvoiceDetails(user?.properties.username ?? ""));
      setRememberBilling(false);
    } catch {
      toast.error(t("checkout.billingRemoveFailed"));
    } finally {
      setSavingBilling(false);
    }
  };

  const handleCheckout = async () => {
    if (
      !ticketCount ||
      !selectionAvailable ||
      purchaseUnavailable ||
      busy ||
      submittingRef.current ||
      promo.isValidating ||
      Boolean(promo.code && !promo.applied)
    )
      return;
    const email = guestEmail.trim();
    if (!validateBilling()) return;

    submittingRef.current = true;
    setIsCheckingOut(true);
    try {
      const checkout = await ApiClient.instance.post(
        "/events/{id}/tickets/purchase",
        {
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
        },
      );
      externalCheckoutRef.current = true;
      checkoutResetTimerRef.current = window.setTimeout(
        resetCheckoutPending,
        20_000,
      );
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        onQuantitiesChange({});
        setFurthestStep(0);
        setStep("tickets");
        try {
          onEventRefresh?.(await User.getPublicEventById(event.id));
        } catch {
          // Keep the checkout fail-closed even if the follow-up refresh fails.
        }
      }
      const message =
        error instanceof ApiError
          ? error.detail || error.title
          : t("eventSheet.purchaseError");
      toast.error(message);
      resetCheckoutPending();
    }
  };

  const stepIndex = step === "tickets" ? 0 : step === "billing" ? 1 : 2;
  const ticketSummary = selectedTickets
    .map((ticket) => quantities[ticket.id] + " \u00d7 " + ticket.name)
    .join(", ");
  const eventDate = new Date(event.startTime);
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
                className="text-lg font-bold outline-none"
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
                  (index <= stepIndex ? "bg-primary" : "bg-white/10")
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
          <StepCard
            number={1}
            title={t("checkout.tickets")}
            hint={t("checkout.ticketStepHint")}
            active={step === "tickets"}
            completed={furthestStep > 0}
            summary={ticketSummary}
            onEdit={() => changeStep("tickets")}
            disabled={busy}
          >
            <div className="divide-y divide-white/10">
              {selectedTickets.map((ticket) => {
                const maximumQuantity = Math.min(8, getRemainingTicketCapacity(ticket));
                return (
                <div key={ticket.id} className="first:pt-0">
                  <p className="break-words text-lg font-bold text-primary">
                    {ticket.name}
                  </p>
                  <p className="mt-1 text-base font-semibold text-primary">
                    {formatRon(ticket.priceRon)}
                  </p>
                  {ticket.description && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/50">
                      {ticket.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm text-white/70">
                      {t("checkout.quantity")}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy || (quantities[ticket.id] ?? 0) <= 1}
                        onClick={() =>
                          onQuantitiesChange({
                            ...quantities,
                            [ticket.id]: Math.max(
                              1,
                              (quantities[ticket.id] ?? 0) - 1,
                            ),
                          })
                        }
                        aria-label={t("checkout.decreaseQuantity", {
                          name: ticket.name,
                        })}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/40 disabled:opacity-25"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <span
                        className="min-w-5 text-center text-base"
                        aria-live="polite"
                      >
                        {quantities[ticket.id] ?? 0}
                      </span>
                      <button
                        type="button"
                        disabled={busy || (quantities[ticket.id] ?? 0) >= maximumQuantity}
                        onClick={() =>
                          onQuantitiesChange({
                            ...quantities,
                            [ticket.id]: Math.min(
                              maximumQuantity,
                              (quantities[ticket.id] ?? 0) + 1,
                            ),
                          })
                        }
                        aria-label={t("checkout.increaseQuantity", {
                          name: ticket.name,
                        })}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/70 disabled:opacity-25"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 border-t border-white/10 pt-4">
              {" "}
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
            {prices}
          </StepCard>
          <StepCard
            number={2}
            title={t("checkout.billingPayment")}
            hint={t("checkout.billingStepHint")}
            active={step === "billing"}
            completed={furthestStep > 1}
            summary={
              invoiceDetails.name + " \u00b7 " + t("checkout.stripePayment")
            }
            onEdit={() => changeStep("billing")}
            disabled={
              busy || !ticketCount || Boolean(promo.code && !promo.applied)
            }
          >
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-primary/60 bg-primary/5 p-4">
              <CreditCard className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold">
                  {t("checkout.stripePayment")}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/50">
                  {t("checkout.stripeRedirectHint")}
                </p>
              </div>
              <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
            </div>
            <label
              className="block text-sm font-semibold"
              htmlFor={id + "-email"}
            >
              {t("eventSheet.emailForTickets")}
            </label>
            <input
              required
              id={id + "-email"}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={guestEmail}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? id + "-email-error" : undefined}
              onChange={(inputEvent) => setGuestEmail(inputEvent.target.value)}
              placeholder={t("checkout.emailPlaceholder")}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary/60 aria-[invalid=true]:border-red-400/70 sm:text-sm"
            />
            {emailError && (
              <p
                id={id + "-email-error"}
                role="alert"
                className="mt-1.5 text-xs text-red-400"
              >
                {t(emailError)}
              </p>
            )}
            {!user && (
              <GoogleSignInButton
                returnTo={`/events/${event.id}?checkout=1`}
                className="mt-3 h-11 rounded-xl text-xs"
              />
            )}
            {billingLoading ? (
              <div className="mt-4 flex min-h-20 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02]">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="sr-only">{t("common.loading")}</span>
              </div>
            ) : (
              <>
                {savedBilling && (
                  <div
                    role="radiogroup"
                    aria-label={t("checkout.billingDetailsChoice")}
                    className="mt-4 space-y-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billingSource === "saved"}
                      disabled={busy}
                      onClick={() => {
                        setBillingSource("saved");
                        setInvoiceDetails({ ...savedBilling });
                        setBillingAttempted(false);
                        setRememberBilling(false);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition disabled:opacity-40 ${
                        billingSource === "saved"
                          ? "border-primary/70 bg-primary/10"
                          : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {t("checkout.useSavedBilling")}
                      </span>
                      <span className="mt-1 block break-words text-xs leading-5 text-white/55">
                        {savedBilling.name}
                        {" \u00b7 "}
                        {savedBilling.address}, {savedBilling.city}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billingSource === "new"}
                      disabled={busy}
                      onClick={() => {
                        setBillingSource("new");
                        setInvoiceDetails({ ...savedBilling });
                        setBillingAttempted(false);
                        setRememberBilling(true);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left text-sm font-semibold transition disabled:opacity-40 ${
                        billingSource === "new"
                          ? "border-primary/70 bg-primary/10"
                          : "border-white/10 bg-white/[0.02]"
                      }`}
                    >
                      {t("checkout.useOtherBilling")}
                    </button>
                  </div>
                )}

                {billingSource === "saved" && savedBilling ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void forgetBilling()}
                    className="mt-2 min-h-10 text-xs text-white/50 underline disabled:opacity-40"
                  >
                    {t("checkout.removeSavedBilling")}
                  </button>
                ) : (
                  <>
                    <InvoiceDetailsFields
                      value={invoiceDetails}
                      onChange={setInvoiceDetails}
                      idPrefix={id}
                      errors={billingErrors}
                    />

                    {user && (
                      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={rememberBilling}
                          disabled={busy}
                          onChange={(event) =>
                            setRememberBilling(event.target.checked)
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span>
                          {t(
                            savedBilling
                              ? "checkout.replaceSavedBilling"
                              : "checkout.rememberBilling",
                          )}
                          <span className="mt-1 block text-xs leading-5 text-white/45">
                            {t("checkout.rememberBillingHint")}
                          </span>
                        </span>
                      </label>
                    )}
                  </>
                )}
              </>
            )}
          </StepCard>
          <StepCard
            number={3}
            title={t("checkout.orderSummary")}
            hint={t("checkout.summaryStepHint")}
            active={step === "summary"}
            completed={false}
          >
            <div className="space-y-2 text-sm">
              {selectedTickets.map((ticket) => (
                <PriceRow
                  key={ticket.id}
                  label={quantities[ticket.id] + " \u00d7 " + ticket.name}
                  value={formatRon(
                    (quantities[ticket.id] ?? 0) * ticket.priceRon,
                  )}
                />
              ))}
            </div>
            {prices}
            <div className="mt-5 space-y-1 border-t border-white/10 pt-4 text-xs leading-5 text-white/55">
              <p className="break-all">{guestEmail}</p>
              <p className="font-semibold text-white/80">
                {invoiceDetails.name}
              </p>
              {invoiceDetails.type === "company" && (
                <p>
                  {invoiceDetails.taxId} {invoiceDetails.registrationNumber}
                </p>
              )}
              <p className="break-words">
                {[
                  invoiceDetails.address,
                  invoiceDetails.city,
                  invoiceDetails.sector || invoiceDetails.county,
                  invoiceDetails.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{t("checkout.stripePayment")}</p>
            </div>
          </StepCard>
        </div>
      </div>
      <footer
        data-drawer-keyboard-footer
        className="relative z-10 flex shrink-0 items-center gap-2.5 bg-linear-to-b from-black/10 via-black/70 to-black px-4 pt-3 pb-7"
      >
        <button
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
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
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
        </button>
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

function PriceRow({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 ${highlighted ? "text-primary" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="shrink-0">{value}</span>
    </div>
  );
}

function StepCard({
  number,
  title,
  hint,
  active,
  completed,
  summary,
  onEdit,
  disabled,
  children,
}: {
  number: number;
  title: string;
  hint: string;
  active: boolean;
  completed: boolean;
  summary?: string;
  onEdit?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={
        "rounded-3xl border bg-[#151112] p-4 sm:p-5 " +
        (active
          ? "border-primary/60 shadow-[0_1px_20px_-10px_var(--color-primary)]"
          : "border-transparent")
      }
    >
      <div className="flex items-center gap-3">
        <span
          className={
            "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold " +
            (active
              ? "bg-primary text-white"
              : completed
                ? "bg-emerald-500 text-white"
                : "text-white/30")
          }
        >
          {active ? (
            number
          ) : completed ? (
            <Check className="h-4 w-4" />
          ) : (
            <LockKeyhole className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={
              "text-base font-semibold " +
              (!active && !completed ? "text-white/35" : "text-white")
            }
          >
            {title}
          </h3>
          {(active || completed) && (
            <p className="mt-1 text-xs leading-5 text-white/45">
              {active ? hint : summary}
            </p>
          )}
        </div>
        {!active && completed && onEdit && (
          <button
            type="button"
            disabled={disabled}
            onClick={onEdit}
            className="min-h-10 shrink-0 text-xs font-semibold text-primary disabled:opacity-40"
          >
            {t("checkout.editStep")}
          </button>
        )}
      </div>
      <div hidden={!active} className="mt-4 border-t border-white/10 pt-4">
        {children}
      </div>
    </section>
  );
}
