import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File } from "expo-file-system";
import { accountApi } from "../auth/AuthProvider";
import type { SessionController } from "../auth/session";

// Shared by the public profile and organizer dashboard, including upload limits.
export async function uploadProfileAvatar(controller: SessionController) {
  const token = controller.getToken();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled) return;
  const asset = result.assets[0];
  if (!asset) throw new Error("profile.imageProcessingFailed");
  const sourceBytes =
    asset.fileSize ??
    (Platform.OS === "web" ? asset.file?.size : new File(asset.uri).size);
  if (sourceBytes && sourceBytes > 12 * 1024 * 1024)
    throw new Error("profile.imageTooLarge");
  const image = await ImageManipulator.manipulateAsync(
    asset.uri,
    [
      {
        resize:
          asset.width >= asset.height
            ? { width: Math.min(asset.width, 512) }
            : { height: Math.min(asset.height, 512) },
      },
    ],
    { format: ImageManipulator.SaveFormat.WEBP, compress: 0.82 },
  );
  const bytes =
    Platform.OS === "web"
      ? new Uint8Array(await (await fetch(image.uri)).arrayBuffer())
      : await new File(image.uri).bytes();
  if (bytes.byteLength > 1536 * 1024)
    throw new Error("profile.imageOptimizedTooLarge");
  if (controller.getToken() !== token) return;
  await accountApi("/users/me/avatar", {
    method: "POST",
    token,
    binary: Uint8Array.from(bytes).buffer,
    contentType: "image/webp",
  });
  if (controller.getToken() === token) await controller.refresh();
}
