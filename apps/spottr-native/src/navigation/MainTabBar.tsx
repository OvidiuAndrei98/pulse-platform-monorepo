import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  StackActions,
  type NavigationContainerRefWithCurrent,
  type NavigationState,
} from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { TabBar } from "./TabBar";
import type { RootParamList } from "./types";
import { useTabIndicator, type TabIndicatorMotion } from "./useTabIndicator";

type TabBridge = React.RefObject<BottomTabBarProps | null>;
const Context = createContext<{
  bridge: TabBridge;
  navigation: NavigationContainerRefWithCurrent<RootParamList>;
  tabState: BottomTabBarProps["state"];
  activeIndex: number;
  select: (screen: string) => void;
  motion: TabIndicatorMotion;
} | null>(null);

/** Keep the real tab event emitter, including repeated-tab pop/scroll behavior. */
export function MainTabBarRegistration(props: BottomTabBarProps) {
  const { bridge } = useContext(Context)!;
  useLayoutEffect(() => {
    bridge.current = props;
    return () => {
      if (bridge.current === props) bridge.current = null;
    };
  }, [bridge, props]);
  return <MainTabBar />;
}

const initialTabs: BottomTabBarProps["state"] = {
  stale: false,
  type: "tab",
  key: "main-tabs",
  index: 0,
  routeNames: ["Home", "Explore", "Feed", "Profile"],
  history: [],
  preloadedRouteKeys: [],
  routes: ["Home", "Explore", "Feed", "Profile"].map((name) => ({
    key: "main-" + name,
    name,
  })),
};

function currentLocation(state: NavigationState | undefined) {
  const route = state?.routes[state.index];
  const tabs = route?.name === "Tabs" ? route.state : undefined;
  return `${route?.key}:${tabs?.routes[tabs.index ?? 0]?.key}`;
}

/** Keep animation/navigation state above routes, with each bar inside its screen.
 * Native modals can then cover the bar naturally without unmounting it. */
export function MainTabBarProvider({
  navigation,
  state,
  children,
}: {
  navigation: NavigationContainerRefWithCurrent<RootParamList>;
  state: NavigationState | undefined;
  children: React.ReactNode;
}) {
  const bridge = useRef<BottomTabBarProps | null>(null);
  const { user, ready } = useAuth();
  const [pendingProfile, setPendingProfile] = useState<string | null>(null);
  const focused =
    state?.routes
      .slice(0, state.index + 1)
      .reverse()
      .find((route) => ["Tabs", "Dashboard", "Scanner"].includes(route.name))
      ?.name ?? "Tabs";
  // Dashboard shortcuts may open another Tabs route (e.g. directly to Tickets).
  // Read the closest active instance, never an older Home route below it.
  const tabs = state?.routes
    .slice(0, state.index + 1)
    .reverse()
    .find((route) => route.name === "Tabs")?.state;
  const tabState =
    tabs?.type === "tab" ? (tabs as BottomTabBarProps["state"]) : initialTabs;

  const activeIndex =
    pendingProfile !== null || focused !== "Tabs" ? 3 : tabState.index;
  const [itemWidth, measure] = useState(0);
  const position = useTabIndicator(activeIndex, itemWidth);

  const select = (screen: string) => {
    const root = navigation.getRootState();
    const current = root?.routes[root.index]?.name;
    setPendingProfile(null);
    // The persisted session is verified asynchronously. A first tap must not
    // commit to the consumer profile before the organizer's role is known.
    if (screen === "Profile" && !ready) {
      setPendingProfile(currentLocation(root));
      return;
    }
    if (
      screen === "Profile" &&
      (user?.role === "organizer" || user?.role === "admin")
    ) {
      const target = user.role === "admin" ? "Admin" : "Dashboard";
      if (current === target) return;
      if (root?.routes.some((route) => route.name === target))
        navigation.dispatch(StackActions.popTo(target));
      else navigation.navigate(target);
      return;
    }
    const actualTabs = bridge.current;
    if (current === "Tabs" && actualTabs) {
      const route = actualTabs.state.routes.find(
        (item) => item.name === screen,
      );
      if (!route) return;
      const event = actualTabs.navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (
        !event.defaultPrevented &&
        actualTabs.state.routes[actualTabs.state.index]?.key !== route.key
      ) {
        actualTabs.navigation.navigate(route.name, route.params);
      }
      return;
    }
    const params =
      screen === "Profile"
        ? { screen: "ProfileHome" }
        : screen === "Feed"
          ? { screen: "FeedHome" }
          : undefined;
    navigation.dispatch(StackActions.popTo("Tabs", { screen, params }));
  };

  useEffect(() => {
    if (pendingProfile === null) return;
    // Leaving through another control while the session loads cancels the tap.
    if (currentLocation(navigation.getRootState()) !== pendingProfile) {
      setPendingProfile(null);
    } else if (ready) select("Profile");
  }, [pendingProfile, ready, user?.role, state]);

  return (
    <Context.Provider
      value={{
        bridge,
        navigation,
        tabState,
        activeIndex,
        select,
        motion: { position, itemWidth, measure },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function MainTabBar() {
  const { bridge, navigation, tabState, activeIndex, select, motion } =
    useContext(Context)!;
  const insets = useSafeAreaInsets();
  return (
    <TabBar
      state={tabState}
      navigation={
        bridge.current?.navigation ??
        (navigation as unknown as BottomTabBarProps["navigation"])
      }
      descriptors={bridge.current?.descriptors ?? {}}
      insets={insets}
      activeIndex={activeIndex}
      onSelectTab={select}
      indicatorMotion={motion}
    />
  );
}
