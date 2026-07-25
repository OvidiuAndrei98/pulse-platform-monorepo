"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Ticket, UserRoundPlus, UsersRound } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";

type FeedItem = ReadableSchema<"SocialFeedItemResponse">;
type PublicProfile = ReadableSchema<"PublicProfileResponse">;

export default function FeedPage() {
  const { user, loading } = useDataProvider();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [requests, setRequests] = useState<PublicProfile[]>([]);
  const [pending, setPending] = useState(true);
  const [visibleCount, setVisibleCount] = useState(6);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      ApiClient.instance.get("/feed") as Promise<FeedItem[]>,
      ApiClient.instance.get("/friends/requests") as Promise<PublicProfile[]>,
    ]).then(([feed, received]) => {
      setItems(feed);
      setRequests(received);
      setVisibleCount(6);
    }).catch(() => {
      setItems([]);
      setRequests([]);
    }).finally(() => setPending(false));
  }, [user]);

  const respond = async (id: string, status: "accepted" | "declined") => {
    await ApiClient.instance.put("/friends/request/{userId}", { params: { path: { userId: id } }, body: { status } });
    setRequests((current) => current.filter((request) => request.id !== id));
  };

  if (!loading && !user) return <main className="mx-auto min-h-screen max-w-xl px-5 pt-12 text-foreground"><h1 className="text-2xl font-semibold">Activitate</h1><p className="mt-3 text-sm text-muted-foreground">Conecteaza-te pentru a vedea activitatea prietenilor.</p><Link href="/login" className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Conecteaza-te</Link></main>;

  return <main className="mx-auto flex h-dvh max-w-2xl flex-col overflow-hidden px-5 pt-10 text-foreground sm:px-7">
    <header className="shrink-0"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary"><UsersRound className="h-5 w-5" /></span><div><h1 className="text-2xl font-semibold">Activitate</h1><p className="text-sm text-muted-foreground">Prieteni si organizatori urmariti</p></div></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28 pt-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {requests.length > 0 && <section><h2 className="text-sm font-semibold">Cereri de prietenie</h2><div className="mt-3 space-y-2">{requests.map((request) => <div key={request.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3"><ProfileAvatar profile={request} /><Link href={`/users/${request.id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{request.username}</p><p className="text-xs text-muted-foreground">vrea sa va conectati</p></Link><button type="button" onClick={() => void respond(request.id, "accepted")} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></button><button type="button" onClick={() => void respond(request.id, "declined")} className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-muted-foreground">x</button></div>)}</div></section>}
      <section className={requests.length > 0 ? "mt-8" : ""}><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Noutati recente</h2>{items.length > 0 && <span className="text-xs text-muted-foreground">{Math.min(visibleCount, items.length)} din {items.length}</span>}</div>{pending ? <div className="mt-3 h-28 animate-pulse rounded-lg border border-white/10 bg-white/[0.035]" /> : items.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-white/15 px-5 py-10 text-center"><UserRoundPlus className="mx-auto h-5 w-5 text-primary" /><p className="mt-3 text-sm font-medium">Feed-ul tau este inca linistit.</p><p className="mt-1 text-xs text-muted-foreground">Adauga prieteni sau urmareste organizatori din cautare.</p></div> : <><div className="mt-3 divide-y divide-white/10 border-y border-white/10">{items.slice(0, visibleCount).map((item) => <FeedRow key={`${item.activityType}-${item.actorId}-${item.eventId}-${item.occurredAt}`} item={item} />)}</div>{visibleCount < items.length && <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + 6, items.length))} className="mt-4 w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary">Incarca mai multe</button>}</>}</section>
    </div>
  </main>;
}

function ProfileAvatar({ profile }: { profile: Pick<PublicProfile, "username" | "avatarUrl"> }) { return <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-surface text-xs font-semibold text-primary">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.username.slice(0, 1).toUpperCase()}</span>; }

function FeedRow({ item }: { item: FeedItem }) {
  const copy = item.activityType === "friend_ticket" ? "are bilet pentru" : item.activityType === "friend_going" ? "merge la" : "a publicat";
  return <Link href={`/events/${item.eventId}`} className="flex gap-3 py-3 transition hover:bg-white/[0.03]"><ProfileAvatar profile={{ username: item.actorUsername, avatarUrl: item.actorAvatarUrl }} /><div className="min-w-0 flex-1"><p className="text-sm"><span className="font-semibold">{item.activityType === "organizer_event" ? item.organizerName || item.actorUsername : item.actorUsername}</span> <span className="text-muted-foreground">{copy}</span></p><p className="mt-0.5 truncate text-sm font-semibold text-primary">{item.eventTitle}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.eventStartTime).toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}</p></div>{item.eventBannerUrl ? <Image src={item.eventBannerUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{item.activityType === "friend_ticket" ? <Ticket className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}</span>}</Link>;
}
