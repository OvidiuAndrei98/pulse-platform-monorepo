"use client";

import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { isNativePlatform } from "@/lib/native/platform";
import { apiRoot } from "@/core/apiRoot";

export function GoogleSignInButton({
  returnTo,
  className = "",
  variant = "default",
}: {
  returnTo?: string;
  className?: string;
  variant?: "default" | "light";
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
      className={`flex h-14 w-full items-center justify-center gap-3 px-4 text-sm font-semibold transition ${
        variant === "light"
          ? "rounded-xl bg-white text-black shadow-[0_12px_32px_rgba(0,0,0,0.22)] hover:bg-white/90"
          : "rounded-2xl bg-white/[0.055] text-foreground hover:bg-white/[0.09]"
      } ${className}`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-black">
        G
      </span>
      {t("common.continueWithGoogle")}
    </button>
  );
}
