import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Map, UsersRound, UserRound } from "lucide-react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { colors } from "../ui/theme";
import { usePreferences } from "../PreferencesProvider";
import { useTabIndicator, type TabIndicatorMotion } from "./useTabIndicator";
import { ToastHost } from "../ui/ToastHost";

// Keep the Home artwork from the original app's Lucide version. The newer
// native package changed this icon's roof, base and doorway geometry.
function HomeIcon({ size, color, strokeWidth }: { size: number; color: string; strokeWidth: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
    <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Polyline points="9 22 9 12 15 12 15 22" />
  </Svg>;
}
const icons = [HomeIcon, Map, UsersRound, UserRound];
const labels = ["nav.home", "nav.map", "nav.feed", "nav.profile"] as const;
export function TabBar({ state, navigation, activeIndex = state.index, onSelectTab, indicatorMotion }: BottomTabBarProps & { activeIndex?: number; onSelectTab?: (name: string) => void; indicatorMotion?: TabIndicatorMotion }) {
  const { copy } = usePreferences();
  const { width: viewportWidth } = useWindowDimensions();
  const desktopPreview = Platform.OS === "web" && viewportWidth >= 768;
  // Expo's web BlurView adds a gray tint and saturate(180%), and intensity 32
  // becomes only 6.4px of blur. Use the actual Next.js glass on the web preview.
  const webGlass: ViewStyle & { backgroundImage: string; backdropFilter: string; WebkitBackdropFilter: string } = {
    backgroundImage: desktopPreview
      ? "linear-gradient(180deg in oklab, rgba(31,31,31,0.4), rgba(26,26,26,0.52), rgba(18,18,18,0.65))"
      : "linear-gradient(180deg in oklab, rgba(31,31,31,0.48), rgba(26,26,26,0.58), rgba(18,18,18,0.7))",
    backdropFilter: `blur(${desktopPreview ? 40 : 16}px)`,
    WebkitBackdropFilter: `blur(${desktopPreview ? 40 : 16}px)`,
    boxShadow: "0 12px 32px rgba(0,0,0,0.6), inset 0 -8px 16px rgba(0,0,0,0.35)",
    overflow: "visible",
  };
  const [width, setWidth] = useState(0);
  const activatedRoute = useRef<string | null>(null);
  const itemWidth = width ? width / state.routes.length : (indicatorMotion?.itemWidth ?? 0);
  const localPosition = useTabIndicator(activeIndex, itemWidth, !indicatorMotion);
  const position = indicatorMotion?.position ?? localPosition;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }), [position]);
  return (
    <View pointerEvents="box-none" style={s.position}>
      <View
        testID="tab-bar"
        style={[s.bar, Platform.OS === "web" && webGlass]}
      >
        {Platform.OS !== "web" && <>
          <BlurView pointerEvents="none" tint="dark" intensity={32} style={StyleSheet.absoluteFill} />
          <LinearGradient pointerEvents="none" colors={["rgba(31,31,31,0.48)", "rgba(26,26,26,0.58)", "rgba(18,18,18,0.7)"]} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.innerShadow]} />
        </>}
        <View style={s.items} onLayout={(event) => { const nextWidth = event.nativeEvent.layout.width; setWidth(nextWidth); indicatorMotion?.measure(nextWidth / state.routes.length); }}>
        {itemWidth > 0 && (
          <Animated.View
            testID="tab-indicator"
            pointerEvents="none"
            style={[
              s.indicator,
              { width: itemWidth },
              indicatorStyle,
              desktopPreview && ({ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" } as ViewStyle),
            ]}
          />
        )}
        {state.routes.map((route, index) => {
          const Icon = icons[index] || HomeIcon;
          const active = index === activeIndex;
          const activate = () => {
            if (onSelectTab) { onSelectTab(route.name); return; }
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!active && !event.defaultPrevented)
              navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityLabel={copy(labels[index] || "nav.home")}
              aria-selected={active}
              style={s.tab}
              // Native press-in fires again if the finger leaves and re-enters
              // the press rectangle. Touch-start fires once per contact.
              onTouchStart={Platform.OS !== "web" ? activate : undefined}
              onPressIn={Platform.OS === "web" ? () => {
                activatedRoute.current = route.key;
                activate();
              } : undefined}
              onPress={(event) => {
                // RN Web delivers the raw KeyboardEvent for keyboard activation.
                const source = (event.nativeEvent ?? event) as { type?: string; detail?: number; identifier?: string | number };
                if (Platform.OS !== "web") {
                  // Touches were handled at contact start; TalkBack / hardware
                  // clicks have no touch identifier and still need activation.
                  if (source.identifier == null) activate();
                  return;
                }
                const virtualClick = source.type === "click" && source.detail === 0;
                // On web, press-out and click arrive in separate browser tasks.
                // Keep the press-in activation until click so returning to a tab
                // cannot emit a second tabPress and unexpectedly scroll it to top.
                if (virtualClick || activatedRoute.current !== route.key) activate();
                activatedRoute.current = null;
              }}
              onAccessibilityTap={() => {
                activatedRoute.current = null;
                activate();
              }}
              onLongPress={onSelectTab ? undefined : () =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.2 : 1.6}
                color={active ? colors.accent : "#9f9fa9"}
              />
            </Pressable>
          );
        })}
        </View>
      </View>
      <ToastHost placement="navbar" />
    </View>
  );
}
const s = StyleSheet.create({
  position: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    alignItems: "center",
  },
  bar: {
    width: "100%",
    maxWidth: 360,
    height: 66,
    borderRadius: 999,
    overflow: "hidden",
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
  },
  innerShadow: {
    borderRadius: 999,
    boxShadow: "inset 0 -8px 16px rgba(0,0,0,0.35)",
  },
  items: {
    position: "relative",
    height: 48,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,0,68,0.6)",
    backgroundColor: "rgba(255,0,68,0.38)",
    boxShadow: "0 0 12px rgba(225,29,72,0.4)",
  },
});
