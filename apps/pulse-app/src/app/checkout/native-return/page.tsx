"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nativeCheckoutReturn } from "@/features/checkout/nativeReturn";

export default function NativeCheckoutReturnPage() {
  const { t } = useTranslation();
  const [destination, setDestination] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const url = nativeCheckoutReturn(new URLSearchParams(window.location.search));
    setDestination(url);
    setReady(true);
    if (url) window.location.replace(url);
  }, []);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* A plain asset also works when returning from an external payment browser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spottr-logo-desktop.svg" alt="SPOTTR" className="mx-auto h-10 w-auto" />
        <h1 className="text-2xl font-bold">{t("checkout.returnToApp")}</h1>
        <p className="text-sm leading-6 text-white/60">
          {t(ready && !destination ? "feedback.confirmationInvalid" : "checkout.returnToAppHint")}
        </p>
        {destination && <a href={destination} className="flex min-h-11 items-center justify-center rounded-full bg-[#ff0044] px-6 text-sm font-semibold">{t("checkout.returnToApp")}</a>}
      </div>
    </main>
  );
}
