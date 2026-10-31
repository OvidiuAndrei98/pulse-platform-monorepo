"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { eventCategories } from "@/core/mappers";
import type { User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { useClientQuery } from "@/lib/useClientQuery";
import { RequestError } from "@/components/ui/RequestFeedback";
import { Drawer, DrawerContent, DrawerDescription, DrawerHandleOverlay, DrawerTitle } from "@/components/ui/drawer";

type PreferencesProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHiddenCountChange: (count: number | null) => void;
  returnFocusRef: { current: HTMLButtonElement | null };
};

export function EventPreferencesRow({ hiddenCount, onOpen }: {
  hiddenCount: number | null;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => onOpen(event.currentTarget)}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t("hiddenCategories.preferencesTitle")}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {hiddenCount ? t("hiddenCategories.count", { count: hiddenCount }) : t("hiddenCategories.preferencesHint")}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export function HiddenEventCategories(props: PreferencesProps) {
  const { user } = useDataProvider();
  return user ? <CategoryPreferences key={user.properties.id} user={user} {...props} /> : null;
}

function CategoryPreferences({ user, open, onOpenChange, onHiddenCountChange, returnFocusRef }: PreferencesProps & { user: User }) {
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

  const hiddenCount = eventCategories.filter((category) => selections[category] ?? hidden.includes(category)).length;
  useEffect(() => {
    onHiddenCountChange(pending || error ? null : hiddenCount);
  }, [hiddenCount, pending, error, onHiddenCountChange]);

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
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false} fixed closeThreshold={0.35} repositionInputs={false}>
      <DrawerContent
        data-preferences-sheet sideInset showHandle={false} lockDocument={false}
        className="mx-auto h-[min(78svh,36rem)] max-w-xl rounded-t-4xl border-none bg-black p-0 touch-none"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus({ preventScroll: true });
        }}
      >
        <DrawerHandleOverlay />
        <header className="shrink-0 px-5 pb-5 pt-9 text-left">
          <DrawerTitle className="text-2xl! font-bold! tracking-[-0.035em] text-white">{t("hiddenCategories.preferencesTitle")}</DrawerTitle>
          <DrawerDescription className="mt-2 text-xs leading-5 text-white/55">{t("hiddenCategories.hint")}</DrawerDescription>
        </header>
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-5 pb-7">
          <h3 className="mb-3 text-sm font-semibold">{t("hiddenCategories.title")}</h3>
          {error ? <RequestError onRetry={retry} /> : (
            <div className="flex flex-wrap gap-2" aria-busy={pending}>
              {eventCategories.map((category) => {
                const selected = selections[category] ?? hidden.includes(category);
                return (
                  <button
                    type="button" key={category} disabled={pending} aria-pressed={selected}
                    onClick={() => void toggle(category)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-50 ${selected ? "bg-[var(--ui-action)] text-white" : "bg-[#161616] text-muted-foreground hover:bg-white/10 hover:text-white"}`}
                  >
                    <span className="grid h-4 w-4 place-items-center" aria-hidden="true">
                      {selected ? <Check className="h-4 w-4" /> : <span className="h-3 w-3 rounded-full border border-white/25" />}
                    </span>
                    {category}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="shrink-0 px-5 pb-7 pt-3 text-center text-xs leading-5 text-white/45">{t("hiddenCategories.savedAutomatically")}</p>
      </DrawerContent>
    </Drawer>
  );
}
