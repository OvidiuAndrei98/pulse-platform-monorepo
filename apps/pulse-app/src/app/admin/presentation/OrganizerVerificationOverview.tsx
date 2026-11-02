"use client";

import type { AdminOperationsPageModel } from "../useAdminOperations";
import { FinancialStat } from "./primitives";

export function OrganizerVerificationOverview({model}: {model: Pick<AdminOperationsPageModel, "counts" | "filter" | "setFilter" | "stripeCounts" | "t">}) {
 const { counts, filter, setFilter, stripeCounts, t }=model;

 return (<section>
          <div>
            <h2 className="text-lg font-semibold">{t("admin.organizersTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("admin.subtitle")}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FinancialStat label={t("admin.stripe.status.active")} value={String(stripeCounts.active)} />
            <FinancialStat label={t("admin.stripe.status.onboarding")} value={String(stripeCounts.onboarding)} />
            <FinancialStat label={t("admin.stripe.status.attention")} value={String(stripeCounts.attention)} />
            <FinancialStat label={t("admin.stripe.status.notConnected")} value={String(stripeCounts.notConnected)} />
          </dl>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {(["pending", "approved", "rejected", "all"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition ${
                  filter === status
                    ? "border-primary bg-[var(--ui-action)] text-primary-foreground"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                }`}
              >
                {t(`admin.filters.${status}`)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${filter === status ? "bg-black/20" : "bg-white/10"}`}>
                  {counts[status]}
                </span>
              </button>
            ))}
          </div>
        </section>);
}
