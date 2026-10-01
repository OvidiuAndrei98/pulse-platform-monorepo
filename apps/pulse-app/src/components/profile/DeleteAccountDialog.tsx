"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type DeleteAccountDialogProps = {
  open: boolean;
  email: string;
  requiresPassword: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (confirmation: string, currentPassword: string) => void;
};

export function DeleteAccountDialog({
  open,
  email,
  requiresPassword,
  busy,
  error,
  onClose,
  onConfirm,
}: DeleteAccountDialogProps) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  busyRef.current = busy;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setConfirmation("");
    setCurrentPassword("");
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onCloseRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const matches = confirmation.trim().toLowerCase() === email.trim().toLowerCase();
  const canDelete = matches && (!requiresPassword || currentPassword.length > 0);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        className="max-h-[calc(100dvh-max(1.5rem,var(--native-safe-top))-max(1.5rem,var(--native-safe-bottom)))] w-full max-w-md overflow-y-auto overscroll-contain rounded-[28px] border border-red-500/25 bg-[#0b0b0c] p-5 shadow-2xl shadow-red-950/30 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500/12 text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-account-title" className="text-xl font-semibold text-white">
              {t("userProfile.deleteDialogTitle")}
            </h2>
            <p id="delete-account-description" className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("userProfile.deleteDialogDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-red-500/15 bg-red-500/[0.06] p-4">
          <p className="text-sm font-medium text-red-200">{t("userProfile.deleteDialogWarning")}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-red-100/70">
            <li>{t("userProfile.deleteProfileData")}</li>
            <li>{t("userProfile.deleteTicketsData")}</li>
            <li>{t("userProfile.retainFiscalData")}</li>
          </ul>
        </div>

        <label className="mt-5 block text-sm font-medium text-white" htmlFor="delete-account-confirmation">
          {t("userProfile.deleteConfirmationLabel")}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("userProfile.deleteConfirmationHint", { email })}
        </p>
        <input
          id="delete-account-confirmation"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
          className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-muted-foreground/50 focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15 disabled:opacity-50"
          placeholder={email}
        />

        {requiresPassword ? (
          <>
            <label className="mt-4 block text-sm font-medium text-white" htmlFor="delete-account-password">
              {t("userProfile.deletePasswordLabel")}
            </label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={busy}
              className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15 disabled:opacity-50"
            />
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {t("userProfile.deleteGoogleReauthHint")}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-12 rounded-2xl border border-white/10 text-sm font-semibold text-white transition hover:bg-white/5 disabled:opacity-40"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(confirmation, currentPassword)}
            disabled={!canDelete || busy}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? t("userProfile.deletingAccount") : t("userProfile.confirmDelete")}
          </button>
        </div>
      </section>
    </div>
  );
}
