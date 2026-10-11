import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { BlurView } from "expo-blur";
import {
  CheckCircle2,
  ClipboardCheck,
  ScanLine,
  X,
  XCircle,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../PreferencesProvider";
import { Button, Feedback, IconButton, Loading } from "../ui/common";
import { Text } from "../ui/Text";
import { Action, dColors as colors } from "../dashboard/common";
import { formatDate } from "../data/events";
import type { Admission } from "./admission";

export function ScannerPanel({
  active,
  busy,
  result,
  error,
  onScan,
  onReset,
  eventTitle,
  children,
}: React.PropsWithChildren<{
  active: boolean;
  busy: boolean;
  result?: Admission;
  error: string;
  onScan: (value: string) => void;
  onReset: () => void;
  eventTitle?: string;
}>) {
  const { copy, language } = usePreferences(),
    insets = useSafeAreaInsets(),
    { width } = useWindowDimensions();
  const [hash, setHash] = useState(""),
    [camera, setCamera] = useState(false),
    [cameraError, setCameraError] = useState(false),
    [manual, setManual] = useState(false);
  const [foreground, setForeground] = useState(
      AppState.currentState === "active",
    ),
    [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active) setCamera(false);
  }, [active]);
  const ro = language === "ro";
  const success = result?.status === "valid" || result?.status === "accepted";
  const resultKey: Record<Admission["status"], string> = {
    valid: "scanner.validTicket",
    already_validated: "scanner.usedTicket",
    accepted: "validation.offlineValid",
    duplicate: "validation.offlineDuplicate",
    expired: "validation.offlineExpired",
    unknown: "validation.offlineUnknown",
    unprepared: "validation.offlineUnprepared",
    revoked: "validation.invalidTicket",
    uncertain: "",
  };
  const reset = () => {
    setHash("");
    onReset();
  };
  const feedback = (
    <>
      {busy ? (
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel={copy("scanner.validating")}
        />
      ) : null}
      {result ? (
        <View
          accessibilityLiveRegion="assertive"
          style={[
            s.feedback,
            {
              borderColor: success ? "#ff004459" : "#fbbf2459",
              backgroundColor: success ? "#102212f2" : "#2a2110f2",
            },
          ]}
        >
          {success ? (
            <CheckCircle2 color={colors.accent} size={24} />
          ) : (
            <XCircle color="#fcd34d" size={24} />
          )}
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.heading}>
              {result.status === "uncertain"
                ? ro
                  ? "Rezultat neconfirmat. Verifică online înainte de acces."
                  : "Unconfirmed result. Verify online before admitting."
                : copy(resultKey[result.status])}
            </Text>
            {"ticketType" in result ? (
              <Text style={s.muted}>{result.ticketType}</Text>
            ) : null}
            {"eventTitle" in result ? (
              <Text style={s.muted}>{result.eventTitle}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="assertive" style={s.error}>
          {error}
        </Text>
      ) : null}
      {result || error ? (
        <Action
          title={ro ? "Scanează următorul bilet" : "Scan next ticket"}
          onPress={reset}
          disabled={busy}
        />
      ) : null}
    </>
  );
  return (
    <View
      testID="scanner-panel"
      style={[s.panel, { padding: width >= 640 ? 24 : 20 }]}
    >
      <View style={[s.row, { alignItems: "flex-start", gap: 12 }]}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: "#ff00441a",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ScanLine color={colors.accent} size={20} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.heading}>{copy("validation.verifyTicket")}</Text>
          <Text style={s.muted}>
            {eventTitle || copy("validation.ticketHint")}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 20,
          padding: width >= 640 ? 20 : 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#ff004440",
          backgroundColor: "#ff00440a",
        }}
      >
        <Action
          title={ro ? "Deschide camera" : "Open camera"}
          icon={ScanLine}
          disabled={!active || busy}
          style={{ height: 48 }}
          onPress={() => {
            setCameraError(false);
            setCamera(true);
          }}
        />
        <Text style={[s.tiny, { marginTop: 12, textAlign: "center" }]}>
          {copy("validation.cameraHint")}
        </Text>
      </View>
      <View
        style={{
          marginTop: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#0000001a",
          overflow: "hidden",
        }}
      >
        <Pressable
          testID="scanner-manual-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: manual }}
          onPress={() => setManual((value) => !value)}
          style={{ paddingHorizontal: 16, paddingVertical: 12 }}
        >
          <Text style={[s.muted, { fontWeight: "600" }]}>
            {copy("validation.enterCodeManually")}
          </Text>
        </Pressable>
        {manual && (
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderColor: "#ffffff1a",
              gap: 12,
            }}
          >
            <TextInput
              testID="scanner-code-input"
              accessibilityLabel={copy("validation.pasteQr")}
              placeholder={copy("validation.pasteQr")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={hash}
              onChangeText={setHash}
              maxLength={256}
              editable={active && !busy && !result && !error}
              style={[
                s.input,
                {
                  height: 86,
                  paddingTop: 12,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                  fontSize: 12,
                  textAlignVertical: "top",
                },
              ]}
              multiline
            />
            <Action
              title={copy(busy ? "scanner.validating" : "scanner.validate")}
              icon={ClipboardCheck}
              style={[
                s.accentButton,
                width >= 640 && { alignSelf: "flex-start" },
              ]}
              textStyle={{ color: colors.accent }}
              onPress={() => onScan(hash)}
              disabled={!active || !hash.trim() || busy || !!result || !!error}
            />
          </View>
        )}
      </View>
      {(result || error || busy) && (
        <View style={{ gap: 12, marginTop: 16 }}>{feedback}</View>
      )}
      {children}
      <Modal
        visible={camera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setCamera(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 20,
            paddingHorizontal: 20,
            gap: 20,
          }}
        >
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={s.heading}>{copy("validation.scanTab")}</Text>
            <IconButton
              label={copy("common.close")}
              onPress={() => setCamera(false)}
            >
              <X size={20} color="white" />
            </IconButton>
          </View>
          {permission?.granted && !cameraError && foreground && active ? (
            <View
              style={{
                flex: 1,
                minHeight: 180,
                borderRadius: 24,
                overflow: "hidden",
              }}
            >
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={
                  busy || result || error
                    ? undefined
                    : (event) => onScan(event.data)
                }
                onMountError={() => setCameraError(true)}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: "12%",
                  right: "12%",
                  top: "20%",
                  bottom: "20%",
                  borderColor: colors.accent,
                  borderWidth: 2,
                  borderRadius: 24,
                }}
              />
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: "center", gap: 20 }}>
              <Text style={s.muted}>
                {ro
                  ? "Permite accesul la cameră pentru a scana biletele. Poți introduce codul și manual."
                  : "Allow camera access to scan tickets. You can also enter the code manually."}
              </Text>
              <Button
                title={ro ? "Permite accesul" : "Allow camera"}
                onPress={() => {
                  void requestPermission().catch(() => setCameraError(true));
                }}
              />
              {permission &&
              !permission.canAskAgain &&
              Platform.OS !== "web" ? (
                <Button
                  secondary
                  title={ro ? "Deschide setările" : "Open settings"}
                  onPress={() => {
                    void Linking.openSettings().catch(() =>
                      setCameraError(true),
                    );
                  }}
                />
              ) : null}
              {cameraError ? (
                <Text style={s.error}>
                  {ro
                    ? "Camera nu este disponibilă. Introdu codul manual."
                    : "Camera unavailable. Enter the code manually."}
                </Text>
              ) : null}
            </View>
          )}
          {feedback}
        </View>
      </Modal>
    </View>
  );
}

