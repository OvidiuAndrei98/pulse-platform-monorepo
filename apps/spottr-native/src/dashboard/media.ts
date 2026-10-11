import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File } from "expo-file-system";
import { accountApi, sessionController } from "../auth/AuthProvider";

export async function uploadDashboardImage(
  kind: "event-banner" | "organizer-update" | "artist-image" = "event-banner",
) {
  const token = sessionController.getToken();
  if (!token) throw new Error("Unauthorized");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error("Invalid image");
  const size =
    asset.fileSize ??
    (Platform.OS === "web" ? asset.file?.size : new File(asset.uri).size);
  if (size && size > 12 * 1024 * 1024) throw new Error("Image too large");
  const image = await ImageManipulator.manipulateAsync(
    asset.uri,
    [
      {
        resize:
          asset.width >= asset.height
            ? { width: Math.min(asset.width, 1600) }
            : { height: Math.min(asset.height, 1600) },
      },
    ],
    { format: ImageManipulator.SaveFormat.WEBP, compress: 0.82 },
  );
  const bytes =
    Platform.OS === "web"
      ? new Uint8Array(await (await fetch(image.uri)).arrayBuffer())
      : await new File(image.uri).bytes();
  if (bytes.length > 2 * 1024 * 1024) throw new Error("Image too large");
  if (sessionController.getToken() !== token)
    throw new Error("Session changed");
  return (
    await accountApi<{ url: string }>(`/dashboard/uploads/${kind === "artist-image" ? "event-banner" : kind}`, {
      method: "POST",
      token,
      binary: Uint8Array.from(bytes).buffer,
      contentType: "image/webp",
    })
  ).url;
}
