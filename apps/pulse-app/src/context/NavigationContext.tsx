"use client";

import { createContext, useContext, useRef, useState, RefObject } from "react";

type NavigationContextType = {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pagerRef: RefObject<HTMLDivElement>;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [page, setPage] = useState(0);

  const pagerRef = useRef<HTMLDivElement>(null);

  return (
    <NavigationContext.Provider
      value={{
        page,
        setPage,
        pagerRef,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigation must be used inside NavigationProvider");
  }

  return context;
}
