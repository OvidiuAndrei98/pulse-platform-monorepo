import { Geolocation } from "@capacitor/geolocation";
import { isNativePlatform } from "@/lib/native/platform";
import type { Coordinates } from "@/features/events/types";

type LocationOptions = {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
};

export async function requestCurrentLocation(
  options: LocationOptions = {},
): Promise<Coordinates> {
  if (isNativePlatform()) {
    let permission = await Geolocation.checkPermissions();
    if (permission.location !== "granted") {
      permission = await Geolocation.requestPermissions({
        permissions: ["location"],
      });
    }
    if (permission.location !== "granted") {
      throw new Error("Location permission was not granted");
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      maximumAge: options.maximumAge ?? 0,
      timeout: options.timeout ?? 20_000,
    });
    return [position.coords.latitude, position.coords.longitude];
  }

  return new Promise<Coordinates>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve([coords.latitude, coords.longitude]),
      reject,
      {
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: options.maximumAge ?? 0,
        timeout: options.timeout ?? 20_000,
      },
    );
  });
}
