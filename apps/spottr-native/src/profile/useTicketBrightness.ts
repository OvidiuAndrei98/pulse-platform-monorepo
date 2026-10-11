import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Brightness from "expo-brightness";
import { BrightnessManager } from "./brightness";
const manager = new BrightnessManager({
  get: Brightness.getBrightnessAsync,
  set: Brightness.setBrightnessAsync,
});
export function useTicketBrightness() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    const update = async (foreground: boolean) => {
      try {
        await manager.setForeground(foreground);
        if (mounted) setActive(foreground);
      } catch {
        if (mounted) setActive(false);
      }
    };
    void manager
      .setForeground(AppState.currentState === "active")
      .catch(() => {});
    void manager
      .acquire()
      .then(() => {
        if (mounted) setActive(AppState.currentState === "active");
      })
      .catch(() => {});
    const listener = AppState.addEventListener(
      "change",
      (state) => void update(state === "active"),
    );
    return () => {
      mounted = false;
      listener.remove();
      void manager.release().catch(() => {});
    };
  }, []);
  return active;
}
