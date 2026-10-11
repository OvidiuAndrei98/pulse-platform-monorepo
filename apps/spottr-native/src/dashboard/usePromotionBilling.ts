import { useEffect, useRef, useState } from "react";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { parseBilling } from "../checkout/data";
import {
  emptyPromotionBillingDetails,
  normalizedCUI,
  promotionBillingFromSaved,
  savedCompanyBilling,
  validatePromotionBillingDetails,
  type PromotionBillingDetails,
} from "../../../pulse-app/src/features/promotions/promotionBilling";
import type { OrganizerProfile } from "./data";

export function usePromotionBilling(profile?: OrganizerProfile) {
  const { user, controller } = useAuth();
  const [details, setDetails] = useState(emptyPromotionBillingDetails);
  const [saved, setSaved] = useState<PromotionBillingDetails | null>(null);
  const [source, setSource] = useState<"saved" | "new">("new");
  const [remember, setRemember] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  const version = useRef(0),
    edited = useRef(false);
  useEffect(() => {
    const operation = ++version.current;
    let active = true;
    if (!user || !profile) {
      setLoading(false);
      return () => {
        active = false;
        version.current++;
      };
    }
    setLoading(true);
    setError("");
    void accountApi<{ details: unknown }>("/users/me/billing-details")
      .then((response) => {
        const value = parseBilling(response.details);
        if (!active) return;
        const candidate =
          value?.type === "company" &&
          normalizedCUI(value.taxId) === normalizedCUI(profile.cui)
            ? promotionBillingFromSaved(value)
            : null;
        // Older saved addresses can be incomplete under current invoice rules.
        // Preserve their values in editable fields instead of hiding validation.
        const reusable =
          candidate && !validatePromotionBillingDetails(candidate)
            ? candidate
            : null;
        setSaved(reusable);
        if (!edited.current) {
          setDetails(
            candidate ?? emptyPromotionBillingDetails(profile.fiscalAddress),
          );
          setSource(reusable ? "saved" : "new");
        }
      })
      .catch(() => {
        if (active) {
          setError("checkout.billingLoadFailed");
          if (!edited.current)
            setDetails(emptyPromotionBillingDetails(profile.fiscalAddress));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (version.current === operation) version.current++;
    };
  }, [user?.id, profile?.cui, profile?.fiscalAddress, reload]);
  return {
    details,
    saved,
    source,
    remember,
    loading,
    error,
    setRemember,
    retry: () => setReload((value) => value + 1),
    change: (value: PromotionBillingDetails) => {
      edited.current = true;
      setDetails(value);
    },
    choose: (value: "saved" | "new") => {
      edited.current = true;
      setSource(value);
      setRemember(value === "new");
      setDetails(
        value === "saved" && saved
          ? { ...saved }
          : emptyPromotionBillingDetails(profile?.fiscalAddress),
      );
    },
    async saveIfRequested() {
      if (!profile) throw new Error("MISSING_ORGANIZER_PROFILE");
      if (source !== "new" || !remember) return;
      const operation = version.current,
        token = controller.getToken();
      setError("");
      try {
        const value = parseBilling(
          await accountApi("/users/me/billing-details", {
            method: "PUT",
            body: savedCompanyBilling(details, profile),
          }),
        );
        if (operation !== version.current || token !== controller.getToken())
          throw new Error("SESSION_CHANGED");
        if (!value) throw new Error("INVALID_BILLING");
        const reusable = promotionBillingFromSaved(value);
        setSaved(reusable);
        setSource("saved");
        setDetails(reusable);
        setRemember(false);
      } catch (error) {
        if (operation !== version.current || token !== controller.getToken())
          throw error;
        // Saving a reusable profile is optional; the current invoice still uses its submitted details.
        setError("checkout.billingSaveFailed");
      }
    },
  };
}
