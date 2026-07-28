"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { OrganizerEventUpdate, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function OrganizerUpdatesManager({
  eventId,
  status,
  endTime,
}: {
  eventId: string;
  status: string;
  endTime: string;
}) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const { updates, updatesLoading } = User.useEventUpdates(eventId);
  const { updates: organizerUpdates } = User.useOrganizerUpdates(user?.properties.id ?? "");
  const [managedUpdates, setManagedUpdates] = useState<readonly OrganizerEventUpdate[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canPublish = status === "published" && new Date(endTime).getTime() > Date.now();
  const activeCount = organizerUpdates.length;

  useEffect(() => setManagedUpdates(updates), [updates]);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;
    if (!ALLOWED_TYPES.has(nextFile.type) || nextFile.size > MAX_IMAGE_BYTES) {
      toast.error(t("organizerUpdates.invalidImage"));
      event.target.value = "";
      return;
    }
    setFile(nextFile);
  };

  const publish = async () => {
    if (!user || !file || !canPublish) return;
    setSubmitting(true);
    try {
      const uploaded = await user.uploadOrganizerUpdateImage(file);
      const created = await user.createEventUpdate(eventId, {
        imageUrl: uploaded.url,
        caption: caption.trim() || undefined,
      });
      setManagedUpdates((current) => [created, ...current]);
      setCaption("");
      setFile(null);
      toast.success(t("organizerUpdates.published"));
    } catch {
      toast.error(t("organizerUpdates.publishFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (updateId: string) => {
    if (!user) return;
    setDeletingId(updateId);
    try {
      await user.deleteEventUpdate(eventId, updateId);
      setManagedUpdates((current) => current.filter((update) => update.id !== updateId));
      toast.success(t("organizerUpdates.deleted"));
    } catch {
      toast.error(t("organizerUpdates.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="mt-8 border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("organizerUpdates.manageTitle")}</h2>
          <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            {t("organizerUpdates.manageHint")}
          </p>
        </div>
        <span className="border border-primary/25 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
          {t("organizerUpdates.activeCount", { count: activeCount })}
        </span>
      </div>

      {!canPublish && (
        <p className="mt-4 border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
          {t("organizerUpdates.unavailable")}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-white/15 bg-black/20 px-4 text-center text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
          <ImagePlus className="h-5 w-5 text-primary" />
          <span>{file?.name || t("organizerUpdates.selectImage")}</span>
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={!canPublish || submitting} />
        </label>
        <div className="flex flex-col gap-2 sm:w-52">
          <textarea
            value={caption}
            maxLength={160}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t("organizerUpdates.captionPlaceholder")}
            className="min-h-24 w-full resize-none border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50"
            disabled={!canPublish || submitting}
          />
          <button type="button" onClick={publish} disabled={!canPublish || !file || submitting || activeCount >= 3} className="inline-flex h-10 items-center justify-center gap-2 bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
            {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {t("organizerUpdates.publish")}
          </button>
        </div>
      </div>

      {updatesLoading ? (
        <div className="mt-4 grid grid-cols-3 gap-2">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse bg-white/[0.05]" />)}</div>
      ) : managedUpdates.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {managedUpdates.map((update) => (
            <div key={update.id} className="relative h-28 overflow-hidden border border-white/10 bg-black">
              <img src={update.imageUrl} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/75 p-2 text-[10px] text-white/80">{t("organizerUpdates.expires", { time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(update.expiresAt)) })}</div>
              <button type="button" aria-label={t("organizerUpdates.delete")} onClick={() => remove(update.id)} disabled={deletingId === update.id} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center bg-black/75 text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{t("organizerUpdates.empty")}</p>
      )}
    </section>
  );
}
