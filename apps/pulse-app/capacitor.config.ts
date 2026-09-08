import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ro.codelab.glow",
  appName: "Glow",
  backgroundColor: "#0b0c0e",
  webDir: "out",
  plugins: {
    // Route WebView fetch/XHR through the native iOS networking stack. This
    // keeps the packaged app independent from WebView CORS quirks.
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: process.env.CAPACITOR_SERVER_URL
    ? {
        url: process.env.CAPACITOR_SERVER_URL,
        androidScheme: "https",
        allowNavigation: ["spottr.ro", "www.spottr.ro", "api.spottr.ro"],
      }
    : undefined,
};

export default config;
