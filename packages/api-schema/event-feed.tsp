import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;
model EventLikeResponse { likeCount: int64; liked: boolean; }
model EventFeedItem {
  id: string; organizerId: string; title: string; category: string; city: string; locationName: string;
  description: string; bannerUrl?: string; startTime: utcDateTime; endTime: utcDateTime;
  priceRon?: float64; externalTickets: boolean; likeCount: int64; liked: boolean;
}
model EventFeedPage { items: EventFeedItem[]; nextPage?: int32; }
@route("/event-feed") interface EventFeedOperations {
  @get list(@query page?: int32): EventFeedPage;
}
@route("/events/{id}/likes") interface EventLikeOperations {
  @get get(@path id:string): EventLikeResponse;
  @put like(@path id:string): EventLikeResponse;
  @delete unlike(@path id:string): EventLikeResponse;
}
