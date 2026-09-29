"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { canGoBack, safeInternalPath } from "@/lib/navigation/state";
import { routeForPlatform } from "@/lib/native/navigation";

export function BackLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  return <Link {...props} href={safeInternalPath(href)} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (canGoBack()) router.back();
    else router.replace(routeForPlatform(safeInternalPath(href)));
  }} />;
}