export function ScannerHistoryPanel({
  open,
  onClose,
  loading,
  error,
  onRetry,
  history,
}: {
  open: boolean;
  onClose(): void;
  loading: boolean;
  error: boolean;
  onRetry(): void;
  history?: {
    totalScans: number;
    scans: { ticketId: string; ticketType: string; validatedAt: string }[];
  };
}) {
  const { copy, language } = usePreferences(),
    insets = useSafeAreaInsets(),
    { width } = useWindowDimensions();
  const [visible, setVisible] = useState(open),
    x = useRef(new Animated.Value(1)).current,
    panelWidth = Math.min(448, width);
  useEffect(() => {
    if (open) setVisible(true);
    const animation = Animated.spring(x, {
      toValue: open ? 0 : 1,
      stiffness: 320,
      damping: 34,
      mass: 1,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !open) setVisible(false);
    });
    return () => animation.stop();
  }, [open, x]);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Animated.View
          style={{
            position: "absolute",
            inset: 0,
            opacity: x.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          }}
        >
          {Platform.OS !== "web" && (
            <BlurView
              intensity={20}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          )}
          <Pressable
            accessibilityLabel={copy("common.close")}
            onPress={onClose}
            style={[
              { flex: 1, backgroundColor: "#000000a6" },
              Platform.OS === "web" &&
                ({ backdropFilter: "blur(4px)" } as ViewStyle),
            ]}
          />
        </Animated.View>
        <Animated.View
          testID="scanner-history-drawer"
          accessibilityViewIsModal
          style={{
            width: panelWidth,
            height: "100%",
            position: "absolute",
            right: 0,
            backgroundColor: "#0b0e0c",
            borderLeftWidth: 1,
            borderLeftColor: "#ffffff1a",
            boxShadow: "-24px 0px 70px rgba(0,0,0,0.5)",
            transform: [
              {
                translateX: x.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, panelWidth],
                }),
              },
            ],
          }}
        >
          <View
            style={[
              s.row,
              {
                alignItems: "flex-start",
                gap: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#ffffff1a",
                paddingHorizontal: 20,
                paddingBottom: 20,
                paddingTop: Math.max(20, insets.top + 16),
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eyebrow}>{copy("validation.yourScans")}</Text>
              <Text style={[s.heading, { fontSize: 20, fontWeight: "700" }]}>
                {copy("validation.scanHistory")}
              </Text>
              <Text style={s.muted}>{copy("validation.scansForEvent")}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy("common.close")}
              onPress={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#ffffff1a",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>
          <View
            style={{
              padding: 20,
              borderBottomWidth: 1,
              borderColor: "#ffffff1a",
            }}
          >
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#ff004440",
                backgroundColor: "#ff00440f",
                padding: 16,
              }}
            >
              <Text style={s.eyebrow}>{copy("validation.totalScans")}</Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 36,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                {loading || error ? "–" : (history?.totalScans ?? 0)}
              </Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingBottom: Math.max(24, insets.bottom + 16),
              gap: 12,
            }}
          >
            {loading ? (
              <Loading />
            ) : error ? (
              <Feedback
                compact
                title={copy("feedback.loadFailed")}
                retry={onRetry}
              />
            ) : history?.scans.length ? (
              history.scans.map((scan) => (
                <View
                  key={scan.ticketId}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#ffffff1a",
                    backgroundColor: "#ffffff09",
                  }}
                >
                  <View style={[s.row, { alignItems: "flex-start", gap: 12 }]}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text
                        style={[s.heading, { fontSize: 14 }]}
                        numberOfLines={1}
                      >
                        {scan.ticketType}
                      </Text>
                      <Text style={s.tiny}>
                        {formatDate(scan.validatedAt, language, true)}
                      </Text>
                    </View>
                    <CheckCircle2 size={16} color={colors.accent} />
                  </View>
                  <Text
                    selectable
                    style={[
                      s.tiny,
                      {
                        marginTop: 12,
                        fontSize: 11,
                        fontFamily:
                          Platform.OS === "ios" ? "Menlo" : "monospace",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {copy("validation.ticketId", { id: scan.ticketId })}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: "#ffffff26",
                  paddingHorizontal: 16,
                  paddingVertical: 32,
                }}
              >
                <Text style={[s.muted, { textAlign: "center" }]}>
                  {copy("validation.noScansYet")}
                </Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
export const s = StyleSheet.create({
  panel: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#ffffff08",
    borderWidth: 1,
    borderColor: "#ffffff1a",
  },
  row: { flexDirection: "row", alignItems: "center" },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  tiny: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  error: { color: "#f87171", fontSize: 14, lineHeight: 20 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.68,
    textTransform: "uppercase",
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0d",
    color: colors.text,
    fontSize: 14,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  accentButton: {
    borderWidth: 1,
    borderColor: "#ff004459",
    backgroundColor: "#ff00441a",
    borderRadius: 8,
  },
});
