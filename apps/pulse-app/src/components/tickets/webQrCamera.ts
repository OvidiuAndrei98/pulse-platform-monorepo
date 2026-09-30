// Own the MediaStream lifecycle separately from QR decoding. In particular,
// getUserMedia can finish after a modal closes: stop that late stream before
// attaching it to a video element or invoking any scan callback.
export async function startWebQrCamera(
  video: HTMLVideoElement,
  signal: AbortSignal,
  onScan: (value: string) => void,
) {
  const { default: jsQR } = await import("jsqr");
  if (signal.aborted) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    stream.getTracks().forEach(track => track.stop());
    if (video.srcObject === stream) {
      video.pause();
      video.srcObject = null;
    }
    signal.removeEventListener("abort", stop);
  };
  if (signal.aborted) { stop(); return; }
  signal.addEventListener("abort", stop, { once: true });
  try {
    video.srcObject = stream;
    await video.play();
    if (signal.aborted) { stop(); return; }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("CAMERA_CANVAS_UNAVAILABLE");
    const scan = () => {
      if (signal.aborted) return;
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        // Decode the same central square shown in the viewfinder, with a
        // bounded working resolution and rate to avoid blocking mobile UI.
        const side = Math.min(video.videoWidth, video.videoHeight);
        const size = Math.min(side, 640);
        canvas.width = size;
        canvas.height = size;
        context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size);
        const code = jsQR(pixels.data, size, size, { inversionAttempts: "dontInvert" });
        if (code && !signal.aborted) onScan(code.data);
      }
      if (!signal.aborted) timer = setTimeout(scan, 150);
    };
    timer = setTimeout(scan, 0);
  } catch (error) {
    stop();
    if (!signal.aborted) throw error;
  }
}
