import { AccentPressable } from '../ui/AccentPressable';
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth, accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { Button, Feedback, Loading } from "../ui/common";
import { parseErrorPage } from "../../../pulse-app/src/features/diagnostics/report";
import { exportClientErrors } from "./exportClientErrors";
import { diagnosticTitle, diagnosticFailure, groupDiagnosticReports } from '../../../pulse-app/src/features/diagnostics/presentation';
import { diagnosticsEnabled } from '../diagnostics/runtime';

export function ClientErrorsPanel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { user, controller } = useAuth(),
    { language } = usePreferences(),
    ro = language === "ro";
  const [open, setOpen] = useState(initiallyOpen),
    [platform, setPlatform] = useState(""),
    [detail, setDetail] = useState(""),
    [exporting, setExporting] = useState(false),
    [exportFailed, setExportFailed] = useState(false);
  const allowed = user?.role === "admin";
  const query = useInfiniteQuery({
    queryKey: ["client-errors", user?.id, platform],
    enabled: allowed && open,
    initialPageParam: "",
    retry: false,
    queryFn: async ({ pageParam, signal }) =>
      parseErrorPage(
        await accountApi(
          "/admin/client-errors?" +
            new URLSearchParams({ platform, cursor: pageParam }),
          { signal },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor || undefined,
  });
  if (!allowed) return null;
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const download = async () => {
    if (exporting) return;
    const token = controller.getToken();
    setExporting(true);
    setExportFailed(false);
    try {
      await exportClientErrors(
        rows,
        () =>
          controller.getToken() === token &&
          controller.getSnapshot().user?.role === "admin",
      );
    } catch {
      if (controller.getToken() === token) setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <View style={{ gap: 14 }} testID="client-errors-panel">
      <Button
        title={ro ? "Erori aplicație" : "Application errors"}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Text style={{ color: "#aaa", fontSize: 12 }}>
            {ro
              ? "Rapoarte tehnice din ultimele 30 de zile. Mesajele brute și datele personale sunt excluse."
              : "Technical reports from the last 30 days. Raw messages and personal data are excluded."}
          </Text>
          {!diagnosticsEnabled && <Text style={{ color: '#aaa', fontSize: 12 }}>
            {ro ? 'Raportarea automată este oprită în acest build de dezvoltare. Lista arată în continuare rapoartele primite de la alte dispozitive.' : 'Automatic reporting is disabled in this development build. Reports received from other devices still appear here.'}
          </Text>}
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {["", "ios", "android", "web"].map((value) => (
              <AccentPressable fallback={Pressable}
                key={value}
                accessibilityRole="button"
                onPress={() => {
                  setPlatform(value);
                  setDetail("");
                }}
                style={{
                  padding: 10,
                  borderRadius: 20,
                  backgroundColor: platform === value ? "#ff0044" : "#161616",
                }}
              >
                <Text style={{ color: "white", fontSize: 12 }}>
                  {value || (ro ? "Toate" : "All")}
                </Text>
              </AccentPressable>
            ))}
          </View>
          <Button
            title={ro ? "Actualizează" : "Refresh"}
            secondary
            disabled={query.isFetching}
            onPress={() => void query.refetch()}
          />
          {query.isPending ? (
            <Loading />
          ) : query.isError ? (
            <Feedback
              title={
                ro
                  ? "Rapoartele nu au putut fi încărcate."
                  : "Reports could not be loaded."
              }
              retry={() => void query.refetch()}
            />
          ) : rows.length === 0 ? (
            <Text style={{ color: "#aaa" }}>
              {ro ? "Nicio eroare raportată." : "No reported errors."}
            </Text>
          ) : (
            groupDiagnosticReports(rows).map(({ report: row, count }) => (
              <View
                key={row.id}
                style={{
                  padding: 14,
                  gap: 8,
                  borderRadius: 16,
                  backgroundColor: "#141014",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {diagnosticTitle(row, ro)}
                </Text>
                {!!row.failure && <Text style={{ color: '#aaa', fontSize: 12 }}>{diagnosticFailure(row, ro)}</Text>}
                {!!row.errorCode && <Text style={{ color: '#aaa', fontSize: 12 }}>{ro ? 'Raportat de client' : 'Client reported'}: {row.errorSource} · {row.errorCode} · {row.safeMessage}</Text>}
                {!!row.endpoint && <Text style={{ color: '#aaa', fontSize: 12 }}>{row.httpMethod} · {row.endpoint}{row.requestId ? ` · Request ID: ${row.requestId}` : ''}</Text>}
                {count > 1 && <Text style={{ color: '#ff0044', fontSize: 12 }}>{ro ? `${count} apariții în rapoartele încărcate` : `${count} occurrences in loaded reports`}</Text>}
                <Text style={{ color: "#aaa", fontSize: 12 }}>
                  {row.platform} · v{row.appVersion} ({row.buildVersion}) · OS{" "}
                  {row.osVersion} · {row.screen}
                </Text>
                <Text style={{ color: "#aaa", fontSize: 12 }}>
                  {new Date(row.occurredAt).toLocaleString(
                    ro ? "ro-RO" : "en-GB",
                  )}{" "}
                  {row.fatal ? "· fatal" : ""}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  testID="client-error-details"
                  onPress={() => setDetail(detail === row.id ? "" : row.id)}
                >
                  <Text style={{ color: "#ff0044", paddingVertical: 8 }}>
                    {ro ? "Detalii tehnice" : "Technical details"}
                  </Text>
                </Pressable>
                {detail === row.id && (
                  <>
                    <Text selectable style={{ color: "#ccc", fontSize: 11 }}>
                      {row.breadcrumbs.join(" → ")}
                    </Text>
                    <Text selectable style={{ color: "#ccc", fontSize: 11 }}>
                      {row.frames
                        .map(
                          (f) =>
                            `${f.function} (${f.file}:${f.line}:${f.column})`,
                        )
                        .join("\n") ||
                        (ro ? "Fără stack disponibil" : "No stack available")}
                    </Text>
                    <Text selectable style={{ color: "#aaa", fontSize: 10 }}>
                      ID: {row.id}
                      {"\n"}Fingerprint: {row.fingerprint}
                    </Text>
                  </>
                )}
              </View>
            ))
          )}
          {query.hasNextPage && (
            <Button
              title={ro ? "Mai multe" : "More"}
              secondary
              disabled={query.isFetching}
              onPress={() => void query.fetchNextPage()}
            />
          )}
          {!!rows.length && (
            <Button
              title={
                ro
                  ? "Exportă JSON (rapoartele încărcate)"
                  : "Export JSON (loaded reports)"
              }
              secondary
              disabled={exporting}
              onPress={() => void download()}
            />
          )}
          {exportFailed && (
            <Text style={{ color: "#fca5a5" }}>
              {ro ? "Exportul nu a reușit." : "Export failed."}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
