import type { OrganizerBrowser } from "./organizerFlow";
export const organizerBrowserActive = () => false;
export const organizerClient = "native-preview";
export function prepareOrganizerBrowser(): OrganizerBrowser {
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("ORGANIZER_WINDOW_BLOCKED");
  popup.opener = null;
  popup.document.title = "SPOTTR";
  popup.document.body.style.background = "#000";
  let timer: ReturnType<typeof setInterval> | undefined,
    finish: (() => void) | undefined;
  return {
    open(url) {
      return new Promise<void>((resolve) => {
        finish = resolve;
        popup.location.replace(url);
        timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    },
    dispose() {
      clearInterval(timer);
      if (!popup.closed) popup.close();
      finish?.();
    },
  };
}
