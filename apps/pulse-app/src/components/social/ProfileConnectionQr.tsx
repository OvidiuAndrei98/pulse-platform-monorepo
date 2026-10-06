"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QrCode, ScanLine } from "lucide-react";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { Drawer, DrawerContent, DrawerDescription, DrawerHandleOverlay, DrawerTitle } from "@/components/ui/drawer";
import { useDrawerViewport } from "@/components/ui/useDrawerViewport";
import { useTranslation } from "react-i18next";
import styles from "./connectionSheet.module.css";

type Mode = "code" | "scan";

export function ProfileConnectionQr() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [showCode, setShowCode] = useState(false);
  const [presented, setPresented] = useState(false);
  const [mode, setMode] = useState<Mode>("code");
  const [resizing, setResizing] = useState(false);
  const [message, setMessage] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(showCode);
  openRef.current = showCode;
  const request = useRef(0);
  const desktopViewportRef = useDrawerViewport(isDesktop && presented, "panel");
  const closeSheet = () => { request.current++; setShowCode(false); };
  useEffect(() => {
    if (!showCode || !isDesktop) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { request.current++; setShowCode(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCode, isDesktop]);
  const openSheet = () => {
    request.current++;
    setMessage(""); setMode("code"); setResizing(false);
    setPresented(true); setShowCode(true);
  };
  const changeMode = (next: Mode) => {
    if (next === mode) return;
    request.current++; setMessage(""); setResizing(true); setMode(next);
  };
  useEffect(() => {
    if (!resizing) return;
    const timer = window.setTimeout(() => setResizing(false), 320);
    return () => window.clearTimeout(timer);
  }, [mode, resizing]);
  useEffect(() => {
    if (showCode || !presented) return;
    if (isDesktop) { setPresented(false); return; }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const animations = surfaceRef.current?.getAnimations() ?? [];
      void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (!cancelled && !openRef.current) setPresented(false);
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [showCode, presented, isDesktop]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => () => { request.current++; }, []);

  if (!user) return null;
  const value = `glow://friend/${user.properties.id}`;
  const connect = async (scanned: string) => {
    const current = ++request.current;
    setMessage("");
    const match = scanned.match(/^(?:glow|pulse):\/\/friend\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (!match) { setMessage(t("qr.invalidConnection")); return; }
    if (match[1].toLowerCase() === user.properties.id.toLowerCase()) { setMessage(t("qr.ownCode")); return; }
    try {
      await ApiClient.instance.post("/friends/connect/{userId}", { params: { path: { userId: match[1] } } });
      if (request.current === current) setMessage(t("qr.connected"));
    } catch (error) {
      if (request.current !== current) return;
      setMessage(error instanceof ApiError
        ? t(error.status === 401 ? "qr.sessionExpired" : "qr.connectionRejected", { status: error.status })
        : t("qr.connectionOffline"));
    }
  };
  const Title = isDesktop ? "h2" : DrawerTitle;
  const Description = isDesktop ? "p" : DrawerDescription;
  const body = <div className={styles.layout}>
    <header className={styles.header}>
      <Title className={styles.title}>{t("qr.quickConnect")}</Title>
      <Description className={styles.description}>{t("qr.showOrScanOther")}</Description>
    </header>
    <div role="group" aria-label={t("qr.quickConnect")} className={styles.tabs}>
      <span aria-hidden="true" className={styles.pill} style={{ transform: mode === "scan" ? "translateX(100%)" : "translateX(0)" }} />
      {(["code", "scan"] as const).map(item => {
        const Icon = item === "code" ? QrCode : ScanLine;
        return <button key={item} type="button" aria-pressed={mode === item} onClick={() => changeMode(item)} className={styles.tab}>
          <Icon className="h-4 w-4" aria-hidden="true" />{t(item === "code" ? "qr.myCode" : "qr.scanQr")}
        </button>;
      })}
    </div>
    {mode === "code" && <div className={styles.code}>
      <img src="/spottr-logo-desktop.svg" alt="SPOTTR" className={styles.logo} width="120" height="20" />
      <div className={styles.codeStage}><div className={styles.qr}><TicketQrCode value={value} size={480} alt={t("qr.profileCode")} /></div></div>
      <p className={styles.name}>{user.properties.username}</p>
    </div>}
    <div className={styles.content} style={{ display: mode === "scan" ? "flex" : "none" }}>
      <QrCameraScanner embedded enabled={showCode && mode === "scan"} onScan={connect} onStart={() => { request.current++; setMessage(""); }} hint={t("qr.profileCameraHint")} />
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>;

  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
      {/* Layout adaptativ vertical (flex-col) care trece pe orizontal doar pe ecrane mari (xl:flex-row) */}
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Container Iconita + Text */}
        <div className="flex items-start gap-3 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <QrCode className="h-5 w-5 shrink-0" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white leading-tight">
              {t("qr.quickConnect")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {t("qr.showOrScan")}
            </p>
          </div>
        </div>

        {/* Butonul de actiune - ocupa latimea containerului in sidebar */}
        <button
          type="button"
          onClick={openSheet}
          className="flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/10 active:scale-95 xl:w-auto"
        >
          {t("qr.myCode")}
        </button>
      </div>

      {message && <p className="mt-3 text-xs text-primary">{message}</p>}

      {isDesktop ? (presented && createPortal(
        <div ref={desktopViewportRef} className={styles.desktopOverlay} onClick={closeSheet}>
          <section role="dialog" aria-modal="true" aria-label={t("qr.quickConnect")} data-connection-sheet data-mode={mode} data-resizing={resizing}
            className={`native-barcode-scanner-ui ${styles.surface} ${styles.desktop}`} onClick={event => event.stopPropagation()}>
            {body}
          </section>
        </div>, document.body
      )) : (
        <Drawer historyBack={false} open={showCode} onOpenChange={open => !open && closeSheet()}
          onAnimationEnd={open => { if (!open && !openRef.current) setPresented(false); }}
          modal fixed closeThreshold={0.35} repositionInputs={false} shouldScaleBackground={false}>
          {presented && <DrawerContent ref={surfaceRef} showHandle={false} sideInset lockDocument={false}
            data-connection-sheet data-mode={mode} data-resizing={resizing}
            className={`native-barcode-scanner-ui rounded-t-4xl border-none bg-black p-0 touch-none ${styles.surface}`}>
            <DrawerHandleOverlay />
            {body}
          </DrawerContent>}
        </Drawer>
      )}
    </section>
  );
}
