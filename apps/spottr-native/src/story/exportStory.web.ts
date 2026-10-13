import { API_URL } from '../config';
import { REMOTE_API_URL } from '../config.shared';
import { storyImageSource } from './imageSource';

export async function prepareStoryImage(uri: string): Promise<string> {
  const response = await fetch(storyImageSource(uri, API_URL, REMOTE_API_URL), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Image unavailable');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size > 15 * 1024 * 1024) throw new Error('Invalid image');
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = Math.round(image.height * 1080 / image.width);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(source); }
}
export async function exportStory(base64: string, active: () => boolean) {
  if (!active()) return;
  const a = document.createElement('a'); a.href = 'data:image/png;base64,' + base64; a.download = 'spottr-story.png';
  document.body.appendChild(a); a.click(); a.remove();
}
