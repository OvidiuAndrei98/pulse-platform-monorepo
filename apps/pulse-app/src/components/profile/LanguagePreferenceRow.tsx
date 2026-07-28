"use client";

import { Globe2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDataProvider } from "@/core/DataProviderContext";

export function LanguagePreferenceRow() {
  const { i18n, t } = useTranslation();
  const { user, updateSessionUser } = useDataProvider();
  const isRomanian = i18n.resolvedLanguage === "ro";
  const changeLanguage = async () => {
    const nextLanguage = isRomanian ? "en" : "ro";
    if (user) {
      const updatedUser = await user.updateProfile({
        preferredLanguage: nextLanguage,
      });
      updateSessionUser(updatedUser);
    }
    await i18n.changeLanguage(nextLanguage);
  };
  return <button type="button" onClick={() => void changeLanguage()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.04]"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-muted-foreground"><Globe2 className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("profile.language")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{isRomanian ? t("profile.romanian") : t("profile.english")}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>;
}
