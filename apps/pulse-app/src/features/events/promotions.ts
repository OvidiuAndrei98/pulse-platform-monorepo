import type { Event, PromotedEvent } from "@/core/DataProvider";

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function mixFeedPromotions(
  events: readonly Event[],
  promotions: readonly PromotedEvent[],
  seed: string,
  matches: (event: Event) => boolean = () => true,
  maxPromoted = 2,
) {
  const promoted = promotions
    .filter((campaign) => campaign.placement === "feed" && matches(campaign.event))
    .filter(
      (campaign, index, items) =>
        items.findIndex((item) => item.event.id === campaign.event.id) === index,
    )
    .sort(
      (first, second) =>
        hash(`${seed}:${first.event.id}`) - hash(`${seed}:${second.event.id}`),
    )
    .slice(0, maxPromoted);
  const promotedIds = new Set(promoted.map((campaign) => campaign.event.id));
  const mixed = events.filter((event) => !promotedIds.has(event.id));

  for (const campaign of promoted) {
    const availableEarlyPositions = Math.min(5, mixed.length);
    const position = availableEarlyPositions
      ? 1 + (hash(`${seed}:position:${campaign.event.id}`) % availableEarlyPositions)
      : 0;
    mixed.splice(position, 0, campaign.event);
  }

  return mixed;
}

export function promotionCampaignsByEvent(
  promotions: readonly PromotedEvent[],
) {
  return new Map(promotions.map((campaign) => [campaign.event.id, campaign]));
}
