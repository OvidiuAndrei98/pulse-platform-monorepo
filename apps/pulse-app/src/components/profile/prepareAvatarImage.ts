export const MAX_AVATAR_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_AVATAR_UPLOAD_BYTES = 1536 * 1024;

const acceptedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type AvatarImageErrorCode =
  | "invalidType"
  | "sourceTooLarge"
  | "decodeFailed"
  | "outputTooLarge";

export class AvatarImageError extends Error {
  constructor(public readonly code: AvatarImageErrorCode) {
    super(code);
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export async function prepareAvatarImage(file: File): Promise<File> {
  if (!acceptedTypes.has(file.type)) throw new AvatarImageError("invalidType");
  if (file.size > MAX_AVATAR_SOURCE_BYTES) throw new AvatarImageError("sourceTooLarge");

  const objectURL = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new AvatarImageError("decodeFailed"));
      image.src = objectURL;
    });

    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 50_000_000) {
      throw new AvatarImageError("decodeFailed");
    }
    if (
      file.type === "image/webp" &&
      file.size <= MAX_AVATAR_UPLOAD_BYTES &&
      Math.max(width, height) <= 1024
    ) {
      return file;
    }

    for (const limit of [1024, 768, 512]) {
      const scale = Math.min(1, limit / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new AvatarImageError("decodeFailed");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      // WebP retains transparent PNGs. Older WebKit versions may fall back to
      // PNG when asked for WebP; in that case use JPEG on a solid background.
      let outputType = "image/webp";
      let blob = await encode(canvas, outputType, 0.82);
      if (blob?.type !== outputType) {
        outputType = "image/jpeg";
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-over";
      }

      for (const quality of [0.82, 0.68, 0.54]) {
        if (outputType !== "image/webp" || quality !== 0.82) {
          blob = await encode(canvas, outputType, quality);
        }
        if (blob?.type === outputType && blob.size <= MAX_AVATAR_UPLOAD_BYTES) {
          return new File([blob], `avatar.${outputType === "image/webp" ? "webp" : "jpg"}`, {
            type: outputType,
          });
        }
      }
    }
    throw new AvatarImageError("outputTooLarge");
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}
