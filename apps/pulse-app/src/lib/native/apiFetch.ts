import { CapacitorHttp } from "@capacitor/core";
import { isNativePlatform } from "./platform";

/** Avoid the WebView GET proxy when loading a remotely hosted native app. */
export const apiFetch: typeof fetch = async (input, init) => {
  // Keep Fetch cancellation for requests that supply an AbortSignal.
  if (!isNativePlatform() || init?.signal || (init?.method ?? "GET").toUpperCase() !== "GET") {
    return fetch(input, init);
  }
  const request = new Request(input, init);
  const result = await CapacitorHttp.request({
    url: request.url,
    method: "GET",
    headers: Object.fromEntries(request.headers.entries()),
    responseType: "text",
  });
  return new Response(result.status === 204 ? null :
    typeof result.data === "string" ? result.data : JSON.stringify(result.data), {
    status: result.status,
    headers: result.headers,
  });
};
