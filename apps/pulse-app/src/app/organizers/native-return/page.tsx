"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { nativeOrganizerReturn } from "@/features/checkout/organizerReturn";

export default function NativeOrganizerReturnPage() {
  const { t } = useTranslation();
  const [destination, setDestination] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = nativeOrganizerReturn(params);
    const isPreview = params.get("client") === "preview";
    setDestination(url);
    setReady(true);
    setPreview(isPreview);
    if (!url) return;
    if (isPreview) window.close();
    else window.location.replace(url);
  }, []);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/spottr-logo-desktop.svg"
          alt="SPOTTR"
          className="mx-auto h-10 w-auto"
        />
        <h1 className="text-2xl font-bold">{t("checkout.returnToApp")}</h1>
        <p className="text-sm leading-6 text-white/60">
          {t(
            ready && !destination
              ? "feedback.confirmationInvalid"
              : "checkout.returnToAppHint",
          )}
        </p>
        {destination &&
          (preview ? (
            <button
              onClick={() => window.close()}
              className="min-h-11 rounded-full bg-[#ff0044] px-6 text-sm font-semibold"
            >
              {t("checkout.returnToApp")}
            </button>
          ) : (
            <a
              href={destination}
              className="flex min-h-11 items-center justify-center rounded-full bg-[#ff0044] px-6 text-sm font-semibold"
            >
              {t("checkout.returnToApp")}
            </a>
          ))}
      </div>
    </main>
  );
}
