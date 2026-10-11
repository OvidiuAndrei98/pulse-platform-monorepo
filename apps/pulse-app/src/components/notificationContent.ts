import type { components } from "@packages/api-client/src/schema";

type Notification = components["schemas"]["NotificationResponse"];
type Copy = (key: string, values?: Record<string, string | number>) => string;

export function notificationText(notification: Notification, t: Copy) {
  if (notification.type === "organizer_event") {
    return {
      title: t("notifications.organizerEventTitle"),
      body: t("notifications.organizerEventBody", { name: notification.actorUsername || "SPOTTR" }),
    };
  }
  if (notification.type === "ticket_purchased") {
    return { title: t("notifications.ticketPurchasedTitle"), body: t("notifications.ticketPurchasedBody") };
  }
  return { title: notification.title, body: notification.body };
}

// The host provides its locale-aware formatter; this shared module has no React
// or browser i18n dependency and can run unchanged in the native application.
export function formatNotificationTime(value: string, t: Copy, formatDate: (value: string) => string, now = Date.now()) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return t("notifications.now");
  if (minutes < 60) return t("notifications.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hours", { count: hours });
  return formatDate(value);
}
