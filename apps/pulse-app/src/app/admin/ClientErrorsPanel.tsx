"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDataProvider } from "@/core/DataProviderContext";
import { apiRoot } from "@/core/apiRoot";
import { getAccessTokenSync } from "@/lib/native/sessionStorage";
import { parseErrorPage, type ErrorEntry } from "@/features/diagnostics/report";

export function ClientErrorsPanel() {
  const { user, isAdmin } = useDataProvider(),
    { i18n } = useTranslation(),
    ro = i18n.language.startsWith("ro");
  const [open, setOpen] = useState(false),
    [platform, setPlatform] = useState(""),
    [rows, setRows] = useState<ErrorEntry[]>([]),
    [cursor, setCursor] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const epoch = useRef(0),
    abort = useRef<AbortController | null>(null),
    lock = useRef(false);
  const load = async (append = false) => {
    if (!isAdmin || !user || lock.current) return;
    const version = epoch.current,
      token = getAccessTokenSync();
    if (!token) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        apiRoot +
          "/admin/client-errors?" +
          new URLSearchParams({ platform, cursor: append ? cursor : "" }),
        {
          signal: controller.signal,
          cache: "no-store",
          headers: { Authorization: "Bearer " + token },
        },
      );
      if (!response.ok) throw Error("Load failed");
      const data = parseErrorPage(await response.json());
      if (version !== epoch.current || getAccessTokenSync() !== token) return;
      setRows((old) =>
        append
          ? [
              ...old,
              ...data.items.filter(
                (item) => !old.some((row) => row.id === item.id),
              ),
            ]
          : data.items,
      );
      setCursor(data.nextCursor);
    } catch {
      if (version === epoch.current && getAccessTokenSync() === token)
        setFailed(true);
    } finally {
      clearTimeout(timer);
      if (version === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    epoch.current++;
    abort.current?.abort();
    lock.current = false;
    setRows([]);
    setCursor("");
    setBusy(false);
    setFailed(false);
    if (open && isAdmin) void load();
    return () => {
      epoch.current++;
      abort.current?.abort();
    };
  }, [open, platform, user?.properties.id, isAdmin]);
  if (!isAdmin) return null;
  const button =
    "rounded-full bg-white/10 px-4 py-2 text-sm disabled:opacity-50";
  const download = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), reports: rows },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "spottr-errors.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="space-y-4">
      <button type="button" className={button} onClick={() => setOpen(!open)}>
        {ro ? "Erori aplicație" : "Application errors"}
      </button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            {ro
              ? "Rapoarte tehnice din ultimele 30 de zile. Mesajele brute și datele personale sunt excluse."
              : "Technical reports from the last 30 days. Raw messages and personal data are excluded."}
          </p>
          <div className="flex flex-wrap gap-2">
            {["", "ios", "android", "web"].map((value) => (
              <button
                type="button"
                key={value}
                className={button + (platform === value ? " text-primary" : "")}
                onClick={() => setPlatform(value)}
              >
                {value || (ro ? "Toate" : "All")}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => void load()}
            >
              {ro ? "Actualizează" : "Refresh"}
            </button>
          </div>
          {busy && <p>{ro ? "Se încarcă…" : "Loading…"}</p>}
          {failed && (
            <p role="alert" className="text-red-300">
              {ro
                ? "Rapoartele nu au putut fi încărcate."
                : "Reports could not be loaded."}
            </p>
          )}
          {!busy && !failed && !rows.length && (
            <p>{ro ? "Nicio eroare raportată." : "No reported errors."}</p>
          )}
          {rows.map((row) => (
            <details key={row.id} className="rounded-2xl bg-white/5 p-4">
              <summary className="cursor-pointer">
                {row.errorType} · {row.category} · {row.screen}
                <span className="block text-xs text-muted-foreground">
                  {row.platform} · v{row.appVersion} ({row.buildVersion}) · OS{" "}
                  {row.osVersion} ·{" "}
                  {new Date(row.occurredAt).toLocaleString(
                    ro ? "ro-RO" : "en-GB",
                  )}
                </span>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>{row.breadcrumbs.join(" → ")}</p>
                <pre className="whitespace-pre-wrap break-all">
                  {row.frames
                    .map(
                      (frame) =>
                        `${frame.function} (${frame.file}:${frame.line}:${frame.column})`,
                    )
                    .join("\n") ||
                    (ro ? "Fără stack disponibil" : "No stack available")}
                </pre>
                <p className="break-all">
                  ID: {row.id}
                  <br />
                  Fingerprint: {row.fingerprint}
                </p>
              </div>
            </details>
          ))}
          {cursor && (
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() => void load(true)}
            >
              {ro ? "Mai multe" : "More"}
            </button>
          )}
          {!!rows.length && (
            <button type="button" className={button} onClick={download}>
              {ro
                ? "Exportă JSON (rapoartele încărcate)"
                : "Export JSON (loaded reports)"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
