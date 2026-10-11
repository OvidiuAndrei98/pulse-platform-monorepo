import type { FeedGroup, SocialFeedItem } from "./feedTypes";

export function groupFeedItems(items: readonly SocialFeedItem[]): FeedGroup[] {
  const canonicalFriends = new Map<string, SocialFeedItem>();
  const organizerItems: SocialFeedItem[] = [];

  const updateItems: SocialFeedItem[] = [];

  for (const item of items) {
    if (item.activityType === "organizer_event") {
      organizerItems.push(item);
      continue;
    }
    if (item.activityType === "organizer_update") {
      updateItems.push(item);
      continue;
    }

    const key = `${item.actorId}:${item.eventId}`;
    const current = canonicalFriends.get(key);
    if (
      !current ||
      (item.activityType === "friend_ticket" &&
        current.activityType !== "friend_ticket") ||
      (item.activityType === current.activityType &&
        new Date(item.occurredAt).getTime() >
          new Date(current.occurredAt).getTime())
    ) {
      canonicalFriends.set(key, item);
    }
  }

  const groups = new Map<string, FeedGroup>();
  for (const item of canonicalFriends.values()) {
    const key = `friends:${item.eventId}`;
    const current = groups.get(key) ?? createGroup("friends", item);
    current.actors.push(item);
    if (item.activityType === "friend_ticket") current.ticketActors.push(item);
    else current.goingActors.push(item);
    if (
      new Date(item.occurredAt).getTime() >
      new Date(current.occurredAt).getTime()
    ) {
      current.occurredAt = item.occurredAt;
    }
    groups.set(key, current);
  }

  for (const item of organizerItems) {
    const key = `organizer:${item.actorId}:${item.eventId}`;
    const group = createGroup("organizer", item);
    group.actors.push(item);
    groups.set(key, group);
  }

  for (const item of updateItems) {
    const key = `update:${item.organizerUpdateId}`;
    const group = createGroup("update", item);
    group.actors.push(item);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      actors: group.actors.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
}

function createGroup(kind: FeedGroup["kind"], item: SocialFeedItem): FeedGroup {
  return {
    kind,
    eventId: item.eventId,
    eventTitle: item.eventTitle,
    eventBannerUrl: item.eventBannerUrl,
    eventStartTime: item.eventStartTime,
    occurredAt: item.occurredAt,
    organizerName: item.organizerName,
    organizerUpdateId: item.organizerUpdateId,
    organizerUpdateImageUrl: item.organizerUpdateImageUrl,
    organizerUpdateCaption: item.organizerUpdateCaption,
    actors: [],
    ticketActors: [],
    goingActors: [],
  };
}
