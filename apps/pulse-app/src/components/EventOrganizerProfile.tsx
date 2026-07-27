"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ChevronRight, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { type PublicProfile, User } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

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
    router.push(`/users/${organizerId}`);
  };

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground/90">
        {t("eventSheet.organizer")}
      </h3>
      <button
        type="button"
        onClick={openProfile}
        className="mt-3 flex w-full items-center gap-3 border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-primary/35 hover:bg-white/[0.055]"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 text-primary">
          {organizer?.avatarUrl ? (
            <img
              src={organizer.avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : organizer ? (
            organizer.username.slice(0, 1).toUpperCase()
          ) : (
            <UserRound className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">
              {organizer?.organizerName || organizer?.username || t("eventSheet.organizer")}
            </p>
            {organizer?.organizerVerified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
            )}
          </div>
          {organizer && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              @{organizer.username}
            </p>
          )}
        </div>
        <span className="sr-only">{t("eventSheet.viewOrganizerProfile")}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </section>
  );
}
