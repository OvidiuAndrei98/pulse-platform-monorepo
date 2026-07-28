"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, Loader2, ScanLine, Wifi, WifiOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";

type QrCameraScannerProps = {
  disabled?: boolean;
  onScan: (value: string) => void | Promise<void>;
  fullScreen?: boolean;
  continuous?: boolean;
  eventTitle?: string;
  isOnline?: boolean;
  className?: string;
};

export function QrCameraScanner({
  disabled,
  onScan,
  fullScreen = false,
  continuous = false,
  eventTitle,
  isOnline,
  className = "",
}: QrCameraScannerProps) {
  const { t } = useTranslation();
  const scannerId = `qr-scanner-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const processingScanRef = useRef(false);
  const lastScannedValueRef = useRef("");
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // The camera can already be closed by the browser.
    }
    try {
      await scanner.clear();
    } catch {
      // No additional cleanup is needed when the DOM node has unmounted.
    }
    setRunning(false);
  };

  const startScanner = async () => {
    if (disabled || starting || running) return;
    setStarting(true);
    setError("");
    hasScannedRef.current = false;
    processingScanRef.current = false;
    lastScannedValueRef.current = "";
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(scannerId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          if (
            processingScanRef.current ||
            (!continuous && hasScannedRef.current) ||
            (continuous && lastScannedValueRef.current === decodedText)
          ) return;

          hasScannedRef.current = true;
          processingScanRef.current = true;
          lastScannedValueRef.current = decodedText;
          if (!continuous) void stopScanner();

          void Promise.resolve(onScan(decodedText)).finally(() => {
            processingScanRef.current = false;
            if (continuous) {
              window.setTimeout(() => {
                if (lastScannedValueRef.current === decodedText) {
                  lastScannedValueRef.current = "";
                }
              }, 1_500);
            }
          });
        },
        () => undefined,
      );
      setRunning(true);
    } catch {
      scannerRef.current = null;
      setError(t("qr.cameraFailed"));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => () => { void stopScanner(); }, []);

  const scannerOverlay = fullScreen && (starting || running) ? (
    <div className="fixed inset-0 z-[200] bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-white/75">
            <ScanLine className="h-4 w-4 text-primary" />
            {t("qr.scanQr")}
          </p>
          {eventTitle && <p className="mt-1 truncate text-sm font-bold">{eventTitle}</p>}
        </div>
        {typeof isOnline === "boolean" && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isOnline ? "border-primary/35 bg-primary/15 text-primary" : "border-amber-300/35 bg-amber-300/10 text-amber-200"}`}>
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? t("validation.online") : t("validation.offline")}
          </span>
        )}
        <button type="button" onClick={() => void stopScanner()} aria-label={t("common.close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-sm transition hover:bg-white/15">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative h-full w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        <div id={scannerId} className="h-full w-full" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/20">
          <div className="relative h-[min(70vw,18rem)] w-[min(70vw,18rem)] max-h-[52dvh] max-w-[80vw]">
            <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-xl border-l-2 border-t-2 border-primary" />
            <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-xl border-r-2 border-t-2 border-primary" />
            <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-xl border-b-2 border-l-2 border-primary" />
            <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-xl border-b-2 border-r-2 border-primary" />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 text-center">
        {starting ? (
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin text-primary" />{t("qr.startingCamera")}</p>
        ) : (
          <p className="text-sm font-medium text-white/80">{t("qr.cameraHint")}</p>
        )}
        {error && <p className="mx-auto mt-3 max-w-sm text-xs text-red-300">{error}</p>}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-2 text-center">
      {!fullScreen && (starting || running) && <div id={scannerId} className="overflow-hidden rounded-lg border border-primary/30 bg-black" />}
      <button type="button" onClick={() => running ? void stopScanner() : void startScanner()} disabled={disabled || starting} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50 ${className}`}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {starting ? t("qr.startingCamera") : running ? t("qr.stopCamera") : t("qr.scanQr")}
      </button>
      {!fullScreen && error && <p className="text-xs text-red-400">{error}</p>}
      {scannerOverlay}
    </div>
  );
}
