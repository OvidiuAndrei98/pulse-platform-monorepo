import type { SocialFeedItem } from "@/core/DataProvider";

export type FeedGroup = {
  kind: "friends" | "organizer" | "update";
  eventId: string;
  eventTitle: string;
  eventBannerUrl?: string;
  eventStartTime: string;
  occurredAt: string;
  organizerName?: string;
  organizerUpdateId?: string;
  organizerUpdateImageUrl?: string;
  organizerUpdateCaption?: string;
  actors: SocialFeedItem[];
  ticketActors: SocialFeedItem[];
  goingActors: SocialFeedItem[];
};
