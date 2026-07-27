"use client";

export function GoogleSignInButton({
  returnTo,
  className = "",
}: {
  returnTo?: string;
  className?: string;
}) {
  const startGoogleLogin = () => {
    const apiRoot = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
    const url = new URL(`${apiRoot}/auth/google`);
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    window.location.assign(url.toString());
  };

  return (
    <button
      type="button"
      onClick={startGoogleLogin}
      className={`flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-foreground transition hover:border-white/25 hover:bg-white/[0.08] ${className}`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-black">G</span>
      Continuă cu Google
    </button>
  );
}
