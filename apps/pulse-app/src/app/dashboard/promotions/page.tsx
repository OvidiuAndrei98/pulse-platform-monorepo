"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  Loader2,
  Megaphone,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  type PromotionCampaign,
  type PromotionPlan,
  User,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function PromotionsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useDataProvider();
  const { events } = User.useOrganizerEvents(user);
  const [plans, setPlans] = useState<PromotionPlan[]>([]);
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [planId, setPlanId] = useState<PromotionPlan["id"]>("one_day");
  const [eventId, setEventId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";

  useEffect(() => {
    if (!user) return;
    Promise.all([user.listPromotionPlans(), user.listPromotionCampaigns()])
      .then(([nextPlans, nextCampaigns]) => {
        setPlans(nextPlans);
        setCampaigns(nextCampaigns);
      })
      .catch(() => toast.error(t("promotions.loadFailed")))
      .finally(() => setLoading(false));
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
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedEvent = eligibleEvents.find((event) => event.id === eventId);

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

  const checkout = async () => {
    if (!user || !eventId || !startDate || !selectedPlan) return;
    setCheckingOut(true);
    try {
      const result = await user.createPromotionCheckout({
        eventId,
        plan: planId,
        startDate,
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
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Megaphone className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            {t("dashboardNav.organizer")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {t("promotions.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("promotions.subtitle")}
          </p>
        </div>
      </div>

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
                {t("promotions.plan")}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {plans.map((plan) => {
                  const active = plan.id === planId;
                  return (
                    <button
                      key={plan.id}
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
              <button
                type="button"
                onClick={() => void checkout()}
                disabled={
                  checkingOut || !eventId || !startDate || !selectedPlan
                }
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checkingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                {checkingOut
                  ? t("promotions.redirecting")
                  : t("promotions.payAndPromote")}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">
            {t("promotions.statistics")}
          </h2>
        </div>
        <div className="mt-4 space-y-3">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
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
