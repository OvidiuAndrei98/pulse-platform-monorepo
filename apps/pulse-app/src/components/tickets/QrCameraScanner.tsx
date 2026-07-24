"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, Loader2, X } from "lucide-react";

type QrCameraScannerProps = {
  disabled?: boolean;
  onScan: (value: string) => void;
};

export function QrCameraScanner({ disabled, onScan }: QrCameraScannerProps) {
  const scannerId = `qr-scanner-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
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
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(scannerId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (decodedText) => {
          void stopScanner();
          onScan(decodedText);
        },
        () => undefined,
      );
      setRunning(true);
    } catch {
      scannerRef.current = null;
      setError("Camera nu a putut fi pornita. Permite accesul la camera si incearca din nou.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => () => { void stopScanner(); }, []);

  return (
    <div className="space-y-2">
      {(starting || running) && <div id={scannerId} className="overflow-hidden rounded-lg border border-primary/30 bg-black" />}
      <button type="button" onClick={() => running ? void stopScanner() : void startScanner()} disabled={disabled || starting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition hover:bg-white/5 disabled:opacity-50">
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : running ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {starting ? "Se porneste camera..." : running ? "Opreste camera" : "Scaneaza QR"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
