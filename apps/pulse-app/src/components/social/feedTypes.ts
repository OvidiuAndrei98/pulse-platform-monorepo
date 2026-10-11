import type { ReadableSchema } from "@packages/api-client/src/Client";

export type SocialFeedItem = ReadableSchema<"SocialFeedItemResponse">;

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
