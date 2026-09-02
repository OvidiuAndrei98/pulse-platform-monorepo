import { Geolocation } from "@capacitor/geolocation";
import type { PermissionStatus } from "@capacitor/geolocation";
import { isNativePlatform } from "@/lib/native/platform";
import type { Coordinates } from "@/features/events/types";

type LocationOptions = {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
};

let nativePermissionRequest: Promise<PermissionStatus> | null = null;

async function requestNativeLocationPermission() {
  const current = await Geolocation.checkPermissions();
  if (current.location === "granted" || current.location === "denied") {
    return current;
  }

  if (!nativePermissionRequest) {
    nativePermissionRequest = Geolocation.requestPermissions({
      permissions: ["location"],
    }).finally(() => {
      nativePermissionRequest = null;
    });
  }
  return nativePermissionRequest;
}

export async function requestCurrentLocation(
  options: LocationOptions = {},
): Promise<Coordinates> {
  if (isNativePlatform()) {
    const permission = await requestNativeLocationPermission();
    if (permission.location !== "granted") {
      throw new Error("LOCATION_PERMISSION_DENIED");
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
      reject(new Error("GEOLOCATION_UNSUPPORTED"));
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
