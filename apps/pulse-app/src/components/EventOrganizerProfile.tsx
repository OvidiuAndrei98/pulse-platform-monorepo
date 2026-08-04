"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { type PublicProfile, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { routeForPlatform } from "@/lib/native/navigation";

export function EventOrganizerProfile({
  organizerId,
  onOpen,
}: {
  organizerId: string;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useDataProvider();
  const [organizer, setOrganizer] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let active = true;

    User.getPublicProfile(organizerId, user?.properties.id)
      .then((profile) => active && setOrganizer(profile))
      .catch(() => active && setOrganizer(null));

    return () => {
      active = false;
    };
  }, [organizerId, user?.properties.id]);

  const openProfile = () => {
    if (onOpen) {
      onOpen();
      return;
    }
    router.push(routeForPlatform(`/users/${organizerId}`));
  };

  return (
    <button
      type="button"
      onClick={openProfile}
      className="group flex items-center gap-2.5 text-left transition-opacity hover:opacity-85 focus:outline-none"
    >
      {/* Avatar mic si curat */}
      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-[11px] font-bold text-white shadow-sm">
        {organizer?.avatarUrl ? (
          <img
            src={organizer.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : organizer ? (
          organizer.username.slice(0, 1).toUpperCase()
        ) : (
          <UserRound className="h-3.5 w-3.5 text-white/70" />
        )}
      </div>

      {/* Text inline discret */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-zinc-400 font-normal">Organizat de</span>
        <span className="font-semibold text-white group-hover:underline underline-offset-2 flex items-center gap-1">
          {organizer?.organizerName ||
            organizer?.username ||
            t("eventSheet.organizer")}
          {organizer?.organizerVerified && (
            <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
        </span>
        {organizer?.username && (
          <span className="text-zinc-500 font-normal hidden sm:inline">
            (@{organizer.username})
          </span>
        )}
      </div>
    </button>
  );
}
