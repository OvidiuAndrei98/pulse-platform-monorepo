import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { QrCode, ScanLine } from "lucide-react-native";
import { useAuth, accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { queryClient } from "../data/queries";
import { ApiError } from "../data/http";
import { AppSheet } from "../ui/AppSheet";
import { Text } from "../ui/Text";
import { Wordmark } from "../ui/Logo";
import { Button } from "../ui/common";
import { colors } from "../ui/theme";

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
  const [permission, requestPermission] = useCameraPermissions();
  const revision = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => {
      subscription.remove();
      revision.current++;
    };
  }, []);
  const change = (next: "code" | "scan") => {
    revision.current++;
    setMessage("");
    setScanned(false);
    pending.current = false;
    setMode(next);
  };
  const scan = async (value: string) => {
    if (!user || pending.current || scanned) return;
    pending.current = true;
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
      height={mode === "scan" ? 0.9 : fraction}
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
        <View
          style={{
            flexDirection: "row",
            padding: 4,
            borderRadius: 99,
            backgroundColor: "#171717",
          }}
        >
          {(["code", "scan"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              onPress={() => change(value)}
              style={{
                height: 40,
                flex: 1,
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 99,
                backgroundColor: mode === value ? colors.accent : "transparent",
              }}
            >
              {value === "code" ? (
                <QrCode color="white" size={16} />
              ) : (
                <ScanLine color="white" size={16} />
              )}
              <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
                {copy(value === "code" ? "qr.myCode" : "qr.scanQr")}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === "code" ? (
          <View
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
          <View
            style={{
              flex: 1,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: "#111",
            }}
          >
            {permission?.granted && active ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={
                  scanned ? undefined : (result) => void scan(result.data)
                }
                onMountError={() => setMessage(copy("qr.connectionOffline"))}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  padding: 20,
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                <Text style={{ color: colors.muted, textAlign: "center" }}>
                  {copy("qr.profileCameraHint")}
                </Text>
                <Button
                  title={copy("qr.scanQr")}
                  onPress={() =>
                    void (
                      permission?.canAskAgain === false
                        ? Linking.openSettings()
                        : requestPermission()
                    ).catch(() => setMessage(copy("feedback.actionFailed")))
                  }
                />
              </View>
            )}
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
            title={copy("qr.scanQr")}
            onPress={() => {
              revision.current++;
              pending.current = false;
              setScanned(false);
              setMessage("");
            }}
          />
        )}
      </BottomSheetView>
    </AppSheet>
  );
}
