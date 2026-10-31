import { ActionIcon } from '../ui/ActionIcon';
import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { CheckCircle2, ClipboardCheck, ScanLine, XCircle } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../usePreferences";
import { Button, IconButton } from "../ui/common";
import { Text } from "../ui/Text";
import { Action, dColors as colors } from "../dashboard/common";
import { SCAN_COOLDOWN_MS, type Admission, type ScanSource } from "./admission";
import { scannerFrameSize } from './cameraFrame';
import { GateToolbar, type GateStatus } from './GateToolbar';
import { useGateExperience } from './useGateExperience';
import { ScannerPreparation } from './ScannerPreparation';
import { offlinePackageStatus, type PrepareScanner } from './preparation';

export function ScannerPanel({
  active,
  busy,
  result,
  error,
  onScan,
  eventTitle,
  gateStatus,
  onPrepare,
  canPrepare = false,
  children,
}: React.PropsWithChildren<{
  active: boolean;
  busy: boolean;
  result?: Admission;
  error: string;
  onScan: (value: string, source?: ScanSource) => void;
  eventTitle?: string;
  gateStatus?: GateStatus;
  onPrepare?: PrepareScanner;
  canPrepare?: boolean;
}>) {
  const { copy, language } = usePreferences(),
    insets = useSafeAreaInsets(),
    { width } = useWindowDimensions();
  const [hash, setHash] = useState(""),
    [camera, setCamera] = useState(false),
    [cameraError, setCameraError] = useState(false),
    [manual, setManual] = useState(false);
  const [cooling, setCooling] = useState(false), [frameSize, setFrameSize] = useState(0);
  useEffect(() => {
    if (busy || (!result && !error)) {
      setCooling(false);
      return;
    }
    setCooling(true);
    const timer = setTimeout(() => setCooling(false), SCAN_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [busy, result, error]);
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
  const ro = language === "ro";
  const experience = useGateExperience({ visible: camera && !!permission?.granted && !cameraError, active: active && foreground, result, error, busy });
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
          testID="scanner-result"
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
      {!busy && (result || error) ? <Text testID="scanner-ready" style={[s.tiny, { textAlign: 'center' }]}>
        {cooling ? (ro ? 'O clipă…' : 'One moment…') : (ro ? 'Prezintă următorul bilet. Îndepărtează QR-ul deja scanat.' : 'Present the next ticket. Move the scanned QR out of view.')}
      </Text> : null}
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
      {onPrepare && <ScannerPreparation prepare={onPrepare} verified={offlinePackageStatus(gateStatus?.state, Date.now()) === 'ready'} disabled={!canPrepare || busy} camera={async () => permission?.granted || (await requestPermission()).granted} />}
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
          testID="scanner-open-camera"
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
              editable={active && !busy}
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
              testID="scanner-validate"
              title={copy(busy ? "scanner.validating" : "scanner.validate")}
              icon={ClipboardCheck}
              style={[
                s.accentButton,
                width >= 640 && { alignSelf: "flex-start" },
              ]}
              textStyle={{ color: colors.accent }}
              onPress={() => onScan(hash, 'manual')}
              disabled={!active || !hash.trim() || busy || cooling}
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
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.eyebrow, { fontSize: 10 }]}>{ro ? 'MOD POARTĂ' : 'GATE MODE'}</Text>
              <Text testID="scanner-gate-event" numberOfLines={2} style={s.heading}>{eventTitle || copy("validation.scanTab")}</Text>
            </View>
            <IconButton
              label={copy("common.close")}
              onPress={() => setCamera(false)}
            >
              <ActionIcon name="close" size={20} color="white" />
            </IconButton>
          </View>
          <GateToolbar status={gateStatus} settings={experience.settings} toggle={experience.toggle} awake={experience.awake} soundAvailable={experience.soundAvailable} />
          {camera && permission?.granted && !cameraError && foreground ? (
            <View
              testID="scanner-camera-viewport"
              onLayout={event => setFrameSize(scannerFrameSize(event.nativeEvent.layout.width, event.nativeEvent.layout.height))}
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 24,
                overflow: "hidden",
              }}
            >
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={active ? (event) => onScan(event.data, 'camera') : undefined}
                onMountError={() => setCameraError(true)}
              />
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
              ><View testID="scanner-camera-frame" style={{
                  width: frameSize,
                  height: frameSize,
                  borderColor: colors.accent,
                  borderWidth: 2,
                  borderRadius: 24,
                }}
              /></View>
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
          {!active && <Text style={[s.tiny, { textAlign: 'center' }]}>{ro ? 'Scanarea este indisponibilă momentan. Verifică evenimentul și pachetul offline.' : 'Scanning is temporarily unavailable. Check the event and its offline package.'}</Text>}
        </View>
      </Modal>
    </View>
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
