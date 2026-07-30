import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ro.codelab.glow",
  appName: "Glow",
  // Bootstrap release: the native shell loads the deployed app while we keep
  // the existing Next SSR and intercepting-route architecture intact.
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://pulse-app.code-lab.ro",
    androidScheme: "https",
    allowNavigation: ["pulse-app.code-lab.ro", "pulse-api.code-lab.ro"],
  },
};

export default config;
