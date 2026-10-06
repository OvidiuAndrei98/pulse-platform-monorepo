"use client";

import { useBackLayer } from "@/lib/navigation/useBackLayer";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { startWebQrCamera } from "./webQrCamera";
import {
  BarcodeFormat,
  BarcodeScanner,
  LensFacing,
} from "@capacitor-mlkit/barcode-scanning";
import type { PluginListenerHandle } from "@capacitor/core";
import { Camera, Loader2, ScanLine, Wifi, WifiOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isNativePlatform } from "@/lib/native/platform";
import { NativeCameraWindow } from "./NativeCameraWindow";
import styles from "./qrCameraScanner.module.css";

type QrCameraScannerProps = {
  enabled?: boolean;
  embedded?: boolean;
  hint?: string;
  disabled?: boolean;
  onScan: (value: string) => void | Promise<void>;
  onStart?: () => void;
  fullScreen?: boolean;
  continuous?: boolean;
  eventTitle?: string;
  isOnline?: boolean;
  scanFeedback?: ReactNode;
  className?: string;
};

export function QrCameraScanner({
  enabled = true,
  embedded = false,
  hint,
  disabled,
  onScan,
  onStart,
  fullScreen = false,
  continuous = false,
  eventTitle,
  isOnline,
  scanFeedback,
  className = "",
}: QrCameraScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const cameraAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const startupRef = useRef<Promise<void> | null>(null);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const nativeListenerRef = useRef<PluginListenerHandle | null>(null);
  const hasScannedRef = useRef(false);
  const processingScanRef = useRef(false);
  const lastScannedValueRef = useRef("");
  const lastScannedAtRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [nativeActive, setNativeActive] = useState(false);
  const isNative = isNativePlatform();

  const setNativeScannerActive = (active: boolean) => {
    document.documentElement.classList.toggle("native-barcode-scanner-active", active);
    document.body.classList.toggle("barcode-scanner-active", active);
    if (mountedRef.current) setNativeActive(active);
  };

  const stopScannerImpl = async () => {
    cameraAbortRef.current?.abort();
    if (mountedRef.current) { setRunning(false); setStarting(false); }
    // Camera permission/import can resolve after the sheet closes. Wait for
    // startup so the late stream is also stopped and cannot retain the camera.
    await startupRef.current;
    if (isNative) {
      try {
        await BarcodeScanner.stopScan();
      } catch {
        // The scanner can already be stopped when the app is backgrounded.
      }
      await nativeListenerRef.current?.remove();
      nativeListenerRef.current = null;
      setNativeScannerActive(false);
      if (mountedRef.current) setRunning(false);
    }
  };

  const stopScanner = () => {
    if (stoppingRef.current) return stoppingRef.current;
    const task = stopScannerImpl();
    stoppingRef.current = task;
    void task.finally(() => { if (stoppingRef.current === task) stoppingRef.current = null; });
    return task;
  };

  const startScannerImpl = async () => {
    if (!enabledRef.current || disabled || starting || running) return;
    setStarting(true);
    setError("");
    onStart?.();
    hasScannedRef.current = false;
    processingScanRef.current = false;
    lastScannedValueRef.current = "";
    lastScannedAtRef.current = 0;
    const controller = new AbortController();
    cameraAbortRef.current = controller;
    try {
      if (isNative) {
        const supported = await BarcodeScanner.isSupported();
        if (!supported.supported) throw new Error("BARCODE_SCANNING_UNSUPPORTED");

        const permission = await BarcodeScanner.checkPermissions();
        const granted = permission.camera === "granted"
          ? permission
          : await BarcodeScanner.requestPermissions();
        if (granted.camera !== "granted") throw new Error("CAMERA_PERMISSION_DENIED");
        if (controller.signal.aborted || !mountedRef.current) return;

        nativeListenerRef.current = await BarcodeScanner.addListener(
          "barcodesScanned",
          ({ barcodes }) => {
            const decodedText = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
            if (
              !decodedText || !mountedRef.current || controller.signal.aborted ||
              processingScanRef.current ||
              (!continuous && hasScannedRef.current) ||
              (continuous &&
                lastScannedValueRef.current === decodedText &&
                Date.now() - lastScannedAtRef.current < 6_000)
            ) return;

            hasScannedRef.current = true;
            processingScanRef.current = true;
            lastScannedValueRef.current = decodedText;
            lastScannedAtRef.current = Date.now();
            if (!continuous) void stopScanner();

            void Promise.resolve().then(() => onScan(decodedText)).catch(() => {
              if (mountedRef.current) setError(t("qr.cameraFailed"));
            }).finally(() => {
              processingScanRef.current = false;
            });
          },
        );
        setNativeScannerActive(true);
        await BarcodeScanner.startScan({
          formats: [BarcodeFormat.QrCode],
          lensFacing: LensFacing.Back,
        });
        if (mountedRef.current && !controller.signal.aborted) setRunning(true);
        return;
      }

      // Let React mount the fullscreen viewfinder before attaching a stream.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!mountedRef.current || controller.signal.aborted) return;
      const video = videoRef.current;
      if (!video) throw new Error("CAMERA_VIEWFINDER_UNAVAILABLE");
      await startWebQrCamera(video, controller.signal,
        (decodedText) => {
          if (
            !mountedRef.current || controller.signal.aborted || processingScanRef.current ||
            (!continuous && hasScannedRef.current) ||
            (continuous &&
              lastScannedValueRef.current === decodedText &&
              Date.now() - lastScannedAtRef.current < 6_000)
          ) return;

          hasScannedRef.current = true;
          processingScanRef.current = true;
          lastScannedValueRef.current = decodedText;
          lastScannedAtRef.current = Date.now();
          if (!continuous) void stopScanner();

          void Promise.resolve().then(() => onScan(decodedText)).catch(() => {
            if (mountedRef.current) setError(t("qr.cameraFailed"));
          }).finally(() => {
            processingScanRef.current = false;
          });
        },
      );
      if (mountedRef.current && !controller.signal.aborted) setRunning(true);
    } catch (caughtError) {
      const wasCancelled = controller.signal.aborted;
      controller.abort();
      await nativeListenerRef.current?.remove();
      nativeListenerRef.current = null;
      if (isNative) {
        try { await BarcodeScanner.stopScan(); } catch { /* Already stopped. */ }
        setNativeScannerActive(false);
      }
      const nativePluginUnavailable = isNative && /BARCODE_SCANNING_UNSUPPORTED|not implemented|not supported|unavailable|plugin/i.test(
        caughtError instanceof Error ? caughtError.message : "",
      );
      if (mountedRef.current && !wasCancelled) setError(t(nativePluginUnavailable ? "qr.nativeScannerUnavailable" : "qr.cameraFailed"));
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  const startScanner = () => {
    if (!enabledRef.current || startupRef.current || !mountedRef.current) return;
    if (stoppingRef.current) {
      void stoppingRef.current.then(() => { if (enabledRef.current && mountedRef.current) startScanner(); });
      return;
    }
    const task = startScannerImpl();
    startupRef.current = task;
    void task.finally(() => { if (startupRef.current === task) startupRef.current = null; });
  };

  // Inline cameras belong to their sheet's Back layer. A second history entry
  // can race the sheet's dismissal and leave the modal mounted over navigation.
  useBackLayer(fullScreen && (running || starting), () => { void stopScanner(); });
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; void stopScanner(); };
  }, []);
  useEffect(() => {
    if (!enabled) void stopScanner();
  }, [enabled]);

  if (embedded) {
    return (
      <div className={styles.embedded}>
        {isNative && nativeActive && <NativeCameraWindow viewport={previewRef} />}
        <div ref={previewRef} className={`${styles.viewport} ${isNative && nativeActive ? styles.native : ""}`}>
          {!isNative && <video ref={videoRef} muted playsInline className={styles.video} />}
          {starting || running ? <div aria-hidden="true" className={styles.guide}><div className={styles.frame} /></div> : (
            <div className={styles.idle}><ScanLine aria-hidden="true" /><p className={styles.hint}>{hint ?? t("qr.cameraHint")}</p></div>
          )}
        </div>
        <button type="button" onClick={() => running ? void stopScanner() : startScanner()} disabled={!enabled || disabled || starting} className={styles.action}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {starting ? t("qr.startingCamera") : running ? t("qr.stopCamera") : t("qr.scanQr")}
        </button>
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    );
  }

  const scannerOverlay = fullScreen && (starting || running) ? (
    <div className={`native-barcode-scanner-ui fixed inset-0 z-[200] text-white ${isNative ? "bg-transparent" : "bg-black"}`}>
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

      <div className={`relative h-full w-full ${isNative ? "bg-transparent" : "bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-cover"}`}>
        {!isNative && <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />}
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
        {isNative && scanFeedback ? (
          <div className="mx-auto max-w-md text-left">{scanFeedback}</div>
        ) : starting ? (
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
      {!fullScreen && <div className={`${starting || running ? "" : "hidden"} relative mx-auto aspect-square w-full max-w-[min(100%,36dvh,20rem)] overflow-hidden rounded-xl bg-black`}>
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-white/80" />
      </div>}
      <button type="button" onClick={() => running ? void stopScanner() : void startScanner()} disabled={disabled || starting} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50 ${className}`}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {starting ? t("qr.startingCamera") : running ? t("qr.stopCamera") : t("qr.scanQr")}
      </button>
      {error && <p className="mx-auto max-w-md text-xs text-red-400">{error}</p>}
      {scannerOverlay}
    </div>
  );
}
