"use client";

import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ApiClient } from "@packages/api-client/src/Client";

const maxImageBytes = 5 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function EventBannerUpload({
  value,
  onChange,
}: {
  value?: string;
  onChange: (url?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectURLRef = useRef<string | null>(null);
  const [previewURL, setPreviewURL] = useState(value);
  const [error, setError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!objectURLRef.current) setPreviewURL(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (objectURLRef.current) URL.revokeObjectURL(objectURLRef.current);
    };
  }, []);

  const clearPreview = () => {
    if (objectURLRef.current) {
      URL.revokeObjectURL(objectURLRef.current);
      objectURLRef.current = null;
    }
    setPreviewURL(undefined);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!acceptedImageTypes.has(file.type)) {
      setError("Alege o imagine JPG, PNG sau WebP.");
      return;
    }
    if (file.size > maxImageBytes) {
      setError("Imaginea poate avea cel mult 5 MB.");
      return;
    }

    setError(undefined);
    clearPreview();
    const localPreviewURL = URL.createObjectURL(file);
    objectURLRef.current = localPreviewURL;
    setPreviewURL(localPreviewURL);
    setIsUploading(true);

    try {
      const { url } = await ApiClient.instance.uploadEventBanner(file);
      URL.revokeObjectURL(localPreviewURL);
      objectURLRef.current = null;
      setPreviewURL(url);
      onChange(url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Imaginea nu a putut fi incarcata.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    clearPreview();
    setError(undefined);
    onChange(undefined);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />
      <div className="overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
        {previewURL ? (
          <div className="relative aspect-[16/7]">
            <img
              src={previewURL}
              alt="Previzualizare imagine eveniment"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-3 right-3 flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="h-9 rounded-lg border border-white/20 bg-black/60 px-3 text-xs font-semibold text-white transition hover:bg-black/80 disabled:opacity-60"
              >
                Inlocuieste
              </button>
              <button
                type="button"
                onClick={removeImage}
                disabled={isUploading}
                aria-label="Sterge imaginea"
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-black/60 text-white transition hover:bg-red-500/70 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="flex min-h-36 w-full flex-col items-center justify-center gap-2 px-4 py-6 text-center transition hover:bg-white/[0.04] disabled:cursor-wait"
          >
            {isUploading ? (
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <ImagePlus className="h-6 w-6 text-primary" />
            )}
            <span className="text-sm font-semibold text-foreground">
              {isUploading ? "Se incarca imaginea..." : "Adauga imaginea evenimentului"}
            </span>
            <span className="text-xs text-muted-foreground">JPG, PNG sau WebP, maximum 5 MB</span>
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
