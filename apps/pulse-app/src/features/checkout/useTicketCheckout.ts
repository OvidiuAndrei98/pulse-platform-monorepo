"use client";
import { checkoutTotals } from "@packages/app-core/checkout/totals";
import { checkoutRequestKey } from "@packages/app-core/checkout/requestKey";

import { revealDrawerField, useDrawerViewport } from "@/components/ui/useDrawerViewport";
import { useBackLayer } from "@/lib/navigation/useBackLayer";
import { checkoutEmailError } from "@packages/app-core/checkout/validateEmail";
import { animate, useMotionValue } from "framer-motion";
import { Capacitor } from "@capacitor/core";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiClient, ApiError } from "@packages/api-client/client";

import { type Event, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { isTicketSelectionAvailable } from "@/features/checkout/TicketTypeSelector";
import {ticketSelectionMode} from '@packages/app-core/checkout/ticketAvailability';

import { useEventPromoCode } from "@/features/events/useEventPromoCode";
import { emptyInvoiceDetails, type InvoiceDetails, validateInvoiceDetails, getInvoiceFieldErrors } from "@/features/checkout/InvoiceDetailsFields";
import { readSavedBillingDetails, removeSavedBillingDetails, saveBillingDetails } from "./savedBillingDetails";

export function useTicketCheckout({
  event,
  quantities,
  onQuantitiesChange,
  open,
  onClose,
  onEventRefresh,
  historyBack = true,
  preservePageScroll = false,
  onBusyChange,
}: {
  event: Event;
  quantities: Record<string, number>;
  onQuantitiesChange: (value: Record<string, number>) => void;
  open: boolean;
  onClose: () => void;
  onEventRefresh?: (event: Event) => void;
  historyBack?: boolean;
  preservePageScroll?: boolean;
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
  const panelRef = useDrawerViewport(open && mounted, "panel", true, preservePageScroll);
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
  const checkoutIntent = useRef<{ payload: string; key: string } | null>(null);
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
  const {tickets:selectedTickets,count:ticketCount,subtotal:ticketSubtotal,discount:discountAmount,fee:serviceFee,total}=checkoutTotals(event,quantities,promo.applied?.discountPercent??0);
  const selectionAvailable = isTicketSelectionAvailable(ticketTypes, quantities)&&ticketSelectionMode(ticketTypes,quantities)==='paid';
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
      const body = {
        expectedTotalBani: Math.round(total * 100),
        email,
        items: selectedTickets.map((ticket) => ({ticketTypeId: ticket.id, quantity: quantities[ticket.id] ?? 0})),
        promoCode: promo.applied?.code,
        billingDetails: invoiceDetails,
      };
      checkoutIntent.current = checkoutRequestKey(checkoutIntent.current,
        JSON.stringify({eventId:event.id, userId:user?.properties.id, body}));
      const checkout = await ApiClient.instance.post("/events/{id}/tickets/purchase", {
        params: { path: { id: event.id } }, body,
        idempotencyKey: checkoutIntent.current.key,
      });
      externalCheckoutRef.current = true;
      checkoutResetTimerRef.current = window.setTimeout(
        resetCheckoutPending,
        20_000,
      );
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 425 && error.status !== 429) checkoutIntent.current = null;
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
      toast.error(message === 'CHECKOUT_PRICE_CHANGED' ? t('checkout.priceChanged') : message);
      resetCheckoutPending();
    }
  };

  const stepIndex = step === "tickets" ? 0 : step === "billing" ? 1 : 2;
  const ticketSummary = selectedTickets
    .map((ticket) => quantities[ticket.id] + " \u00d7 " + ticket.name)
    .join(", ");
  const eventDate = new Date(event.startTime);
  return {
    billingErrors,
    billingLoading,
    billingSource,
    busy,
    cancelEdgeSwipe,
    changeStep,
    continueStep,
    discountAmount,
    emailError,
    endEdgeSwipe,
    event,
    eventDate,
    forgetBilling,
    furthestStep,
    guestEmail,
    handleCheckout,
    historyDismissed,
    i18n,
    id,
    invoiceDetails,
    isCheckingOut,
    mounted,
    moveEdgeSwipe,
    nativeSwipeEnabled,
    onClose,
    onQuantitiesChange,
    open,
    panelRef,
    promo,
    purchaseUnavailable,
    quantities,
    rememberBilling,
    savedBilling,
    scrollRef,
    selectedTickets,
    selectionAvailable,
    serviceFee,
    setBillingAttempted,
    setBillingSource,
    setGuestEmail,
    setInvoiceDetails,
    setRememberBilling,
    startEdgeSwipe,
    step,
    stepIndex,
    swipeBackdropOpacity,
    swipeX,
    t,
    ticketCount,
    ticketSubtotal,
    ticketSummary,
    titleRef,
    total,
    signedIn: !!user,
  };
}
export type TicketCheckoutDrawerModel = ReturnType<typeof useTicketCheckout>;
