"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiClient } from "@packages/api-client/src/Client";
import { User } from "./DataProvider";

const getStoredToken = (): string | null => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("pulse_token");
  }
  return null;
};

ApiClient.configure({
  apiRoot: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1",
  getAccessToken: getStoredToken,
});

interface DataProviderContextProps {
  user: User | undefined;
  loading: boolean;
  error: Error | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    requestOrganizerRole: boolean,
  ) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  reloadSession: () => Promise<void>;
}

const DataProviderContext = createContext<DataProviderContextProps | undefined>(
  undefined,
);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const isProtectedRoute =
    pathname?.startsWith("/me") ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/admin");

  const initializeSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = getStoredToken();
    if (!token) {
      setUser(undefined);
      setLoading(false);
      return;
    }

    try {
      const userData = await ApiClient.instance.get("/users/me");

      setUser((currentUserInstance) => {
        if (
          currentUserInstance &&
          currentUserInstance.properties.id === userData.id
        ) {
          return currentUserInstance;
        }
        return new User(userData);
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to resolve active user session"),
      );
      setUser(undefined);
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

      try {
        const response = await ApiClient.instance.post("/auth/login", {
          body: { email, password },
        });

        if (typeof window !== "undefined") {
          localStorage.setItem("pulse_token", response.token);
        }

        await initializeSession();
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Login failed"));
        setLoading(false);
      }
    },
    [initializeSession],
  );

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("pulse_token");
    }
    setUser(undefined);
    if (isProtectedRoute) {
      router.push("/login");
    }
  }, [isProtectedRoute, router]);

  const getToken = useCallback((): string | null => {
    return getStoredToken();
  }, []);

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      requestOrganizerRole: boolean,
    ): Promise<void> => {
      await ApiClient.instance.post("/auth/register", {
        body: { username, email, password, requestOrganizerRole },
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isOrganizer:
        user?.properties.role === "organizer" ||
        user?.properties.role === "admin",
      isAdmin: user?.properties.role === "admin",
      login,
      logout,
      getToken,
      register,
      reloadSession: initializeSession,
    }),
    [
      user,
      loading,
      error,
      login,
      logout,
      getToken,
      register,
      initializeSession,
    ],
  );

  if (isProtectedRoute && loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <span>Se încarcă...</span>
      </div>
    );
  }

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
