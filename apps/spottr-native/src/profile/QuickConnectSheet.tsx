import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  View,
  useWindowDimensions,
} from "react-native";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import QRCode from "react-native-qrcode-svg";
import { QrCode, ScanLine } from "lucide-react-native";
import { useAuth, accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { queryClient } from "../data/queries";
import { ApiError } from "../data/http";
import { AppSheet } from "../ui/AppSheet";
import { Text } from "../ui/Text";
import { Wordmark } from "../ui/Logo";
import { Button } from "../ui/common";
import { colors } from "../ui/theme";
import { CapsuleSwitchTrack } from '../ui/CapsuleSwitchTrack';
import { GlassSurface } from '../ui/GlassSurface';
import { QuickConnectCamera } from './QuickConnectCamera';

export function connectionId(value: string, own: string) {
  const match = value.match(
    /^(?:glow|pulse):\/\/friend\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (!match?.[1]) throw new Error("qr.invalidConnection");
  if (match[1].toLowerCase() === own.toLowerCase())
    throw new Error("qr.ownCode");
  return match[1].toLowerCase();
}
export function QuickConnectSheet({ onClose }: { onClose: () => void }) {
  const { user, controller } = useAuth(),
    { copy } = usePreferences(),
    viewport = useWindowDimensions();
  const [mode, setMode] = useState<"code" | "scan">("code"),
    [message, setMessage] = useState(""),
    [scanned, setScanned] = useState(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  const modeRef = useRef(mode), activeRef = useRef(active), mounted = useRef(true), scanLocked = useRef(false);
  const revision = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      activeRef.current = state === 'active';
      setActive(activeRef.current);
    });
    return () => {
      subscription.remove();
      mounted.current = false;
      revision.current++;
    };
  }, []);
  const change = (next: "code" | "scan") => {
    if (next === modeRef.current) return;
    modeRef.current = next;
    revision.current++;
    setMessage("");
    setScanned(false);
    pending.current = false;
    scanLocked.current = false;
    setMode(next);
  };
  const scan = async (value: string) => {
    if (!user || !mounted.current || modeRef.current !== 'scan' || !activeRef.current || pending.current || scanLocked.current) return;
    pending.current = true;
    scanLocked.current = true;
    setScanned(true);
    setMessage("");
    const version = revision.current,
      token = controller.getToken();
    try {
      const id = connectionId(value, user.id);
      await accountApi("/friends/connect/" + id, { method: "POST", token });
      if (version === revision.current && controller.getToken() === token) {
        setMessage(copy("qr.connected"));
        void queryClient.invalidateQueries({ queryKey: ["friends"] });
        void queryClient.invalidateQueries({ queryKey: ["friend-requests"] });
        void queryClient.invalidateQueries({ queryKey: ["social-feed"] });
        void queryClient.invalidateQueries({ queryKey: ["public-profile", user.id] });
        void queryClient.invalidateQueries({ queryKey: ["profile-search", user.id] });
      }
    } catch (cause) {
      if (version === revision.current && controller.getToken() === token)
        setMessage(
          copy(
            cause instanceof ApiError
              ? cause.status === 401
                ? "qr.sessionExpired"
                : "qr.connectionRejected"
              : cause instanceof Error && cause.message.startsWith("qr.")
                ? cause.message
                : "qr.connectionOffline",
            { status: cause instanceof ApiError ? cause.status : 0 },
          ),
        );
    } finally {
      if (version === revision.current) pending.current = false;
    }
  };
  if (!user) return null;
  const fraction =
    viewport.height < 560 ? 0.84 : Math.min(0.78, 576 / viewport.height);
  const qrSize = Math.max(
    90,
    Math.min(228, viewport.width - 112, viewport.height * fraction - 298),
  );
  return (
    <AppSheet
      open
      onClose={onClose}
      height={fraction}
      label={copy("common.close")}
      testID="quick-connect-sheet"
    >
      <BottomSheetView
        style={{
          height: "100%",
          paddingHorizontal: 20,
          paddingBottom: 28,
          gap: 18,
        }}
      >
        <View>
          <Text style={{ color: "white", fontSize: 24, fontWeight: "700" }}>
            {copy("qr.quickConnect")}
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 20,
              marginTop: 6,
            }}
          >
            {copy("qr.showOrScanOther")}
          </Text>
        </View>
        <GlassSurface testID="quick-connect-switch" style={{ height: 48, padding: 4, borderRadius: 24, backgroundColor: '#171717' }}>
          <CapsuleSwitchTrack value={mode} onChange={change} height={40} role="tab" indicatorTestID="quick-connect-indicator"
            options={[
              { value: 'code', label: copy('qr.myCode'), testID: 'quick-connect-code', content: <><QrCode color="white" size={16}/><Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{copy('qr.myCode')}</Text></> },
              { value: 'scan', label: copy('qr.scanQr'), testID: 'quick-connect-scan', content: <><ScanLine color="white" size={16}/><Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{copy('qr.scanQr')}</Text></> },
            ]}/>
        </GlassSurface>
        {mode === "code" ? (
          <View testID="quick-connect-code-panel"
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "space-between",
              padding: 18,
              gap: 12,
              borderRadius: 26,
              backgroundColor: "#110d0f",
              borderWidth: 1,
              borderColor: "#ff004433",
            }}
          >
            <Wordmark />
            <View
              style={{
                padding: 16,
                borderRadius: 22,
                backgroundColor: "white",
              }}
            >
              <QRCode
                value={"glow://friend/" + user.id}
                size={qrSize}
                ecl="M"
              />
            </View>
            <Text
              numberOfLines={1}
              style={{ color: "white", fontSize: 14, fontWeight: "600" }}
            >
              {user.username}
            </Text>
          </View>
        ) : (
          <View testID="quick-connect-scan-panel"
            style={{
              flex: 1,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: "#111",
            }}
          >
            <QuickConnectCamera active={active} stopped={scanned} onScan={value => void scan(value)}/>
          </View>
        )}
        {!!message && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.accent, fontSize: 12, textAlign: "center" }}
          >
            {message}
          </Text>
        )}
        {mode === "scan" && scanned && (
          <Button
            title={copy("qr.scanAgain")}
            onPress={() => {
              revision.current++;
              pending.current = false;
              scanLocked.current = false;
              setScanned(false);
              setMessage("");
            }}
          />
        )}
      </BottomSheetView>
    </AppSheet>
  );
}
