"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, Loader2, UserRound } from "lucide-react";
import type { User as PulseUser, UserData } from "@/core/DataProvider";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AvatarImageError, prepareAvatarImage } from "./prepareAvatarImage";

type ProfileAvatarUploadProps = {
  user: PulseUser;
  size?: "large" | "medium";
  showBadge?: boolean;
  onUploaded?: (updatedUser: UserData) => Promise<void> | void;
};

export function ProfileAvatarUpload({
  user,
  size = "large",
  showBadge = false,
  onUploaded,
}: ProfileAvatarUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.properties.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const dimensions = size === "large" ? "h-20 w-20" : "h-16 w-16";

  useEffect(() => {
    setAvatarUrl(user.properties.avatarUrl);
  }, [user]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const prepared = await prepareAvatarImage(file);
      const updatedUser = await user.uploadAvatar(prepared);
      setAvatarUrl(updatedUser.avatarUrl);
      await onUploaded?.(updatedUser);
      toast.success(t("profile.avatarUpdated"));
    } catch (error) {
      const errorKey = error instanceof AvatarImageError
        ? {
            invalidType: "profile.invalidImage",
            sourceTooLarge: "profile.imageTooLarge",
            decodeFailed: "profile.imageProcessingFailed",
            outputTooLarge: "profile.imageOptimizedTooLarge",
          }[error.code]
        : "profile.imageUploadFailed";
      toast.error(t(errorKey));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading}
        title={t("profile.changeAvatar")}
        className={`group relative grid ${dimensions} overflow-visible rounded-full bg-white/5 ring-2 ring-primary/40 transition hover:ring-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait`}
      >
        <span className="absolute inset-0 grid overflow-hidden rounded-full [clip-path:circle(50%)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={t("profile.profilePhotoOf", {
                name: user.properties.username,
              })}
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
        </span>
        <span className="z-10 absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      {showBadge && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-[var(--ui-action)] px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
          PRO
        </span>
      )}
    </div>
  );
}
