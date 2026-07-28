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
import { User, UserData } from "./DataProvider";
import { useTranslation } from "react-i18next";
import {
  clearAllOfflineValidationData,
  hasPreparedOfflineValidationForUser,
} from "@/features/tickets/offlineValidationStore";
import { PageLoadingState } from "@/components/ui/loading";

const offlineSessionKey = "pulse_offline_session";

const getStoredToken = (): string | null => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("pulse_token");
  }
  return null;
};

const getOfflineSession = (): UserData | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = localStorage.getItem(offlineSessionKey);
    return stored ? (JSON.parse(stored) as UserData) : undefined;
  } catch {
    return undefined;
  }
};

const storeOfflineSession = (user: UserData) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(offlineSessionKey, JSON.stringify(user));
  }
};

const isNetworkFailure = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error && /network|fetch|offline/i.test(error.message));

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
  updateSessionUser: (updatedUser: UserData) => void;
}

const DataProviderContext = createContext<DataProviderContextProps | undefined>(
  undefined,
);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  const isProtectedRoute =
    pathname?.startsWith("/me") ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/ticket-validation") ||
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

      setUser(new User(userData));
      storeOfflineSession(userData);
      if (userData.preferredLanguage === "en" || userData.preferredLanguage === "ro") {
        await i18n.changeLanguage(userData.preferredLanguage);
      }
    } catch (err) {
      const cachedSession = getOfflineSession();
      const canUseOfflineSession =
        Boolean(cachedSession) &&
        (typeof navigator === "undefined" || !navigator.onLine || isNetworkFailure(err)) &&
        await hasPreparedOfflineValidationForUser(cachedSession!.id);
      if (canUseOfflineSession && cachedSession) {
        setUser(new User(cachedSession));
        return;
      }
      setError(
        err instanceof Error
          ? err
          : new Error(t("common.sessionFailed")),
      );
      setUser(undefined);
      if (typeof window !== "undefined") {
        localStorage.removeItem("pulse_token");
        localStorage.removeItem(offlineSessionKey);
      }
    } finally {
      setLoading(false);
    }
  }, [i18n]);

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
        const loginError =
          err instanceof Error ? err : new Error(t("common.loginFailed"));
        setError(loginError);
        setLoading(false);
        throw loginError;
      }
    },
    [initializeSession, t],
  );

  const logout = useCallback(() => {
    void clearAllOfflineValidationData();
    if (typeof window !== "undefined") {
      localStorage.removeItem("pulse_token");
      localStorage.removeItem(offlineSessionKey);
    }
    setUser(undefined);
    if (isProtectedRoute) {
      router.push("/login");
    }
  }, [isProtectedRoute, router]);

  const getToken = useCallback((): string | null => {
    return getStoredToken();
  }, []);

  const updateSessionUser = useCallback((updatedUser: UserData) => {
    setUser(new User(updatedUser));
    storeOfflineSession(updatedUser);
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
      updateSessionUser,
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
      updateSessionUser,
    ],
  );

  if (isProtectedRoute && loading) {
    return <PageLoadingState label={t("common.loading")} className="min-h-screen" />;
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
