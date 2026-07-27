"use client";

import { Check, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { User } from "@/core/DataProvider";

export function PersonalDetailsForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved?: () => Promise<void> | void;
}) {
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
      setError("Numele afisat trebuie sa aiba cel putin 3 caractere.");
      return;
    }

    setState("saving");
    setError(undefined);
    try {
      await user.updateProfile({ username: trimmedUsername, bio: bio.trim() });
      await onSaved?.();
      setState("saved");
      window.setTimeout(() => setState("idle"), 1600);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Datele nu au putut fi actualizate.");
      setState("idle");
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nume afisat
        </label>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          minLength={3}
          maxLength={50}
          required
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.08]"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Cateva cuvinte despre tine..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-white/[0.08]"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={state === "saving"}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60 sm:w-auto"
      >
        {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === "saved" && <Check className="h-4 w-4" />}
        {state === "saving" ? "Se salveaza..." : state === "saved" ? "Salvat" : "Salveaza modificarile"}
      </button>
    </form>
  );
}
