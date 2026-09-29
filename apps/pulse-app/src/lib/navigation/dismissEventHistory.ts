import { externalHistoryState, LAYER } from "./state";

// Dismissing the whole event is different from Back within checkout. Consume
// its nested surfaces together, without briefly returning to the event entry.
export function dismissEventHistory() {
  const layers: string[] = history.state?.[LAYER] ?? [];
  window.dispatchEvent(new Event("spottr:layer-navigation"));
  if (history.state?.__spottrEvent) {
    history.go(-(layers.length + 1));
    return;
  }

  const removeEvent = () => {
    const url = new URL(location.href);
    url.searchParams.delete("eventId");
    history.replaceState(externalHistoryState({ __spottrEvent: false, [LAYER]: undefined }), "", url);
  };
  if (layers.length) {
    // A direct event link has no preceding event entry. Unwind only checkout,
    // then remove its query before the provider's popstate listener restores it.
    window.addEventListener("popstate", removeEvent, { once: true, capture: true });
    history.go(-layers.length);
  } else removeEvent();
}
