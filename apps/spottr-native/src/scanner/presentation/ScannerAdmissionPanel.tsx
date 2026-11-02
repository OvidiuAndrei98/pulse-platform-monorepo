"use client";

import { Pressable, View } from "react-native";
import { History, RefreshCw } from "lucide-react-native";

import { Text } from "../../ui/Text";
import { Action, dColors as colors } from "../../dashboard/common";

import { formatDate } from "../../data/events";
import { ScannerPanel, s } from "../ScannerPanel";

import { OfflinePackageStatus } from '../OfflinePackageStatus';

import type { ScannerScreenModel } from "../useScannerController";

export function ScannerAdmissionPanel({model, conflicts, pending}: {model: Pick<ScannerScreenModel, "busy" | "copy" | "error" | "event" | "events" | "focused" | "foreground" | "history" | "language" | "navigation" | "offline" | "offlineError" | "offlineState" | "prepare" | "removeOfflinePackage" | "result" | "selected" | "submit" | "syncOfflinePackage" | "scannerKey" | "width" | "work">; conflicts: NonNullable<ScannerScreenModel['offlineState']>['scans']; pending: number}) {
 const { busy, copy, error, event, events, focused, foreground, history, language, navigation, offline, offlineError, offlineState, prepare, removeOfflinePackage, result, selected, submit, syncOfflinePackage, scannerKey, width, work }=model;
 if(!event)return null;
 return (<ScannerPanel
                key={scannerKey}
                eventTitle={event?.title}
                gateStatus={{ connection: offline ? 'offline' : events.isError || events.isPending ? 'checking' : 'online', pending, state: offlineState }}
                onPrepare={prepare}
                canPrepare={!!event && focused && foreground}
                active={
                  !!event &&
                  focused &&
                  foreground &&
                  !events.isError &&
                  !offlineError &&
                  !offlineState?.revoked &&
                  Date.parse(event.endTime) > Date.now()
                }
                busy={busy || work}
                result={result}
                error={error}
                onScan={submit}
              >
                <View
                  testID="scanner-offline-controls"
                  style={[
                    s.row,
                    {
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                      borderTopWidth: 1,
                      borderColor: "#ffffff1a",
                      paddingTop: 16,
                      marginTop: 16,
                    },
                  ]}
                >
                  <View style={{ flexShrink: 1, gap: 4 }}>
                    <OfflinePackageStatus state={offlineState} />
                    {pending > 0 && (
                      <Text
                        style={[
                          s.tiny,
                          { fontWeight: "600", color: "#fde68a" },
                        ]}
                      >
                        {copy("validation.offlinePending", { count: pending })}
                      </Text>
                    )}
                    {offlineError ? (
                      <Text style={s.error}>{offlineError}</Text>
                    ) : null}
                    {offlineState?.revoked ? (
                      <Text style={s.error}>
                        {copy("scanner.sessionUnavailable")}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                    {offlineState?.snapshot && (
                      <Action
                        secondary
                        title={copy("validation.offlineRemove")}
                        style={{
                          height: 36,
                          minHeight: 36,
                          paddingHorizontal: 12,
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          borderColor: "#ffffff1a",
                        }}
                        textStyle={{ color: colors.muted, fontSize: 12 }}
                        disabled={pending > 0 || work || busy}
                        onPress={removeOfflinePackage}
                      />
                    )}
                    {pending > 0 && <Action
                      icon={RefreshCw}
                      title={copy('validation.syncNow')}
                      style={[
                        s.accentButton,
                        { height: 36, minHeight: 36, paddingHorizontal: 12 },
                      ]}
                      textStyle={{ color: colors.accent, fontSize: 12 }}
                      disabled={
                        !event || offline || busy || work || events.isError
                      }
                      onPress={syncOfflinePackage}
                    />}
                  </View>
                </View>
                {conflicts.length > 0 && (
                  <View
                    style={{
                      marginTop: 12,
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#fbbf2440",
                      backgroundColor: "#fbbf240f",
                    }}
                  >
                    <Text
                      style={[s.muted, { fontWeight: "600", color: "#fef3c7" }]}
                    >
                      {copy("validation.offlineConflictsTitle", {
                        count: conflicts.length,
                      })}
                    </Text>
                    <Text style={[s.tiny, { color: "#fde68a" }]}>
                      {copy("validation.offlineConflictHint")}
                    </Text>
                    {conflicts.map((scan) => (
                      <View key={scan.clientScanId} style={{ gap: 4 }}>
                        <Text style={s.tiny}>
                          {scan.ticketType} ·{" "}
                          {copy(
                            "validation.offlineConflict." + scan.serverStatus,
                          )}
                        </Text>
                        <Text selectable style={s.tiny}>
                          {scan.ticketId} ·{" "}
                          {formatDate(scan.scannedAt, language, true)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <View
                  style={{
                    marginTop: 20,
                    borderWidth: 1,
                    borderColor: "#ffffff1a",
                    borderRadius: 12,
                    backgroundColor: "#00000026",
                    padding: width >= 640 ? 20 : 16,
                  }}
                >
                  <View
                    style={[
                      s.row,
                      {
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 16,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.eyebrow}>
                        {copy("validation.yourScans")}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: colors.text,
                          fontSize: 30,
                          lineHeight: 36,
                          fontWeight: "700",
                        }}
                      >
                        {history.isFetching || history.isError
                          ? "–"
                          : (history.data?.totalScans ?? 0)}
                      </Text>
                      <Text style={[s.muted, { marginTop: 4 }]}>
                        {copy("validation.scansForEvent")}
                      </Text>
                    </View>
                    <Pressable
                      testID="scanner-open-history"
                      accessibilityRole="button"
                      accessibilityLabel={copy("validation.openScanHistory")}
                      onPress={() => navigation.navigate('ScannerHistory', { eventId: selected, eventTitle: event?.title })}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "#ff00441a",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <History size={20} color={colors.accent} />
                    </Pressable>
                  </View>
                  <Text style={[s.tiny, { marginTop: 16 }]}>
                    {copy("validation.scanHistoryHint")}
                  </Text>
                </View>
              </ScannerPanel>);
}
