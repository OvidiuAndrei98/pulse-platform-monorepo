import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { AppState, Platform } from "react-native";
import { API_URL } from "../config";
import { REMOTE_API_URL } from "../config.shared";
import { safeVersion } from "../../../pulse-app/src/features/diagnostics/report";
import { createErrorReporter } from "./reporter";

const enabled =
  process.env.EXPO_PUBLIC_DIAGNOSTICS_ENABLED === "true" ||
  (!__DEV__ && process.env.EXPO_PUBLIC_DIAGNOSTICS_ENABLED !== "false");
const key = "spottr-native:diagnostics:v1:" + REMOTE_API_URL;
const reporter = enabled
  ? createErrorReporter({
      storage: {
        read: () => AsyncStorage.getItem(key),
        write: (value) => AsyncStorage.setItem(key, value),
      },
      id: randomUUID,
      metadata: {
        platform:
          Platform.OS === "ios"
            ? "ios"
            : Platform.OS === "android"
              ? "android"
              : "web",
        appVersion: safeVersion(Constants.expoConfig?.version),
        buildVersion: safeVersion(
          Platform.OS === "ios"
            ? Constants.expoConfig?.ios?.buildNumber
            : Platform.OS === "android"
              ? String(Constants.expoConfig?.android?.versionCode ?? "unknown")
              : "unknown",
        ),
        osVersion: safeVersion(String(Platform.Version ?? "unknown")),
      },
      send: async (report) => {
        const abort = new AbortController(),
          timer = setTimeout(() => abort.abort(), 5000);
        try {
          // No bearer token, user ID, cookies, request body, error message or URL.
          const response = await fetch(API_URL + "/diagnostics/errors", {
            method: "POST",
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(report),
            signal: abort.signal,
          });
          const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
          return {
            status: response.status,
            retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0,
          };
        } finally {
          clearTimeout(timer);
        }
      },
    })
  : undefined;
export const captureAppError = (
  error: unknown,
  fatal = false,
  render = false,
) => {
  void reporter?.capture(error, fatal, render);
};
export const diagnosticScreen = (screen: unknown) =>
  reporter?.setScreen(screen);

type ErrorUtils = {
  getGlobalHandler(): (error: Error, fatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, fatal?: boolean) => void): void;
};
let installed = false;
export function installErrorReporting() {
  if (installed || !reporter) return;
  installed = true;
  if (Platform.OS === "web") {
    window.addEventListener("error", (event) =>
      captureAppError(event.error, true),
    );
    window.addEventListener("unhandledrejection", (event) =>
      captureAppError(event.reason),
    );
  } else {
    const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtils })
      .ErrorUtils;
    if (utils) {
      const previous = utils.getGlobalHandler();
      utils.setGlobalHandler((error, fatal) => {
        captureAppError(error, !!fatal);
        previous(error, fatal);
      });
    }
  }
  void reporter.flush();
  AppState.addEventListener("change", (state) => {
    if (state === "active") void reporter.flush();
  });
  setInterval(() => {
    if (AppState.currentState === "active") void reporter.flush();
  }, 30000);
}
installErrorReporting();
