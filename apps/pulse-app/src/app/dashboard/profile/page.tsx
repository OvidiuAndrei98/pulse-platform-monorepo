"use client";

import Link from "next/link";
import { ArrowUpRight, KeyRound, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useDataProvider } from "@/core/DataProviderContext";
import { OrganizerProfile } from "@/core/DataProvider";
import { ProfileAvatarUpload } from "@/components/profile/ProfileAvatarUpload";
import { PersonalDetailsForm } from "@/components/profile/PersonalDetailsForm";
import { PasswordResetRequest } from "@/components/profile/PasswordResetRequest";
import { LanguagePreferenceRow } from "@/components/profile/LanguagePreferenceRow";
import { useTranslation } from "react-i18next";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, updateSessionUser } = useDataProvider();
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile>();
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    void user
      .getOrganizerProfile()
      .then((profile) => {
        if (!cancelled) setOrganizerProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setOrganizerProfile(undefined);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="w-full pb-20 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 sm:px-6">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {t("dashboardNav.organizer")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("organizerProfile.title")}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("organizerProfile.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm sm:flex-row sm:items-center">
            {user ? (
              <ProfileAvatarUpload
                user={user}
                size="medium"
                onUploaded={updateSessionUser}
              />
            ) : (
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <span className="text-xl font-bold">US</span>
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-base font-semibold">
                {user?.properties.username ||
                  t("organizerProfile.userFallback")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.properties.email || "email@exemplu.com"}
              </p>
              <div className="pt-1">
                {profileLoading ? (
                  <span className="inline-block h-4 w-32 animate-pulse bg-white/10" />
                ) : organizerProfile?.verificationStatus === "approved" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    {t("organizerProfile.companyVerified", {
                      company: organizerProfile.companyName
                        ? `: ${organizerProfile.companyName}`
                        : "",
                    })}
                  </span>
                ) : (
                  <Link
                    href="/dashboard/ticket-validation"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 transition hover:text-amber-200"
                  >
                    <span>
                      {organizerProfile?.verificationStatus === "pending"
                        ? t("organizerProfile.companyPending")
                        : organizerProfile?.verificationStatus === "rejected"
                          ? t("organizerProfile.companyRejected")
                          : t("organizerProfile.configureCompany")}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Section
              title={t("organizerProfile.publicDetails")}
              icon={UserIcon}
            >
              {user && (
                <PersonalDetailsForm user={user} onSaved={updateSessionUser} />
              )}
            </Section>
            <Section
              title={t("organizerProfile.passwordSecurity")}
              icon={KeyRound}
            >
              <PasswordResetRequest email={user?.properties.email} />
            </Section>
            <Section title={t("profile.language")} icon={UserIcon}>
              <div className="-mx-2 -my-2 overflow-hidden rounded-lg border border-white/10">
                <LanguagePreferenceRow />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof UserIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-2.5 border-b border-white/5 pb-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}
