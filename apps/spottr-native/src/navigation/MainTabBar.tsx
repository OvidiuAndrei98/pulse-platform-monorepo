import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import {
  getFocusedRouteNameFromRoute,
  useIsFocused,
  StackActions,
  CommonActions,
  type NavigationContainerRefWithCurrent,
  type NavigationState,
} from "@react-navigation/native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runOnUI, useSharedValue, withSpring } from 'react-native-reanimated';
import { useAuth } from "../auth/AuthProvider";
import { TabBar } from "./TabBar";
import type { RootParamList } from "./types";
import { useTabIndicator, type TabGestureCommand, type TabIndicatorMotion } from "./useTabIndicator";
import { tabCapsuleSpring } from './tabCapsuleSpring';
import { createTabSelectionQueue } from './tabSelectionQueue';
import type { TabIndicatorTimeline } from "./tabIndicatorTimeline";
import { NavbarScrollContext } from './useNavbarScroll';
import { isProfileWorkspace } from './profileStackRouter';

type TabBridge = React.RefObject<BottomTabBarProps | null>;
const Context = createContext<{
  bridge: TabBridge;
  navigation: NavigationContainerRefWithCurrent<RootParamList>;
  tabState: BottomTabBarProps["state"];
  activeIndex: number;
  select: (screen: string, gestureId?: number) => void;
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
  if (Platform.OS === 'ios') return null;
  const route = props.state.routes[props.state.index];
  const profileScreen = route?.name === "Profile"
    ? getFocusedRouteNameFromRoute(route)
    : undefined;
  // These account pages have their own Back control. Keep the tab bridge and
  // shared indicator state alive so returning to Profile restores its navbar.
  if (profileScreen && ["Tickets", "Orders", "SavedEvents"].includes(profileScreen))
    return null;
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

/** One persistent iOS bar stays outside the changing native-stack screens.
 * UIKit presentations cover it; card pages with their own Back control hide it. */
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
      .find((route) => ["Tabs", "Dashboard", "Scanner", "Admin"].includes(route.name))
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
  const top = state?.routes[state.index];
  const accountRoute = tabState.routes[tabState.index];
  const accountScreen = accountRoute?.name === 'Profile' ? getFocusedRouteNameFromRoute(accountRoute) : undefined;
  const accountList = accountScreen && ['Tickets', 'Orders', 'SavedEvents'].includes(accountScreen);
  const showPersistentBar = !!top && (['Tabs', 'Dashboard', 'Scanner', 'Admin', 'CheckoutReturn'].includes(top.name)
    || top.name === 'Event' && (top.params as RootParamList['Event'] | undefined)?.presentation !== 'page');
  const [itemWidth, measure] = useState(0);
  const timeline = useRef<TabIndicatorTimeline | null>(null);
  const gestureCommand = useSharedValue<TabGestureCommand>({ id: 0, index: 0, pending: false, acknowledgedId: 0 });
  const [acknowledged, acknowledge] = useState(0);
  const position = useTabIndicator(activeIndex, itemWidth, true, { command: gestureCommand, acknowledged });
  const interaction = useSharedValue(0);
  const edgeResponse = useSharedValue(0);
  const edgeDirection = useSharedValue(1);
  const compact = useSharedValue(0);
  const touchRevision = useRef(0);
  const onBarTouch = useCallback(() => { touchRevision.current++; }, []);
  const scrollController = useMemo(() => ({ compact, touchRevision, onTouch: onBarTouch }), [compact, onBarTouch]);
  const profileOwner = `${user?.id ?? ''}:${user?.role ?? ''}`;
  const previousOwner = useRef(profileOwner);

  useLayoutEffect(() => {
    if (previousOwner.current === profileOwner) return;
    if (!navigation.isReady()) return;
    previousOwner.current = profileOwner;
    const root = navigation.getRootState() as NavigationState & { preloadedRoutes?: NavigationState['routes'] };
    if (!root?.preloadedRoutes?.some(route => isProfileWorkspace(route.name))) return;
    const next = { ...root, preloadedRoutes: root.preloadedRoutes.filter(route => !isProfileWorkspace(route.name)) };
    navigation.dispatch(CommonActions.reset(next));
  }, [profileOwner, navigation, state?.key]);

  const prepareProfile = useCallback(() => {
    if (!ready || !user) return;
    const target = user.role === 'admin' ? 'Admin' : user.role === 'organizer' ? 'Dashboard' : null;
    if ((!target && Platform.OS === 'ios') || !navigation.isReady()) return;
    if (target) {
      const root = navigation.getRootState() as NavigationState & { preloadedRoutes?: NavigationState['routes'] };
      if (!root.routes.some(route => route.name === target) && !root.preloadedRoutes?.some(route => route.name === target)) navigation.preload(target);
    } else if (Platform.OS !== 'ios') bridge.current?.navigation.preload('Profile');
  }, [ready, profileOwner, navigation]);

  // iOS builds every tab in the initial layout. Prepare a role's root-stack
  // workspace as soon as the session is known, before accepting its first tap.
  useLayoutEffect(() => {
    if (Platform.OS === 'ios' && state) prepareProfile();
  }, [prepareProfile, state]);

  useEffect(() => {
    if (Platform.OS === 'ios') return;
    if (!ready || !user) return;
    // Build the first profile while idle. Subsequent role-profile visits reuse
    // the existing native screen rather than rebuilding its form and lists.
    const idle = requestIdleCallback(() => {
      startTransition(prepareProfile);
    });
    return () => cancelIdleCallback(idle);
  }, [prepareProfile, ready, profileOwner, navigation, state?.key]);

  const selectRoute = (screen: string) => {
    const root = navigation.getRootState();
    const current = root?.routes[root.index]?.name;
    setPendingProfile(null);
    // The persisted session is verified asynchronously. A first tap must not
    // commit to the consumer profile before the organizer's role is known.
    if (screen === "Profile" && !ready) {
      setPendingProfile(currentLocation(root));
      return true;
    }
    if (
      screen === "Profile" &&
      (user?.role === "organizer" || user?.role === "admin")
    ) {
      const target = user.role === "admin" ? "Admin" : "Dashboard";
      if (current === target) return true;
      const existing = root?.routes.find(route => route.name === target);
      const cached = (root as NavigationState & { preloadedRoutes?: NavigationState['routes'] })?.preloadedRoutes?.find(route => route.name === target);
      if (existing) navigation.dispatch(StackActions.popTo(target, existing.params));
      else navigation.dispatch(CommonActions.navigate({ name: target, params: cached?.params }));
      return true;
    }
    const actualTabs = bridge.current;
    if (current === "Tabs" && actualTabs) {
      const route = actualTabs.state.routes.find(
        (item) => item.name === screen,
      );
      if (!route) return false;
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
      return !event.defaultPrevented;
    }
    const params =
      screen === "Profile"
        ? { screen: "ProfileHome" }
        : screen === "Feed"
          ? { screen: "FeedHome" }
          : undefined;
    navigation.dispatch(StackActions.popTo("Tabs", { screen, params }));
    return true;
  };

  const latestSelection = useRef({ selectRoute, activeIndex, itemWidth });
  latestSelection.current = { selectRoute, activeIndex, itemWidth };
  const selectionQueue = useMemo(() => createTabSelectionQueue<{ screen: string; id: number }>(request => {
    const current = latestSelection.current;
    const accepted = current.selectRoute(request.screen);
    acknowledge(request.id);
    const rollbackTarget = current.activeIndex * current.itemWidth;
    if (!accepted) runOnUI(() => {
      if (gestureCommand.value.id !== request.id) return;
      gestureCommand.value = { ...gestureCommand.value, pending: false, acknowledgedId: request.id };
      position.value = withSpring(rollbackTarget, tabCapsuleSpring);
    })();
  }, callback => requestAnimationFrame(callback), id => cancelAnimationFrame(id)), [gestureCommand, position]);
  useEffect(() => () => selectionQueue.clear(), [selectionQueue]);
  useEffect(() => {
    selectionQueue.clear();
    if (Platform.OS === 'ios') runOnUI(() => { gestureCommand.value = { ...gestureCommand.value, pending: false, acknowledgedId: gestureCommand.value.id }; })();
  }, [profileOwner, selectionQueue, gestureCommand]);
  const select = (screen: string, gestureId?: number) => {
    if (Platform.OS === 'ios' && gestureId !== undefined) {
      selectionQueue.select({ screen, id: gestureId });
      return true;
    }
    if (Platform.OS === 'ios') {
      selectionQueue.clear();
      runOnUI(() => { gestureCommand.value = { ...gestureCommand.value, pending: false, acknowledgedId: gestureCommand.value.id }; })();
    }
    return selectRoute(screen);
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
        motion: { position, itemWidth, measure, timeline, interaction, edgeResponse, edgeDirection, gestureCommand },
      }}
    >
      <NavbarScrollContext.Provider value={scrollController}>
        {children}
        {Platform.OS === 'ios' && <View testID="persistent-navbar-host"
          pointerEvents={showPersistentBar && !(top?.name === 'Tabs' && accountList) ? 'box-none' : 'none'}
          accessibilityElementsHidden={!showPersistentBar || !!(top?.name === 'Tabs' && accountList)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: showPersistentBar && !(top?.name === 'Tabs' && accountList) ? 'flex' : 'none' }}>
          <MainTabBar />
        </View>}
      </NavbarScrollContext.Provider>
    </Context.Provider>
  );
}

/** Browser/Android scenes keep their renderer; iOS uses the persistent host. */
export function SceneMainTabBar() {
  return Platform.OS === 'ios' ? null : <MainTabBar />;
}

export function MainTabBar() {
  const { bridge, navigation, tabState, activeIndex, select, motion } =
    useContext(Context)!;
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const measuredWidth = useRef(0);
  useLayoutEffect(() => {
    if (focused && measuredWidth.current > 0) motion.measure(measuredWidth.current);
  }, [focused, motion.measure]);
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
      indicatorMotion={{ ...motion, measure: width => {
        if (width <= 0) return;
        measuredWidth.current = width;
        if (focused) motion.measure(width);
      } }}
    />
  );
}
