"use client";

import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/lib/native/platform";
import { apiRoot } from "@/core/apiRoot";

export function GoogleSignInButton({
  returnTo,
  className = "",
}: {
  returnTo?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const startGoogleLogin = async () => {
    const url = new URL(`${apiRoot}/auth/google`);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    if (isNativePlatform()) {
      url.searchParams.set("client", "mobile");
      await Browser.open({ url: url.toString(), presentationStyle: "popover" });
      return;
    }
    window.location.assign(url.toString());
  };

  return (
    <button
      type="button"
      onClick={() => void startGoogleLogin()}
      className={`flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-foreground transition hover:border-white/25 hover:bg-white/[0.08] ${className}`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-black">
        G
      </span>
      {t("common.continueWithGoogle")}
    </button>
  );
}
