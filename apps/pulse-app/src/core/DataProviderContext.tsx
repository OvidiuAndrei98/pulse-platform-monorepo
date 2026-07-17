"use client";

// src/core/DataProviderContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { usePathname, useRouter } from "next/navigation"; // 1. Am adăugat router-ul
import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";

interface DataProviderContextProps {
  user: ReadableSchema<"User"> | null;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  reloadSession: () => Promise<void>;
}

const DataProviderContext = createContext<DataProviderContextProps | undefined>(
  undefined,
);

type User = ReadableSchema<"User">;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const isProtectedRoute = pathname?.startsWith("/user/");

  const getStoredToken = (): string | null => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pulse_token");
    }
    return null;
  };

  const initializeSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    ApiClient.configure({
      apiRoot:
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
      getAccessToken: getStoredToken,
    });

    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const userData = await ApiClient.instance.get("/users/me");
      setUser(userData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to resolve active user session"),
      );
      setUser(null);
      // Dacă token-ul a expirat sau e invalid, îl ștergem
      if (typeof window !== "undefined") {
        localStorage.removeItem("pulse_token");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  useEffect(() => {
    if (!loading && !user && isProtectedRoute) {
      router.push("/login");
    }
  }, [loading, user, isProtectedRoute, router]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setLoading(true);
      setError(null);

      ApiClient.configure({
        apiRoot:
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
        getAccessToken: getStoredToken,
      });

      try {
        const response = await ApiClient.instance.post("/auth/login", {
          body: { email, password },
        });

        if (typeof window !== "undefined") {
          localStorage.setItem("pulse_token", response.token);
        }

        await initializeSession();

        // Opțional: Dupa login, dacă vrei să-l duci automat în dashboard
        router.push("/user/dashboard");
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Login failed"));
        setLoading(false);
      }
    },
    [initializeSession, router],
  );

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pulse_token");
    }
    setUser(null);
    // Îl aruncăm afară dacă dă logout de pe o pagină protejată
    if (isProtectedRoute) {
      router.push("/login");
    }
  }, [isProtectedRoute, router]);

  const getToken = useCallback((): string | null => {
    return getStoredToken();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      getToken,
      reloadSession: initializeSession,
    }),
    [user, loading, error, login, logout, getToken, initializeSession],
  );

  // 5. PROTECȚIE ECRAN (FOARTE IMPORTANT)
  // Dacă suntem pe o pagină protejată și încă se verifică token-ul, blocăm randarea.
  // Altfel, utilizatorul ar vedea fracțiuni de secundă pagina protejată până îl trimite router-ul la login.
  if (isProtectedRoute && loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        {/* Aici poți pune spinner-ul tău de loading */}
        <span>Se încarcă...</span>
      </div>
    );
  }

  // Pentru homepage și restul paginilor, randăm normal (chiar dacă loading-ul e true, lăsăm UI-ul să meargă mai departe)
  return (
    <DataProviderContext.Provider value={value}>
      {children}
    </DataProviderContext.Provider>
  );
}

export function useDataProvider() {
  const context = useContext(DataProviderContext);
  if (!context) {
    throw new Error(
      "useDataProvider trebuie folosit în interiorul unui DataProvider",
    );
  }
  return context;
}
