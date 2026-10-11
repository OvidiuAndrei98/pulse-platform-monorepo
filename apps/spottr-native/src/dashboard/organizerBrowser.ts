import { openAuthSessionAsync, dismissAuthSession } from "expo-web-browser";
import { NATIVE_ORGANIZER_RETURN } from "../../../pulse-app/src/features/checkout/organizerReturn";
import {
  validateOrganizerCallback,
  type OrganizerBrowser,
} from "./organizerFlow";
let active = false;
export const organizerBrowserActive = () => active;
export const organizerClient = "native";
export function prepareOrganizerBrowser(): OrganizerBrowser {
  let opened = false;
  return {
    async open(url, expected) {
      if (active) throw new Error("ORGANIZER_BROWSER_BUSY");
      active = true;
      opened = true;
      try {
        const result = await openAuthSessionAsync(url, NATIVE_ORGANIZER_RETURN);
        if (result.type === "success")
          validateOrganizerCallback(result.url, expected);
        // Dismissal also reconciles: a paid session can be closed before its redirect.
      } finally {
        active = false;
        opened = false;
      }
    },
    dispose() {
      if (opened) {
        try {
          dismissAuthSession();
        } catch {
          /* Android manages its custom tab. */
        }
      }
    },
  };
}
