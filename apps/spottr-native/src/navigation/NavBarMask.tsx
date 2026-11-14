import React from 'react';

export type NavBarMaskProps = { width: number; height: number; children: React.ReactNode };

// The browser clips the backdrop surface directly, preserving backdrop blur.
export function NavBarMask({ children }: NavBarMaskProps) {
  return <>{children}</>;
}
