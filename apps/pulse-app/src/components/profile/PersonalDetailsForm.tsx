"use client";

import { Check, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { User, UserData } from "@/core/DataProvider";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {Input as UIInput,TextArea as UITextArea,Field as UIField} from '@/components/ui/Field';

export function PersonalDetailsForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved?: (updatedUser: UserData) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.properties.username);
  const [bio, setBio] = useState(user.properties.bio ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string>();

  useEffect(() => {
    setUsername(user.properties.username);
    setBio(user.properties.bio ?? "");
  }, [user]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      const message = t("profile.displayNameTooShort");
      setError(message);
      toast.error(message);
      return;
    }

    setState("saving");
    setError(undefined);
    try {
      const updatedUser = await user.updateProfile({
        username: trimmedUsername,
        bio: bio.trim(),
      });
      await onSaved?.(updatedUser);
      setState("saved");
      toast.success(t("profile.updateSuccess"));
      window.setTimeout(() => setState("idle"), 1600);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : t("profile.updateFailed");
      setError(message);
      toast.error(message);
      setState("idle");
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <UIField label={t("profile.displayName")}>
        <UIInput
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          minLength={3}
          maxLength={50}
          required
          className="w-full transition placeholder:text-muted-foreground/50"
        />
      </UIField>
      <UIField label={t("profile.bio")}>
        <UITextArea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("profile.bioPlaceholder")}
          className="w-full resize-none transition placeholder:text-muted-foreground/50"
        />
      </UIField>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <UIActionButton
        type="submit"
        disabled={state === "saving"}
        className="inline-flex h-10 w-full items-center justify-center gap-2 px-6 text-xs font-bold transition hover:opacity-90  disabled:opacity-60 sm:w-auto"
      >
        {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "saved" && <Check className="h-4 w-4" />}
        {state === "saving" ? t("profile.saving") : state === "saved" ? t("profile.saved") : t("profile.saveChanges")}
      </UIActionButton>
    </form>
  );
}
