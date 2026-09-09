"use client";

import {
  ExternalLink,
  Link2Off,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type BillingInvoice,
  type InvoicingProviderOptions,
  type InvoicingSettingsPayload,
} from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

const defaultSettings: InvoicingSettingsPayload = {
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

export default function InvoicingPage() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<InvoicingSettingsPayload>(defaultSettings);
  const [connected, setConnected] = useState(false);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [providerOptions, setProviderOptions] = useState<InvoicingProviderOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!user) return;
    setInvoices(await user.listBillingInvoices());
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    void Promise.all([user.getInvoicingSettings(), user.listBillingInvoices()])
      .then(async ([current, invoiceRows]) => {
        if (!active) return;
        setConnected(current.connected);
        const nextSettings: InvoicingSettingsPayload = {
          provider: current.provider ?? "oblio",
          enabled: current.connected ? current.enabled : true,
          accountEmail: current.accountEmail ?? "",
          apiToken: "",
          companyVatCode: current.companyVatCode ?? "",
          seriesName: current.seriesName ?? "",
          vatName: current.vatName ?? "",
          vatPercentage: current.vatPercentage ?? 0,
          sendEmail: current.connected ? current.sendEmail : true,
          sendToSpv: current.connected ? current.sendToSpv : true,
        };
        setSettings(nextSettings);
        setInvoices(invoiceRows);
        if (current.connected) {
          try {
            const options = await user.getInvoicingProviderOptions({
              provider: nextSettings.provider,
              accountEmail: nextSettings.accountEmail,
              companyVatCode: nextSettings.companyVatCode,
            });
            if (active) setProviderOptions(options);
          } catch {
            // The saved values remain visible and can be refreshed manually.
          }
        }
      })
      .catch(() => active && toast.error(t("invoicing.loadFailed")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t, user]);

  useEffect(() => {
    if (!user || !invoices.some((invoice) => invoice.status === "pending" || invoice.status === "processing")) return;
    const timer = window.setInterval(() => void loadInvoices().catch(() => undefined), 10000);
    return () => window.clearInterval(timer);
  }, [invoices, loadInvoices, user]);

  const stats = useMemo(
    () => ({
      issued: invoices.filter((invoice) => invoice.status === "issued").length,
      inProgress: invoices.filter((invoice) => invoice.status === "pending" || invoice.status === "processing").length,
      attention: invoices.filter((invoice) => invoice.status === "failed" || invoice.status === "needs_review").length,
    }),
    [invoices],
  );

  const update = <K extends keyof InvoicingSettingsPayload>(key: K, value: InvoicingSettingsPayload[K]) => {
    if (key === "provider" || key === "accountEmail" || key === "apiToken" || key === "companyVatCode") {
      setProviderOptions(null);
    }
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const loadProviderOptions = async () => {
    if (!user || loadingOptions) return;
    setLoadingOptions(true);
    try {
      const options = await user.getInvoicingProviderOptions({
        provider: settings.provider,
        accountEmail: settings.accountEmail,
        apiToken: settings.apiToken?.trim() || undefined,
        companyVatCode: settings.companyVatCode,
      });
      setProviderOptions(options);
      setSettings((current) => {
        const selectedSeries = options.series.find((option) => option.name === current.seriesName)
          ?? options.series.find((option) => option.default)
          ?? options.series[0];
        const selectedRate = options.vatRates.find((option) => option.name === current.vatName && option.percentage === current.vatPercentage)
          ?? options.vatRates.find((option) => option.default)
          ?? options.vatRates[0];
        return {
          ...current,
          seriesName: selectedSeries?.name ?? "",
          vatName: selectedRate?.name ?? "",
          vatPercentage: selectedRate?.percentage ?? 0,
        };
      });
      toast.success(t("invoicing.optionsLoaded"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("invoicing.optionsLoadFailed"));
    } finally {
      setLoadingOptions(false);
    }
  };

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const result = await user.saveInvoicingSettings({
        ...settings,
        apiToken: settings.apiToken?.trim() || undefined,
      });
      setConnected(result.connected);
      setSettings((current) => ({ ...current, apiToken: "", enabled: result.enabled }));
      toast.success(t("invoicing.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("invoicing.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!user || disconnecting || !window.confirm(t("invoicing.disconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      await user.disconnectInvoicing();
      setConnected(false);
      setSettings(defaultSettings);
      setProviderOptions(null);
      toast.success(t("invoicing.disconnected"));
    } catch {
      toast.error(t("invoicing.disconnectFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  const retry = async (id: string) => {
    if (!user || retrying) return;
    setRetrying(id);
    try {
      await user.retryBillingInvoice(id);
      await loadInvoices();
      toast.success(t("invoicing.retryQueued"));
    } catch {
      toast.error(t("invoicing.retryFailed"));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <main className="app-page-spacing mx-auto max-w-5xl pb-[110px] text-foreground">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("invoicing.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("invoicing.subtitle")}</p>
      </header>

      {loading ? (
        <div className="mt-7 h-72 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      ) : (
        <>
          <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{t("invoicing.integrationTitle")}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("invoicing.integrationHint")}</p>
                </div>
              </div>
              {connected && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">{t("invoicing.connected")}</span>}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {(["oblio", "smartbill"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => update("provider", provider)}
                  className={`rounded-xl border p-4 text-left transition ${settings.provider === provider ? "border-primary/50 bg-primary/[0.08]" : "border-white/10 bg-black/15 hover:bg-white/[0.04]"}`}
                >
                  <span className="text-sm font-semibold">{provider === "oblio" ? "Oblio" : "SmartBill"}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(`invoicing.providers.${provider}`)}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input label={t("invoicing.accountEmail")} type="email" value={settings.accountEmail} onChange={(value) => update("accountEmail", value)} autoComplete="username" />
              <Input label={connected ? t("invoicing.apiTokenKeep") : t("invoicing.apiToken")} type="password" value={settings.apiToken ?? ""} onChange={(value) => update("apiToken", value)} autoComplete="new-password" />
              <Input label={t("invoicing.companyVatCode")} value={settings.companyVatCode} onChange={(value) => update("companyVatCode", value)} />
              <div className="flex items-end">
                <button type="button" onClick={() => void loadProviderOptions()} disabled={loadingOptions} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 text-sm font-semibold text-primary transition hover:bg-primary/[0.1] disabled:opacity-50">
                  {loadingOptions ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {loadingOptions ? t("invoicing.loadingOptions") : t("invoicing.loadOptions")}
                </button>
              </div>
              {providerOptions && (
                <>
                  <SelectField label={t("invoicing.seriesName")} value={settings.seriesName} onChange={(value) => update("seriesName", value)} placeholder={t("invoicing.selectSeries")} options={providerOptions.series.map((option) => ({ value: option.name, label: option.name }))} />
                  <SelectField
                    label={t("invoicing.vatRate")}
                    value={vatRateValue(settings.vatName, settings.vatPercentage)}
                    onChange={(value) => {
                      const option = providerOptions.vatRates.find((rate) => vatRateValue(rate.name, rate.percentage) === value);
                      if (option) setSettings((current) => ({ ...current, vatName: option.name, vatPercentage: option.percentage }));
                    }}
                    placeholder={t("invoicing.selectVatRate")}
                    options={providerOptions.vatRates.map((option) => ({ value: vatRateValue(option.name, option.percentage), label: option.name ? `${option.name} · ${option.percentage}%` : t("invoicing.noVat") }))}
                  />
                </>
              )}
            </div>

            <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <Toggle checked={settings.enabled} onChange={(value) => update("enabled", value)} label={t("invoicing.enabled")} hint={t("invoicing.enabledHint")} />
              <Toggle checked={settings.sendEmail} onChange={(value) => update("sendEmail", value)} label={t("invoicing.sendEmail")} hint={t("invoicing.sendEmailHint")} />
              {settings.provider === "oblio" ? (
                <Toggle checked={settings.sendToSpv} onChange={(value) => update("sendToSpv", value)} label={t("invoicing.sendToSpv")} hint={t("invoicing.sendToSpvHint")} />
              ) : (
                <p className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-xs leading-5 text-muted-foreground">{t("invoicing.smartBillSpvHint")}</p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {connected && (
                <button type="button" onClick={disconnect} disabled={disconnecting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-400/25 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50">
                  {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
                  {t("invoicing.disconnect")}
                </button>
              )}
              <button type="button" onClick={save} disabled={saving || !providerOptions} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? t("invoicing.verifying") : t("invoicing.saveAndVerify")}
              </button>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("invoicing.invoiceHistory")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("invoicing.invoiceHistoryHint")}</p>
              </div>
              <button type="button" onClick={() => void loadInvoices()} aria-label={t("invoicing.refresh")} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:bg-white/5 hover:text-white">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Metric label={t("invoicing.status.issued")} value={stats.issued} />
              <Metric label={t("invoicing.inProgress")} value={stats.inProgress} />
              <Metric label={t("invoicing.attention")} value={stats.attention} alert={stats.attention > 0} />
            </div>

            {invoices.length ? (
              <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                {invoices.map((invoice) => (
                  <article key={invoice.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{invoice.eventTitle}</p>
                          <Status status={invoice.status} label={t(`invoicing.status.${invoice.status}`)} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{invoice.customerName} · {invoice.customerEmail}</p>
                        <p className="mt-2 text-xs text-white/45">{new Date(invoice.createdAt).toLocaleString()} · {invoice.totalAmountRon} RON</p>
                        {invoice.errorMessage && <p className="mt-3 max-w-2xl rounded-lg bg-red-500/[0.08] px-3 py-2 text-xs leading-5 text-red-300">{invoice.errorMessage}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {invoice.documentUrl && (
                          <a href={invoice.documentUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold transition hover:bg-white/5">
                            <ExternalLink className="h-3.5 w-3.5" /> {invoice.series} {invoice.number}
                          </a>
                        )}
                        {(invoice.status === "failed" || invoice.status === "needs_review") && (
                          <button type="button" onClick={() => void retry(invoice.id)} disabled={Boolean(retrying)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/25 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50">
                            {retrying === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            {t("invoicing.retry")}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-white/15 p-6 text-sm text-muted-foreground">
                <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t("invoicing.noInvoices")}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function vatRateValue(name: string, percentage: number) {
  return `${name}\u0000${percentage}`;
}

function SelectField({ label, ...props }: { label: string } & React.ComponentProps<typeof ThemedSelect>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-white/70">{label}</span>
      <ThemedSelect {...props} />
    </label>
  );
}

function Input({ label, value, onChange, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; type?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-white/70">{label}</span>
      <input {...props} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 text-base outline-none transition focus:border-primary/60 sm:text-sm" />
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/10 bg-black/15 px-3.5 py-3">
      <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
    </label>
  );
}

function Metric({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className={`text-lg font-bold ${alert ? "text-red-300" : "text-white"}`}>{value}</p><p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p></div>;
}

function Status({ status, label }: { status: BillingInvoice["status"]; label: string }) {
  const color = status === "issued" ? "bg-emerald-500/10 text-emerald-300" : status === "failed" || status === "needs_review" ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-200";
  return <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${color}`}>{label}</span>;
}
