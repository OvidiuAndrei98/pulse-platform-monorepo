import { CapacitorHttp } from "@capacitor/core";
import { isNativePlatform } from "./platform";

/** Avoid the WebView GET proxy when loading a remotely hosted native app. */
export const apiFetch: typeof fetch = async (input, init) => {
  if (!isNativePlatform()) {
    return fetch(input, init);
  }
  const request = new Request(input, init);
  if (request.method !== "GET") return fetch(input, init);
  const signal = request.signal;
  signal.throwIfAborted();
  // CapacitorHttp cannot stop the native task, but callers must still settle
  // immediately on abort and discard its eventual response.
  const result = await new Promise<Awaited<ReturnType<typeof CapacitorHttp.request>>>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    CapacitorHttp.request({
      url: request.url,
      method: "GET",
      headers: Object.fromEntries(request.headers.entries()),
      responseType: "text",
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
  signal.throwIfAborted();
  return new Response(result.status === 204 ? null :
    typeof result.data === "string" ? result.data : JSON.stringify(result.data), {
    status: result.status,
    headers: result.headers,
  });
};
