"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";

export default function MePage() {
  const { user, loading, logout } = useDataProvider();
  const router = useRouter();

  // Redirect to /login if not authenticated after loading
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="animate-pulse">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = user.username
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-16">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            My Profile
          </h1>
          <button
            onClick={handleLogout}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-6">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-lg font-semibold text-zinc-600 dark:text-zinc-300">
                {initials}
              </div>
            )}
            <div>
              <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {user.username}
              </p>
              <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 capitalize">
                {user.role}
              </span>
            </div>
          </div>

          {/* Details */}
          <dl className="flex flex-col gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-500">Email</dt>
              <dd className="text-zinc-900 dark:text-zinc-100 font-medium">
                {user.email}
              </dd>
            </div>
            {user.bio && (
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">Bio</dt>
                <dd className="text-zinc-900 dark:text-zinc-100 font-medium text-right max-w-xs">
                  {user.bio}
                </dd>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <dt className="text-zinc-500">Member since</dt>
              <dd className="text-zinc-900 dark:text-zinc-100 font-medium">
                {new Date(user.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
