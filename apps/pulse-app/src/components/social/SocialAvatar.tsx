import type { PublicProfile } from "@/core/DataProvider";

export function SocialAvatar({
  profile,
  size = "h-10 w-10",
  active = false,
}: {
  profile: Pick<PublicProfile, "username" | "avatarUrl">;
  size?: string;
  active?: boolean;
}) {
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center overflow-hidden rounded-full border bg-surface text-xs font-semibold text-primary ${active ? "border-primary ring-2 ring-primary/25" : "border-white/15"}`}
    >
      {profile.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        profile.username.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
