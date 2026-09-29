"use client";

import { useEffect, useRef, useState } from "react";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { eventCategories } from "@/core/mappers";
import type { User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { useClientQuery } from "@/lib/useClientQuery";
import { RequestError } from "@/components/ui/RequestFeedback";

export function HiddenEventCategories() {
  const { user } = useDataProvider();
  return user ? <CategoryPreferences key={user.properties.id} user={user} /> : null;
}

function CategoryPreferences({ user }: { user: User }) {
  const { t } = useTranslation();
  const { data: hidden, pending, error, retry } = useClientQuery<string[]>(
    `hidden-categories:${user.properties.id}`,
    () => user.listHiddenCategories(), [],
  );
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  const changes = useRef(new Map<string, { confirmed: boolean; desired: boolean; saving: boolean }>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const toggle = async (category: string) => {
    if (pending || error) return;
    let change = changes.current.get(category);
    if (!change) {
      const selected = hidden.includes(category);
      change = { confirmed: selected, desired: selected, saving: false };
      changes.current.set(category, change);
    }
    change.desired = !change.desired;
    const desired = change.desired;
    setSelections((previous) => ({ ...previous, [category]: desired }));
    if (change.saving) return;
    change.saving = true;
    try {
      // Keep requests ordered per category; rapid taps retain the latest choice.
      while (change.confirmed !== change.desired) {
        const target = change.desired;
        if (target) await user.hideEventCategory(category);
        else await user.showEventCategory(category);
        change.confirmed = target;
      }
    } catch {
      change.desired = change.confirmed;
      const confirmed = change.confirmed;
      if (mounted.current) {
        setSelections((previous) => ({ ...previous, [category]: confirmed }));
        toast.error(t("feedback.actionFailed"));
      }
    } finally { change.saving = false; }
  };
  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <EyeOff className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold">{t("hiddenCategories.title")}</h2>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("hiddenCategories.hint")}</p>
      {error ? <RequestError onRetry={retry} className="mt-4" /> : <>
        <div className="mt-4 flex flex-wrap gap-2" aria-busy={pending}>
          {eventCategories.map((category) => {
            const selected = selections[category] ?? hidden.includes(category);
            return <button type="button" key={category} disabled={pending} aria-pressed={selected} onClick={() => void toggle(category)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${selected ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-white/25"}`}>{category}</button>;
          })}
        </div>
      </>}
    </section>
  );
}
