"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";
import { clearSessionCaches, User, UserData } from "./DataProvider";
import { apiRoot } from "./apiRoot";
import { useTranslation } from "react-i18next";
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
  onUnauthorized: () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("spottr:session-expired"));
  },
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
  const generation = useRef(0);
  const currentUser = useRef<User | undefined>(undefined);

  const pathname = usePathname();
  const router = useRouter();

  const isProtectedRoute =
    pathname?.startsWith("/me") ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/ticket-validation") ||
    pathname?.startsWith("/admin");

  const initializeSession = useCallback(async () => {
    const request = ++generation.current;
    const isCurrent = () => request === generation.current;
    setLoading(true);
    setError(null);
    try {
      const token = await hydrateAccessToken();
      if (!isCurrent()) return;
      if (!token) {
        currentUser.current = undefined;
        setUser(undefined);
        return;
      }
      const userData = await ApiClient.instance.get("/users/me");
      if (!isCurrent()) return;
      currentUser.current = new User(userData);
      setUser(currentUser.current);
      await saveOfflineSession(userData).catch(() => undefined);
      if (!isCurrent()) return;
      if (userData.preferredLanguage === "en" || userData.preferredLanguage === "ro") {
        await i18n.changeLanguage(userData.preferredLanguage);
      }
    } catch (err) {
      if (!isCurrent()) return;
      const invalidSession = err instanceof ApiError && [401, 403, 404].includes(err.status);
      const cachedSession = invalidSession ? undefined : await readOfflineSession<UserData>().catch(() => undefined);
      if (!isCurrent()) return;
      const canUseOfflineSession =
        Boolean(cachedSession) &&
        !invalidSession && getAccessTokenSync() &&
        (typeof navigator === "undefined" || !navigator.onLine || isNetworkFailure(err) ||
          (err instanceof ApiError && (err.status >= 500 || err.status === 429)));
      if (canUseOfflineSession && cachedSession) {
        currentUser.current = new User(cachedSession);
        setUser(currentUser.current);
        return;
      }
      setError(
        err instanceof Error
          ? err
          : new Error(t("common.sessionFailed")),
      );
      if (invalidSession) {
        currentUser.current = undefined;
        setUser(undefined);
        await Promise.allSettled([clearAccessToken(), clearOfflineSession()]);
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [i18n]);

  useEffect(() => {
    void initializeSession();
    return () => { generation.current++; };
  }, [initializeSession]);

  useEffect(() => {
    if (!loading && !user && isProtectedRoute) {
      router.push("/login");
    }
  }, [loading, user, isProtectedRoute, router]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const request = ++generation.current;
      setLoading(true);
      setError(null);

      try {
        const response = await ApiClient.instance.post("/auth/login", {
          body: { email, password },
        });

        if (request !== generation.current) return;
        await clearOfflineSession();
        if (request !== generation.current) return;
        await saveAccessToken(response.token);
        if (request !== generation.current) return;
        await initializeSession();
      } catch (err) {
        if (request !== generation.current) return;
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
    generation.current++;
    if (currentUser.current) clearSessionCaches(currentUser.current.properties.id);
    currentUser.current = undefined;
    // Offline admissions remain scoped to their original user until synchronized.
    void Promise.allSettled([clearAccessToken(), clearOfflineSession()]);
    setUser(undefined);
    setLoading(false);
    setError(null);
    if (isProtectedRoute) {
      router.push("/login");
    }
  }, [isProtectedRoute, router]);

  useEffect(() => {
    window.addEventListener("spottr:session-expired", logout);
    return () => window.removeEventListener("spottr:session-expired", logout);
  }, [logout]);

  const getToken = useCallback((): string | null => {
    return getAccessTokenSync();
  }, []);

  const updateSessionUser = useCallback((updatedUser: UserData) => {
    if (!currentUser.current || currentUser.current.properties.id !== updatedUser.id) return;
    currentUser.current = new User(updatedUser);
    setUser(currentUser.current);
    void saveOfflineSession(updatedUser).catch(() => undefined);
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
