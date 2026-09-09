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
import { clearSessionCaches, User, UserData } from "./DataProvider";
import { apiRoot } from "./apiRoot";
import { useTranslation } from "react-i18next";
import {
  clearAllOfflineValidationData,
} from "@/features/tickets/offlineValidationStore";
import { PageLoadingState } from "@/components/ui/loading";
import {
  clearAccessToken,
  clearOfflineSession,
  getAccessTokenSync,
  hydrateAccessToken,
  readOfflineSession,
  saveAccessToken,
  saveOfflineSession,
} from "@/lib/native/sessionStorage";

const isNetworkFailure = (error: unknown) =>
  error instanceof TypeError ||
  (error instanceof Error && /network|fetch|offline/i.test(error.message));

ApiClient.configure({
  apiRoot,
  getAccessToken: getAccessTokenSync,
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
    organizerDetails?: { cui: string; companyName: string },
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

    const token = await hydrateAccessToken();
    if (!token) {
      setUser(undefined);
      setLoading(false);
      return;
    }

    try {
      const userData = await ApiClient.instance.get("/users/me");

      setUser(new User(userData));
      await saveOfflineSession(userData);
      if (userData.preferredLanguage === "en" || userData.preferredLanguage === "ro") {
        await i18n.changeLanguage(userData.preferredLanguage);
      }
    } catch (err) {
      const cachedSession = await readOfflineSession<UserData>();
      const canUseOfflineSession =
        Boolean(cachedSession) &&
        (typeof navigator === "undefined" || !navigator.onLine || isNetworkFailure(err));
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
      await Promise.all([clearAccessToken(), clearOfflineSession()]);
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

        await saveAccessToken(response.token);

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
    if (user) clearSessionCaches(user.properties.id);
    void clearAllOfflineValidationData();
    void Promise.all([clearAccessToken(), clearOfflineSession()]);
    setUser(undefined);
    if (isProtectedRoute) {
      router.push("/login");
    }
  }, [isProtectedRoute, router, user]);

  const getToken = useCallback((): string | null => {
    return getAccessTokenSync();
  }, []);

  const updateSessionUser = useCallback((updatedUser: UserData) => {
    setUser(new User(updatedUser));
    void saveOfflineSession(updatedUser);
  }, []);

  const register = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      requestOrganizerRole: boolean,
      organizerDetails?: { cui: string; companyName: string },
    ): Promise<void> => {
      await ApiClient.instance.post("/auth/register", {
        body: {
          username,
          email,
          password,
          requestOrganizerRole,
          ...(requestOrganizerRole ? organizerDetails : undefined),
        },
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
    throw new Error("DATA_PROVIDER_MISSING");
  }
  return context;
}
