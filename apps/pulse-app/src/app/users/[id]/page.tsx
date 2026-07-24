"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, UsersRound } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { ProfileActions } from "@/components/social/ProfileActions";

type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); ApiClient.instance.get("/profiles/{id}", { params: { path: { id } } }).then((data) => setProfile(data as PublicProfile)).catch(() => setProfile(null)).finally(() => setLoaded(true)); }, [id]);
  if (!loaded) return <main className="min-h-screen bg-background px-5 pt-12 text-foreground"><div className="h-40 max-w-xl animate-pulse border border-white/10 bg-white/[0.035]" /></main>;
  if (!profile) return <main className="min-h-screen bg-background px-5 pt-12 text-foreground"><Link href="/feed" className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Inapoi</Link><p className="mt-8 text-sm text-muted-foreground">Profilul nu este disponibil.</p></main>;
  return <main className="mx-auto min-h-screen max-w-2xl px-5 pb-32 pt-10 text-foreground sm:px-7"><Link href="/feed" className="inline-flex h-9 items-center gap-2 text-xs font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Inapoi</Link><section className="mt-6 border border-white/10 bg-white/[0.035] p-5 sm:p-7"><div className="flex items-start gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/35 bg-primary/10 text-xl font-semibold text-primary">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.username.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold">{profile.role === "organizer" ? profile.organizerName || profile.username : profile.username}</h1>{profile.organizerVerified && <BadgeCheck className="h-5 w-5 text-primary" />}</div><p className="mt-1 text-sm text-muted-foreground">@{profile.username}{profile.role === "organizer" ? ` . ${profile.followerCount} urmaritori` : ""}</p></div><ProfileActions profile={profile} onChange={(update) => setProfile((current) => current ? { ...current, ...update } : current)} /></div>{profile.bio && <p className="mt-5 max-w-xl whitespace-pre-line text-sm leading-6 text-muted-foreground">{profile.bio}</p>}<div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-xs text-muted-foreground"><UsersRound className="h-4 w-4 text-primary" />{profile.role === "organizer" ? "Urmareste organizatorul pentru evenimente recomandate in feed." : profile.relationship === "friends" ? "Sunteti conectati." : "Conecteaza-te pentru a vedea activitatea in feed."}</div></section></main>;
}
