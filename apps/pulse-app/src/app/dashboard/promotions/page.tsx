"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  GalleryHorizontalEnd,
  Loader2,
  Megaphone,
  MousePointerClick,
  Rows3,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  type OrganizerProfile,
  type PromotionAvailability,
  type PromotionCampaign,
  type PromotionPlan,
  User,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";
import {
  readSavedBillingDetails,
  saveBillingDetails,
} from "@/features/checkout/savedBillingDetails";
import {
  emptyPromotionBillingDetails,
  getPromotionBillingFieldErrors,
  PromotionBillingDetailsFields,
  type PromotionBillingDetails,
  validatePromotionBillingDetails,
} from "@/features/promotions/PromotionBillingDetailsFields";
import { normalizedCUI, promotionBillingFromSaved, savedCompanyBilling } from "@/features/promotions/promotionBilling";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function PromotionsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useDataProvider();
  const { events } = User.useOrganizerEvents(user);
  const [plans, setPlans] = useState<PromotionPlan[]>([]);
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [placement, setPlacement] =
    useState<PromotionPlan["placement"]>("home_banner");
  const [planId, setPlanId] = useState<PromotionPlan["id"]>("one_day");
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [availability, setAvailability] =
    useState<PromotionAvailability | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile>();
  const [savedBilling, setSavedBilling] =
    useState<PromotionBillingDetails | null>(null);
  const [billingSource, setBillingSource] = useState<"saved" | "new">("new");
  const [billingDetails, setBillingDetails] =
    useState<PromotionBillingDetails>(() => emptyPromotionBillingDetails());
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAttempted, setBillingAttempted] = useState(false);
  const [rememberBilling, setRememberBilling] = useState(false);
  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";
  const billingErrors = billingAttempted
    ? getPromotionBillingFieldErrors(billingDetails)
    : {};

  useEffect(() => {
    if (!user) return;
    let active = true;
    setBillingLoading(true);
    Promise.allSettled([
      user.getOrganizerProfile(),
      readSavedBillingDetails(user.properties.id),
    ])
      .then(([profileResult, billingResult]) => {
        if (!active) return;
        const profile = profileResult.status === "fulfilled"
          ? profileResult.value
          : undefined;
        const details = billingResult.status === "fulfilled"
          ? billingResult.value
          : null;
        setOrganizerProfile(profile);
        const reusable = profile && details?.type === "company"
          && normalizedCUI(details.taxId) === normalizedCUI(profile.cui)
          ? promotionBillingFromSaved(details)
          : null;
        setSavedBilling(reusable);
        if (reusable) {
          setBillingDetails({ ...reusable });
          setBillingSource("saved");
        } else {
          setBillingDetails(
            emptyPromotionBillingDetails(profile?.fiscalAddress ?? ""),
          );
          setBillingSource("new");
        }
        if (profileResult.status === "rejected" || billingResult.status === "rejected") {
          toast.error(t("checkout.billingLoadFailed"));
        }
      })
      .finally(() => active && setBillingLoading(false));
    return () => {
      active = false;
    };
  }, [t, user]);

  useEffect(() => {
    if (!user) return;
    Promise.allSettled([
      user.listPromotionPlans(),
      user.listPromotionCampaigns(),
    ]).then(([plansResult, campaignsResult]) => {
      if (plansResult.status === "fulfilled") {
        setPlans(
          plansResult.value.map((plan) => ({
            ...plan,
            placement: plan.placement || "home_banner",
          })),
        );
      }
      if (campaignsResult.status === "fulfilled") {
        setCampaigns(campaignsResult.value);
      }
      if (
        plansResult.status === "rejected" ||
        campaignsResult.status === "rejected"
      ) {
        toast.error(t("promotions.loadFailed"));
      }
      setLoading(false);
    });
  }, [t, user]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      user
        .listPromotionCampaigns()
        .then(setCampaigns)
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment === "success") toast.success(t("promotions.paymentReceived"));
    if (payment === "cancelled") toast.info(t("promotions.paymentCancelled"));
  }, [t]);

  const eligibleEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.status === "published" && new Date(event.endTime) > new Date(),
      ),
    [events],
  );
  useEffect(() => {
    if (!eventId && eligibleEvents[0]) setEventId(eligibleEvents[0].id);
  }, [eligibleEvents, eventId]);
  const visiblePlans = plans.filter((plan) => plan.placement === placement);
  const selectedPlan = visiblePlans.find((plan) => plan.id === planId);
  const selectedEvent = eligibleEvents.find((event) => event.id === eventId);
  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort(
        (first, second) =>
          Number(second.status === "active") -
          Number(first.status === "active"),
      ),
    [campaigns],
  );

  const dateOptions = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    const now = new Date();
    for (let index = 0; index < 90; index += 1) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + index,
      );
      if (planId === "thu_sat" && date.getDay() !== 4) continue;
      const campaignEnd = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + (selectedPlan?.days ?? 1),
      );
      if (selectedEvent && campaignEnd > new Date(selectedEvent.endTime))
        continue;
      result.push({
        value: toDateKey(date),
        label: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(date),
      });
    }
    return result;
  }, [locale, planId, selectedEvent, selectedPlan?.days]);
  useEffect(() => {
    if (!dateOptions.some((option) => option.value === startDate))
      setStartDate(dateOptions[0]?.value ?? "");
  }, [dateOptions, startDate]);

  useEffect(() => {
    if (!user || placement !== "home_banner" || !startDate) {
      setAvailability(null);
      setCheckingAvailability(false);
      return;
    }
    let active = true;
    setCheckingAvailability(true);
    user
      .getPromotionAvailability(planId, startDate)
      .then((result) => active && setAvailability(result))
      .catch(() => active && setAvailability(null))
      .finally(() => active && setCheckingAvailability(false));
    return () => {
      active = false;
    };
  }, [placement, planId, startDate, user]);

  const checkout = async () => {
    if (!user || !organizerProfile || !eventId || !startDate || !selectedPlan) return;
    setBillingAttempted(true);
    const billingError = validatePromotionBillingDetails(billingDetails);
    if (billingError) {
      toast.error(t(billingError));
      return;
    }
    setCheckingOut(true);
    try {
      if (billingSource === "new" && rememberBilling) {
        try {
          const saved = promotionBillingFromSaved(await saveBillingDetails(
            savedCompanyBilling(billingDetails, organizerProfile),
            user.properties.id,
          ));
          setSavedBilling(saved);
          setBillingDetails(saved);
          setBillingSource("saved");
          setRememberBilling(false);
        } catch {
          toast.error(t("checkout.billingSaveFailed"));
        }
      }
      const result = await user.createPromotionCheckout({
        eventId,
        plan: planId,
        placement,
        startDate,
        billingDetails,
      });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("promotions.checkoutFailed"),
      );
      setCheckingOut(false);
    }
  };

  return (
    <main className="app-page-spacing mx-auto max-w-5xl pb-32">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("promotions.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("promotions.subtitle")}
        </p>
      </header>

      <section className="mt-7 rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("promotions.settings")}
          </h2>
        </div>
        {loading ? (
          <div className="mt-5 h-64 animate-pulse rounded-2xl bg-white/5" />
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("promotions.event")}
              </p>
              <ThemedSelect
                value={eventId}
                onChange={setEventId}
                placeholder={t("promotions.chooseEvent")}
                icon={CalendarDays}
                options={eligibleEvents.map((event) => ({
                  value: event.id,
                  label: event.title,
                }))}
              />
              {eligibleEvents.length === 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  {t("promotions.noEligibleEvents")}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("promotions.placement")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["home_banner", "feed"] as const).map((option) => {
                  const active = option === placement;
                  const Icon = option === "home_banner" ? GalleryHorizontalEnd : Rows3;
                  const name = option === "home_banner"
                    ? t("promotions.bannerName")
                    : t("promotions.feedName");
                  const description = option === "home_banner"
                    ? t("promotions.bannerDescription")
                    : t("promotions.feedDescription");
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPlacement(option)}
                      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${active ? "border-primary/50 bg-primary/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{name}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {placement === "home_banner" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("promotions.bannerReservationHint")}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("promotions.plan")}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {visiblePlans.map((plan) => {
                  const active = plan.id === planId;
                  return (
                    <button
                      key={`${plan.placement}-${plan.id}`}
                      type="button"
                      onClick={() => setPlanId(plan.id)}
                      className={`relative rounded-2xl border p-4 text-left transition ${active ? "border-primary/50 bg-primary/10" : "border-white/10 bg-black/15 hover:border-white/20"}`}
                    >
                      {active && (
                        <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <p className="pr-7 text-sm font-semibold">
                        {t(`promotions.plans.${plan.id}.name`)}
                      </p>
                      <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">
                        {t(`promotions.plans.${plan.id}.description`)}
                      </p>
                      <p className="mt-3 text-lg font-bold text-primary">
                        {t("promotions.amount", { amount: plan.amountRon })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {t("promotions.startDate")}
              </p>
              <ThemedSelect
                value={startDate}
                onChange={setStartDate}
                placeholder={t("promotions.chooseDate")}
                icon={CalendarDays}
                options={dateOptions}
              />
              {selectedEvent && dateOptions.length === 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  {t("promotions.eventTooSoon")}
                </p>
              )}
              {placement === "home_banner" && startDate && (
                <p className={`mt-2 text-xs ${availability?.availableSlots === 0 ? "text-red-400" : "text-muted-foreground"}`}>
                  {checkingAvailability
                    ? t("promotions.checkingAvailability")
                    : availability?.availableSlots === 0
                      ? t("promotions.bannerSoldOut")
                      : availability
                        ? t("promotions.bannerSlotsAvailable", {
                            count: availability.availableSlots,
                            capacity: availability.capacity,
                          })
                        : null}
                </p>
              )}
            </div>
            <div className="border-t border-white/10 pt-5">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {t("promotions.billing")}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("promotions.billingHint")}
              </p>
              {billingLoading ? (
                <div className="mt-4 grid min-h-20 place-items-center rounded-xl border border-white/10 bg-white/[0.02]">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {savedBilling && (
                    <div role="radiogroup" aria-label={t("checkout.billingDetailsChoice")} className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={billingSource === "saved"}
                        onClick={() => {
                          setBillingSource("saved");
                          setBillingDetails({ ...savedBilling });
                          setBillingAttempted(false);
                          setRememberBilling(false);
                        }}
                        className={`rounded-xl border p-3.5 text-left transition ${billingSource === "saved" ? "border-primary/70 bg-primary/10" : "border-white/10 bg-white/[0.02]"}`}
                      >
                        <span className="block text-sm font-semibold">{t("checkout.useSavedBilling")}</span>
                        <span className="mt-1 block break-words text-xs leading-5 text-white/55">
                          {savedBilling.address}, {savedBilling.city}
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={billingSource === "new"}
                        onClick={() => {
                          setBillingSource("new");
                          setBillingDetails(
                            emptyPromotionBillingDetails(
                              organizerProfile?.fiscalAddress ?? "",
                            ),
                          );
                          setBillingAttempted(false);
                          setRememberBilling(true);
                        }}
                        className={`rounded-xl border p-3.5 text-left text-sm font-semibold transition ${billingSource === "new" ? "border-primary/70 bg-primary/10" : "border-white/10 bg-white/[0.02]"}`}
                      >
                        {t("checkout.useOtherBilling")}
                      </button>
                    </div>
                  )}
                  {billingSource === "new" || !savedBilling ? (
                    <>
                      <PromotionBillingDetailsFields
                        value={billingDetails}
                        onChange={setBillingDetails}
                        idPrefix="promotion"
                        errors={billingErrors}
                      />
                      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={rememberBilling}
                          onChange={(event) => setRememberBilling(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                        />
                        <span>
                          {t(savedBilling ? "checkout.replaceSavedBilling" : "checkout.rememberBilling")}
                          <span className="mt-1 block text-xs leading-5 text-white/45">{t("checkout.rememberBillingHint")}</span>
                        </span>
                      </label>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t("promotions.singlePayment")}
                </p>
                <p className="mt-1 text-xl font-bold">
                  {t("promotions.amount", {
                    amount: selectedPlan?.amountRon ?? 0,
                  })}
                </p>
              </div>
              <UIActionButton
                type="button"
                onClick={() => void checkout()}
                disabled={
                  checkingOut || billingLoading || !eventId || !startDate || !selectedPlan
                  || organizerProfile?.verificationStatus !== "approved"
                  || checkingAvailability
                  || (placement === "home_banner" && availability?.availableSlots === 0)
                }
                className="inline-flex h-12 items-center justify-center gap-2 px-6 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checkingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                {checkingOut
                  ? t("promotions.redirecting")
                  : t("promotions.payAndPromote")}
              </UIActionButton>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            {t("promotions.statistics")}
          </h2>
        </div>
        <div className="space-y-3">
          {sortedCampaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {campaign.placement === "feed"
                      ? t("promotions.feedName")
                      : t("promotions.bannerName")}
                  </p>
                  <p className="text-sm font-semibold">{campaign.eventTitle}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(new Date(campaign.startsAt))}{" "}
                    –{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(new Date(campaign.endsAt))}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${campaign.status === "active" ? "bg-emerald-400/15 text-emerald-300" : campaign.status === "scheduled" ? "bg-amber-400/15 text-amber-300" : "bg-white/10 text-muted-foreground"}`}
                >
                  {t(`promotions.status.${campaign.status}`)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat
                  icon={Eye}
                  label={t("promotions.impressions")}
                  value={String(campaign.impressionsCount)}
                />
                <Stat
                  icon={MousePointerClick}
                  label={t("promotions.clicks")}
                  value={String(campaign.clicksCount)}
                />
                <Stat
                  icon={BarChart3}
                  label="CTR"
                  value={`${Number(campaign.ctr).toFixed(1)}%`}
                />
              </div>
              <p className="mt-3 text-right text-xs text-muted-foreground">
                {t("promotions.paymentSummary", { amount: campaign.amountRon })}
              </p>
              {campaign.invoiceStatus && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3 text-xs">
                  <span className="text-muted-foreground">
                    {t("promotions.invoiceStatusLabel")}: {t(`promotions.invoiceStatus.${campaign.invoiceStatus}`)}
                  </span>
                  {campaign.invoiceDocumentUrl && (
                    <a
                      href={campaign.invoiceDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {t("promotions.openInvoice")}
                    </a>
                  )}
                </div>
              )}
              {campaign.attentionRequired && (
                <div role="alert" className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                  <span className="font-semibold">{t("promotions.invoiceAttentionTitle")}</span>
                  <span className="mt-1 block">{t("promotions.invoiceAttention")}</span>
                  {(campaign.invoiceRefundedRon ?? 0) > 0 && (
                    <span className="mt-1 block">
                      {t("promotions.refundedAmount", { amount: campaign.invoiceRefundedRon })}
                    </span>
                  )}
                </div>
              )}
            </article>
          ))}
          {!loading && campaigns.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
              {t("promotions.noCampaigns")}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-black/20 p-3">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <p className="mt-2 text-lg font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
