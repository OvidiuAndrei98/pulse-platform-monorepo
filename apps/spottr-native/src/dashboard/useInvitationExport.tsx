import React, { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import type { PrintableTicket } from "../../../pulse-app/src/components/tickets/ticketDesign";
import { exportInvitationBatch } from "./invitationPdf";
export function useInvitationExport() {
  const { controller } = useAuth(),
    { copy, language } = usePreferences(),
    mounted = useRef(true),
    pending = useRef<(() => void) | null>(null);
  const [qr, setQr] = useState<{
    value: string;
    resolve: (value: string) => void;
    reject: () => void;
  }>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.();
    };
  }, []);
  async function run(tickets: PrintableTicket[], share: boolean) {
    if (!tickets.length) throw new Error("NO_ACTIVE_INVITATIONS");
    const token = controller.getToken(),
      active = () => mounted.current && controller.getToken() === token;
    const images: string[] = [];
    try {
      if (Platform.OS !== "web")
        for (const ticket of tickets) {
          if (!active()) return;
          images.push(
            await new Promise<string>((resolve, reject) => {
              let done = false;
              const finish = (value?: string) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                pending.current = null;
                value
                  ? resolve("data:image/png;base64," + value)
                  : reject(new Error("QR_EXPORT_FAILED"));
              };
              const timer = setTimeout(() => finish(), 5000);
              pending.current = () => finish();
              setQr({
                value: ticket.validationHash,
                resolve: finish,
                reject: () => finish(),
              });
            }),
          );
        }
      if (active())
        await exportInvitationBatch(
          tickets,
          images,
          copy,
          language,
          share,
          active,
        );
    } finally {
      if (mounted.current) setQr(undefined);
    }
  }
  return {
    run,
    node: qr ? (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: "absolute",
          left: -1000,
          top: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <QRCode
          key={qr.value}
          value={qr.value}
          size={400}
          quietZone={16}
          onError={qr.reject}
          getRef={(
            value: {
              toDataURL: (callback: (data: string) => void) => void;
            } | null,
          ) => {
            if (value)
              requestAnimationFrame(() => {
                try {
                  value.toDataURL(qr.resolve);
                } catch {
                  qr.reject();
                }
              });
          }}
        />
      </View>
    ) : null,
  };
}
