"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDataProvider } from "@/core/DataProviderContext";

export function AttendancePrivacyRow() {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(
    user?.properties.showAttendancePublicly ?? true,
  );

  useEffect(() => {
    if (user) setIsVisible(user.properties.showAttendancePublicly);
  }, [user]);

  if (!user) return null;

  const toggleVisibility = async () => {
    if (saving) return;

    const nextVisibility = !isVisible;
    setIsVisible(nextVisibility);
    setSaving(true);
    setFailed(false);
    try {
      await user.updateProfile({ showAttendancePublicly: nextVisibility });
    } catch {
      setIsVisible(!nextVisibility);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggleVisibility()}
      aria-pressed={isVisible}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.04] disabled:cursor-wait disabled:opacity-60"
      disabled={saving}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-muted-foreground">
        {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t("profile.attendancePrivacy")}</span>
        <span className={`mt-0.5 block text-xs ${failed ? "text-red-400" : "text-muted-foreground"}`}>
          {failed
            ? t("profile.privacyUpdateFailed")
            : isVisible
              ? t("profile.attendanceVisible")
              : t("profile.attendanceHidden")}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full border transition ${isVisible ? "border-primary/45 bg-primary" : "border-white/15 bg-white/5"}`}
      >
        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${isVisible ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
