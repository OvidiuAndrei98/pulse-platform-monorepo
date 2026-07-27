"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, Loader2, UserRound } from "lucide-react";
import type { User as PulseUser } from "@/core/DataProvider";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

type ProfileAvatarUploadProps = {
  user: PulseUser;
  size?: "large" | "medium";
  showBadge?: boolean;
  onUploaded?: () => void;
};

export function ProfileAvatarUpload({
  user,
  size = "large",
  showBadge = false,
  onUploaded,
}: ProfileAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.properties.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const dimensions = size === "large" ? "h-20 w-20" : "h-16 w-16";

  useEffect(() => {
    setAvatarUrl(user.properties.avatarUrl);
  }, [user]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!/image\/(jpeg|png|webp)/.test(file.type)) {
      setError("Alege o imagine JPG, PNG sau WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Poza de profil poate avea maximum 2 MB.");
      return;
    }

    setUploading(true);
    setError(undefined);
    try {
      const updatedUser = await user.uploadAvatar(file);
      setAvatarUrl(updatedUser.avatarUrl);
      onUploaded?.();
    } catch {
      setError("Poza nu a putut fi incarcata. Incearca din nou.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Schimba poza de profil"
        className={`group relative grid ${dimensions} overflow-hidden rounded-full bg-white/5 ring-2 ring-primary/40 transition hover:ring-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`Poza de profil a lui ${user.properties.username}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <UserRound className="m-auto h-1/2 w-1/2 text-muted-foreground" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-background/65 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Camera className="h-5 w-5 text-foreground" />
          )}
        </span>
        <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {showBadge && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          PRO
        </span>
      )}
      {error && (
        <p className="absolute left-0 top-full mt-2 w-52 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
