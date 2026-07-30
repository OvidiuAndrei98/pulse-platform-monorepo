import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ro.codelab.glow",
  appName: "Glow",
  backgroundColor: "#0b0c0e",
  webDir: "out",
  server: process.env.CAPACITOR_SERVER_URL
    ? {
        url: process.env.CAPACITOR_SERVER_URL,
        androidScheme: "https",
        allowNavigation: ["pulse-app.code-lab.ro", "pulse-api.code-lab.ro"],
      }
    : undefined,
};

export default config;
