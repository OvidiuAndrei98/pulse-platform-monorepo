export type ConfirmationResult = "pending" | "unavailable" | "completed" | "failed";

async function withTimeout<T>(request: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("CONFIRMATION_TIMEOUT")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

// A connection error says nothing about whether the payment succeeded.
export async function checkPaymentConfirmation(
  read: () => Promise<{ status: string }>,
  isActive: () => boolean,
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
): Promise<ConfirmationResult | null> {
  let result: ConfirmationResult = "pending";
  for (let attempt = 0; attempt < 4 && isActive(); attempt++) {
    try {
      const response = await withTimeout(read(), 12000);
      if (!isActive()) return null;
      if (response.status === "completed") return "completed";
      if (response.status === "failed" || response.status === "refunded") return "failed";
      result = "pending";
    } catch {
      if (!isActive()) return null;
      result = "unavailable";
    }
    if (attempt < 3) await pause(1500);
  }
  return isActive() ? result : null;
}
