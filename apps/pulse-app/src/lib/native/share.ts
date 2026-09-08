import { Share } from "@capacitor/share";
import { isNativePlatform } from "@/lib/native/platform";

const PUBLIC_APP_URL = "https://spottr.ro";

export function publicEventUrl(eventId: string) {
  return `${PUBLIC_APP_URL}/events/${encodeURIComponent(eventId)}`;
}

export async function shareEvent(
  event: { id: string; title: string; description?: string },
) {
  const url = publicEventUrl(event.id);
  const payload = { title: event.title, text: event.description, url };

  if (isNativePlatform()) {
    await Share.share(payload);
    return;
  }

  if (navigator.share) {
    await navigator.share(payload);
    return;
  }

  await navigator.clipboard.writeText(url);
}
