import React, { useEffect, useState, useRef } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  ExternalLink,
  Link2Off,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react-native";
import {
  Grid,
  SmallButton,
  SectionTitle,
  CheckRow,
  Status,
  p,
} from "./managementUi";
import { invoiceStats } from "./managementData";
import type { components } from "@packages/api-client/src/schema";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { Feedback, Loading, useOpenLink } from "../ui/common";
import {
  Action,
  Confirm,
  Field,
  Select,
  useAction,
  useDashboardQuery,
  dColors as colors,
} from "./common";
import type { InvoiceSettings } from "./data";
type S = components["schemas"];
export { Finance } from "./FinanceSummary";
const defaults: InvoiceSettings = {
  provider: "oblio",
  enabled: true,
  accountEmail: "",
  apiToken: "",
  companyVatCode: "",
  seriesName: "",
  vatName: "",
  vatPercentage: 0,
  sendEmail: true,
  sendToSpv: true,
};
export function Invoicing() {
  const { copy } = usePreferences(),
    query = useDashboardQuery<S["InvoicingSettingsResponse"]>(
      "/dashboard/invoicing/settings",
    ),
    invoices = useDashboardQuery<S["BillingInvoiceResponse"][] | null>(
      "/dashboard/invoicing/invoices",
      true,
      10000,
    );
  const [settings, setSettings] = useState<InvoiceSettings>(defaults),
    [options, setOptions] = useState<S["InvoicingProviderOptionsResponse"]>(),
    [disconnect, setDisconnect] = useState(false),
    [initialized, setInitialized] = useState(false),
    action = useAction(),
    link = useOpenLink();
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (query.data && !initialized) {
      const d = query.data;
      setSettings({
        ...defaults,
        ...d,
        provider: d.provider ?? "oblio",
        accountEmail: d.accountEmail ?? "",
        companyVatCode: d.companyVatCode ?? "",
        seriesName: d.seriesName ?? "",
        vatName: d.vatName ?? "",
        apiToken: "",
        enabled: d.connected ? d.enabled : true,
        sendEmail: d.connected ? d.sendEmail : true,
        sendToSpv: d.connected ? d.sendToSpv : true,
      });
      setInitialized(true);
    }
  }, [query.data, initialized]);
  const change = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K],
  ) => {
    if (
      ["provider", "accountEmail", "apiToken", "companyVatCode"].includes(key)
    )
      setOptions(undefined);
    setSettings((old) => ({ ...old, [key]: value }));
  };
  const load = () =>
    void action.run(
      () =>
        accountApi<S["InvoicingProviderOptionsResponse"]>(
          "/dashboard/invoicing/options",
          {
            method: "POST",
            body: {
              provider: settings.provider,
              accountEmail: settings.accountEmail.trim(),
              apiToken: settings.apiToken?.trim() || undefined,
              companyVatCode: settings.companyVatCode.trim(),
            },
          },
        ),
      "invoicing.optionsLoaded",
      (value) => {
        setOptions(value);
        const series =
            value.series.find((v) => v.name === settings.seriesName) ??
            value.series.find((v) => v.default) ??
            value.series[0],
          rate =
            value.vatRates.find(
              (v) =>
                v.name === settings.vatName &&
                v.percentage === settings.vatPercentage,
            ) ??
            value.vatRates.find((v) => v.default) ??
            value.vatRates[0];
        setSettings((old) => ({
          ...old,
          seriesName: series?.name ?? "",
          vatName: rate?.name ?? "",
          vatPercentage: rate?.percentage ?? 0,
        }));
      },
    );
  useEffect(() => {
    if (initialized && query.data?.connected && !autoLoaded.current) {
      autoLoaded.current = true;
      load();
    }
  }, [initialized, query.data?.connected]);
  const stats = invoiceStats(invoices.data ?? []),
    wide = useWindowDimensions().width >= 640;
  return (
    <View testID="dashboard-invoicing" style={{ gap: 28 }}>
      <View style={{ gap: 4 }}>
        <Text style={[p.title, wide && { fontSize: 30, lineHeight: 36 }]}>
          {copy("invoicing.title")}
        </Text>
        <Text style={[p.muted, { maxWidth: 672 }]}>
          {copy("invoicing.subtitle")}
        </Text>
      </View>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Feedback
          title={copy("invoicing.loadFailed")}
          retry={() => void query.refetch()}
        />
      ) : (
        <View style={[p.panel, { padding: wide ? 20 : 16, gap: 20 }]}>
          <SectionTitle
            title={copy("invoicing.integrationTitle")}
            subtitle={copy("invoicing.integrationHint")}
            icon={ShieldCheck}
            right={
              query.data?.connected ? (
                <Status label={copy("invoicing.connected")} tone="green" />
              ) : null
            }
          />
          <Grid sm={2} gap={8}>
            {(["oblio", "smartbill"] as const).map((provider) => (
              <Pressable
                key={provider}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: settings.provider === provider,
                  disabled: action.busy,
                }}
                disabled={action.busy}
                onPress={() => change("provider", provider)}
                style={[
                  p.panel,
                  {
                    padding: 16,
                    borderRadius: 12,
                    gap: 4,
                    flexGrow: 1,
                    borderColor:
                      settings.provider === provider
                        ? "#ff004480"
                        : "#ffffff1a",
                    backgroundColor:
                      settings.provider === provider
                        ? "#ff004414"
                        : "#00000026",
                  },
                ]}
              >
                <Text style={p.label}>
                  {provider === "oblio" ? "Oblio" : "SmartBill"}
                </Text>
                <Text style={p.tiny}>
                  {copy("invoicing.providers." + provider)}
                </Text>
              </Pressable>
            ))}
          </Grid>
          <Grid sm={2} gap={16}>
            <Field
              label={copy("invoicing.accountEmail")}
              value={settings.accountEmail}
              onChange={(value) => change("accountEmail", value)}
              disabled={action.busy}
              inputStyle={{ borderRadius: 12 }}
            />
            <Field
              label={copy(
                query.data?.connected
                  ? "invoicing.apiTokenKeep"
                  : "invoicing.apiToken",
              )}
              value={settings.apiToken ?? ""}
              onChange={(value) => change("apiToken", value)}
              password
              disabled={action.busy}
              inputStyle={{ borderRadius: 12 }}
            />
            <Field
              label={copy("invoicing.companyVatCode")}
              value={settings.companyVatCode}
              onChange={(value) => change("companyVatCode", value)}
              disabled={action.busy}
              inputStyle={{ borderRadius: 12 }}
            />
            <View style={{ justifyContent: "flex-end", flexGrow: 1 }}>
              <Action
                title={copy("invoicing.loadOptions")}
                secondary
                icon={RefreshCw}
                onPress={load}
                disabled={
                  action.busy ||
                  !settings.accountEmail.trim() ||
                  !settings.companyVatCode.trim()
                }
                style={{
                  borderRadius: 12,
                  backgroundColor: "#ff00440f",
                  borderColor: "#ff00444d",
                }}
                textStyle={{ color: colors.accent }}
              />
            </View>
            {options && (
              <Select
                label={copy("invoicing.seriesName")}
                placeholder={copy("invoicing.selectSeries")}
                value={settings.seriesName}
                options={options.series.map((value) => ({
                  value: value.name,
                  label: value.name,
                }))}
                onChange={(value) => change("seriesName", value)}
                disabled={action.busy}
              />
            )}
            {options && (
              <Select
                label={copy("invoicing.vatRate")}
                placeholder={copy("invoicing.selectVatRate")}
                value={`${settings.vatName}\u0000${settings.vatPercentage}`}
                options={options.vatRates.map((value) => ({
                  value: `${value.name}\u0000${value.percentage}`,
                  label: value.name
                    ? `${value.name} · ${value.percentage}%`
                    : copy("invoicing.noVat"),
                }))}
                onChange={(value) => {
                  const rate = options.vatRates.find(
                    (rate) => `${rate.name}\u0000${rate.percentage}` === value,
                  );
                  if (rate)
                    setSettings((old) => ({
                      ...old,
                      vatName: rate.name,
                      vatPercentage: rate.percentage,
                    }));
                }}
                disabled={action.busy}
              />
            )}
          </Grid>
          {!options && query.data?.connected && (
            <Text style={p.tiny}>
              {settings.seriesName} · {settings.vatName} ·{" "}
              {settings.vatPercentage}%
            </Text>
          )}
          <View style={[p.line, { paddingTop: 16, gap: 12 }]}>
            {(["enabled", "sendEmail"] as const).map((key) => (
              <CheckRow
                key={key}
                label={copy("invoicing." + key)}
                hint={copy("invoicing." + key + "Hint")}
                checked={settings[key]}
                onChange={(value) => change(key, value)}
                disabled={action.busy}
              />
            ))}
            {settings.provider === "oblio" ? (
              <CheckRow
                label={copy("invoicing.sendToSpv")}
                hint={copy("invoicing.sendToSpvHint")}
                checked={settings.sendToSpv}
                onChange={(value) => change("sendToSpv", value)}
                disabled={action.busy}
              />
            ) : (
              <Text
                style={[p.tiny, p.panel, { borderRadius: 12, padding: 14 }]}
              >
                {copy("invoicing.smartBillSpvHint")}
              </Text>
            )}
          </View>
          {action.feedback}
          <View
            style={{
              flexDirection: wide ? "row" : "column-reverse",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {query.data?.connected && (
              <Action
                danger
                icon={Link2Off}
                title={copy("invoicing.disconnect")}
                disabled={action.busy}
                onPress={() => setDisconnect(true)}
                style={{ borderRadius: 12 }}
              />
            )}
            <Action
              title={copy("invoicing.saveAndVerify")}
              disabled={
                action.busy ||
                !options ||
                !settings.seriesName ||
                !settings.accountEmail.trim() ||
                !settings.companyVatCode.trim()
              }
              onPress={() =>
                void action.run(
                  () =>
                    accountApi("/dashboard/invoicing/settings", {
                      method: "PUT",
                      body: {
                        ...settings,
                        apiToken: settings.apiToken?.trim() || undefined,
                      },
                    }),
                  "invoicing.saved",
                  () => setSettings((old) => ({ ...old, apiToken: "" })),
                )
              }
              style={{ borderRadius: 12 }}
            />
          </View>
        </View>
      )}
      <View style={{ gap: 16 }}>
        <SectionTitle
          title={copy("invoicing.invoiceHistory")}
          subtitle={copy("invoicing.invoiceHistoryHint")}
          right={
            <SmallButton
              label={copy("invoicing.refresh")}
              icon={RefreshCw}
              onPress={() => void invoices.refetch()}
              disabled={invoices.isFetching}
            />
          }
        />
        <Grid columns={3} gap={8}>
          {(["issued", "inProgress", "attention"] as const).map((key) => (
            <View
              key={key}
              style={[p.panel, { borderRadius: 12, padding: 12 }]}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color:
                    key === "attention" && stats[key] > 0
                      ? "#fca5a5"
                      : colors.text,
                }}
              >
                {stats[key]}
              </Text>
              <Text
                style={[
                  p.tiny,
                  {
                    marginTop: 4,
                    fontSize: 10,
                    textTransform: "uppercase",
                    fontWeight: "600",
                  },
                ]}
                numberOfLines={1}
              >
                {copy(
                  key === "issued"
                    ? "invoicing.status.issued"
                    : "invoicing." + key,
                )}
              </Text>
            </View>
          ))}
        </Grid>
        {invoices.isPending ? (
          <Loading />
        ) : invoices.isError ? (
          <Feedback
            title={copy("invoicing.loadFailed")}
            retry={() => void invoices.refetch()}
          />
        ) : !invoices.data?.length ? (
          <View
            style={[
              p.empty,
              p.row,
              { borderRadius: 16, alignItems: "flex-start" },
            ]}
          >
            <ReceiptText size={16} color={colors.accent} />
            <Text style={[p.muted, { flex: 1 }]}>
              {copy("invoicing.noInvoices")}
            </Text>
          </View>
        ) : (
          <View style={[p.panel, { padding: 0, overflow: "hidden" }]}>
            {invoices.data.map((invoice, index) => (
              <View
                key={invoice.id}
                style={{
                  padding: wide ? 20 : 16,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: "#ffffff1a",
                  flexDirection: wide ? "row" : "column",
                  gap: 12,
                }}
              >
                <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 4 }}>
                  <View style={[p.row, { flexWrap: "wrap" }]}>
                    <Text style={p.label}>{invoice.eventTitle}</Text>
                    <InvoiceStatus
                      status={invoice.status}
                      label={copy("invoicing.status." + invoice.status)}
                    />
                  </View>
                  <Text style={p.tiny}>
                    {invoice.customerName} · {invoice.customerEmail}
                  </Text>
                  <Text style={[p.tiny, { color: "#ffffff73", marginTop: 4 }]}>
                    {new Date(invoice.createdAt).toLocaleString()} ·{" "}
                    {invoice.totalAmountRon} RON
                  </Text>
                  {invoice.errorMessage && (
                    <Text
                      style={[
                        p.warning,
                        {
                          color: "#fca5a5",
                          backgroundColor: "#ef444414",
                          borderWidth: 0,
                          borderRadius: 8,
                          marginTop: 8,
                        },
                      ]}
                    >
                      {invoice.errorMessage}
                    </Text>
                  )}
                  {invoice.refundStatus && (
                    <View style={[p.row, { flexWrap: "wrap", marginTop: 8 }]}>
                      <Text style={p.tiny}>
                        {copy("invoicing.refundDocument")}
                      </Text>
                      <InvoiceStatus
                        status={invoice.refundStatus}
                        label={copy("invoicing.status." + invoice.refundStatus)}
                      />
                      {invoice.refundErrorMessage && (
                        <Text
                          style={[
                            p.warning,
                            {
                              width: "100%",
                              color: "#fca5a5",
                              backgroundColor: "#ef444414",
                              borderWidth: 0,
                              borderRadius: 8,
                            },
                          ]}
                        >
                          {invoice.refundErrorMessage}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                <View
                  style={[p.row, { alignSelf: "flex-start", flexWrap: "wrap" }]}
                >
                  {invoice.documentUrl && (
                    <SmallButton
                      title={`${invoice.series ?? ""} ${invoice.number ?? ""}`}
                      icon={ExternalLink}
                      onPress={() => void link.open(invoice.documentUrl!)}
                    />
                  )}
                  {invoice.refundDocumentUrl && (
                    <SmallButton
                      title={`${copy("invoicing.refundShort")} ${invoice.refundSeries ?? ""} ${invoice.refundNumber ?? ""}`}
                      icon={ExternalLink}
                      onPress={() => void link.open(invoice.refundDocumentUrl!)}
                    />
                  )}
                  {[invoice.status, invoice.refundStatus].some(
                    (status) =>
                      status === "failed" || status === "needs_review",
                  ) && (
                    <SmallButton
                      title={copy("invoicing.retry")}
                      icon={RefreshCw}
                      disabled={action.busy}
                      onPress={() =>
                        void action.run(
                          () =>
                            accountApi(
                              `/dashboard/invoicing/invoices/${invoice.id}/retry`,
                              { method: "POST" },
                            ),
                          "invoicing.retryQueued",
                        )
                      }
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      {link.error && (
        <Text style={{ color: colors.danger }}>
          {copy("feedback.loadFailed")}
        </Text>
      )}
      {disconnect && (
        <Confirm
          title={copy("invoicing.disconnect")}
          detail={copy("invoicing.disconnectConfirm")}
          busy={action.busy}
          onClose={() => setDisconnect(false)}
          onConfirm={() =>
            void action.run(
              () =>
                accountApi("/dashboard/invoicing/settings", {
                  method: "DELETE",
                }),
              "invoicing.disconnected",
              () => {
                setSettings(defaults);
                setOptions(undefined);
                setDisconnect(false);
              },
            )
          }
        />
      )}
    </View>
  );
}
function InvoiceStatus({ status, label }: { status: string; label: string }) {
  return (
    <Status
      label={label}
      tone={
        status === "issued"
          ? "green"
          : status === "failed" || status === "needs_review"
            ? "red"
            : "amber"
      }
    />
  );
}
