"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useFeedbackAction() {
  const { t } = useTranslation();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, errorMessage?: string) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try { await action(); return true; }
    catch { toast.error(errorMessage ?? t("feedback.actionFailed")); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  return { busy, run };
}
