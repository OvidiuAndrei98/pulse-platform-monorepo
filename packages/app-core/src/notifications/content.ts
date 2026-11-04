import type { components } from "@packages/api-client/schema";

type Notification = components["schemas"]["NotificationResponse"];
type Copy = (key: string, values?: Record<string, string | number>) => string;

export function notificationText(notification: Notification, t: Copy) {
  if(notification.type==='outing_plan_invite')return {title:t('outings.title'),body:t('outings.hint')};
  if(notification.type==='outing_plan_chosen')return {title:t('outings.chosen'),body:t('outings.chosenNotification')};
  if(notification.type==='outing_plan_reopened')return {title:t('outings.plan.planB'),body:t('outings.plan.compare')};
  if(notification.type==='outing_plan_reminder')return {title:t('outings.plan.deadline'),body:t('outings.plan.intro')};
  if(notification.type==='outing_plan_deadline')return {title:t('outings.plan.closed'),body:t('outings.plan.remaining')};
  if(notification.type==='ticket_transfer')return {title:t('outings.transferTitle'),body:t('outings.from',{name:notification.actorUsername||t('notifications.someone')})};
  if (notification.type === "friend_request" || notification.type === "friend_accepted") {
    const kind = notification.type === "friend_request" ? "friendRequest" : "friendAccepted";
    return { title: t(`notifications.${kind}Title`), body: t(`notifications.${kind}Body`, { name: notification.actorUsername || t("notifications.someone") }) };
  }
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
