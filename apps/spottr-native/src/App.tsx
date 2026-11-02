import { AppFontsReadyContext, Text } from "./ui/Text";
import { captureAppError, diagnosticScreen } from './diagnostics/runtime';
import React, { useCallback, useEffect, useId, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  DarkTheme,
  useFocusEffect,
  NavigationContainer,
  useNavigationContainerRef,
  ThemeProvider,
  getStateFromPath,
  type LinkingOptions,
  type PathConfig,
  type NavigationState,
} from "@react-navigation/native";
import { createNativeStackNavigator, type NativeStackScreenProps, type NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from "@expo-google-fonts/inter";
import { PreferencesProvider } from "./PreferencesProvider";
import { usePreferences } from './usePreferences';
import {InterfaceProvider} from "./ui/InterfaceProvider";
import { queryClient } from "./data/queries";
import { SceneMainTabBar, MainTabBarProvider, MainTabBarRegistration } from "./navigation/MainTabBar";
import { accountLinkOrigin, accountPagePaths, openAccountPage } from './navigation/accountNavigation';
import { profileStackRouter } from './navigation/profileStackRouter';
import { PersistentTabScenes } from './navigation/PersistentTabScenes';
import type { FeedParamList, ProfileParamList, RootParamList, TabsParamList } from "./navigation/types";
import { DiscoveryScreen } from "./screens/DiscoveryScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { PublicProfileScreen } from "./screens/PublicProfileScreen";
import { EventScreen } from "./screens/EventScreen";
import { FriendsScreen, FriendsManageScreen } from "./screens/FriendsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SavedEventsScreen, TicketsScreen, OrdersScreen } from "./screens/AccountListScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { CheckoutScreen } from "./screens/CheckoutScreen";
import { CheckoutReturnScreen } from "./screens/CheckoutReturnScreen";
import { PaymentRecovery } from './checkout/PaymentRecovery';
import { PushProvider, PushNavigation } from './notifications/PushProvider';
import { TicketCacheSync } from './data/useTickets';
import { isStripeReturnURL } from "./checkout/nativePayment";
import { paymentBrowserActive } from "./checkout/paymentBrowser";
import { NATIVE_CHECKOUT_RETURN } from "@packages/app-core/checkout/nativeReturn";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LegalScreen } from './screens/LegalScreen';
import { SafetyGroupScreen } from './safety/SafetyGroupScreen';
import { OutingsScreen } from './outings/OutingsScreen';
import { EventNightScreen } from './outings/EventNightScreen';
import { DashboardScreen, type DashboardScreenProps } from './dashboard/DashboardScreen';
import { QuickScannerScreen } from './scanner/QuickScannerScreen';
import { AdminScreen } from './admin/AdminScreen';
import { PublicProfileTabBar } from './navigation/PublicProfileTabBar';
import { nativePath } from './navigation/links';
import { WEB_URL } from './config';
import { APP_LINK_PREFIXES } from './config.shared';
import { organizerBrowserActive } from './dashboard/organizerBrowser';
import { NATIVE_ORGANIZER_RETURN } from '@packages/app-core/checkout/organizerReturn';
import { Button, styles } from "./ui/common";
import { FormKeyboardProvider } from "./ui/KeyboardForms";
import { Logo } from "./ui/Logo";
import { colors } from "./ui/theme";
import { ScannerHistoryScreen } from './scanner/ScannerHistoryScreen';
import { WardrobeScreen } from './wardrobe/WardrobeScreen';
import { ToastProvider } from './ui/ToastProvider';

const Root = createNativeStackNavigator<RootParamList>();
const Purchase = createNativeStackNavigator<RootParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();
const Profile = createNativeStackNavigator<ProfileParamList>();
const Feed = createNativeStackNavigator<FeedParamList>();
// Search, Checkout and scan history use UIKit push/pop and its interactive Back gesture.
// Leave fullScreenGestureEnabled unset: iOS chooses its own native behavior
// (edge swipe on older iOS, content swipe on newer iOS). Forcing it on older
// versions would select the library's custom full-screen transition.
const nativeBackOptions = {
  animation: Platform.OS === "ios" ? "default" : "slide_from_right",
  gestureEnabled: true,
  gestureDirection: "horizontal",
  animationMatchesGesture: false,
} satisfies NativeStackNavigationOptions;
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.line,
  },
};
const linking: LinkingOptions<RootParamList> = {
  prefixes: ["spottr-native://", WEB_URL, ...APP_LINK_PREFIXES],
  filter: (url) => !isStripeReturnURL(url) && !url.startsWith('spottr-native://auth/google/callback') && !(paymentBrowserActive() && url.startsWith(NATIVE_CHECKOUT_RETURN)) && !(organizerBrowserActive() && url.startsWith(NATIVE_ORGANIZER_RETURN)),
  getStateFromPath: (path, options) => {
    const state = accountLinkOrigin(getStateFromPath(nativePath(path), options));
    return state ? { ...state, routes: state.routes.map(route => route.name === 'Event' ? { ...route, params: { ...route.params, presentation: 'page' } } : route) } : undefined;
  },
  config: {
    initialRouteName: "Tabs",
    screens: {
      Tabs: {
        screens: {
          Home: "",
          Explore: "events",
          Feed: { screens: { FeedHome: "feed", FriendsManage: "users/me/friends" } },
          Profile: (Platform.OS === 'ios' ? { path: 'users/me', alias: ['profile'] }
            : { initialRouteName: "ProfileHome", screens: { ProfileHome: { path: "users/me", alias: ["profile"] }, ...accountPagePaths } }) as PathConfig<ProfileParamList>,
        },
      },
      Event: "events/:id",
      Search: "search",
      ...(Platform.OS === 'ios' ? accountPagePaths : {}),
      PublicProfile: "users/:id",
      SafetyGroup: 'events/:eventId/group',
      Outings: {path:'outings',parse:{plan:String,ticket:String}},
      EventNight: 'events/:eventId/night',
      Dashboard: 'dashboard/:section?',
      Scanner: 'ticket-validation',
      ScannerHistory: 'ticket-validation/:eventId/history',
      Wardrobe: 'wardrobe',
      QuickScanner: 'scan',
      Legal: 'legal/:document',
      Admin: 'admin',
      Auth: { path: 'login', parse: { mode: value => ['login', 'register', 'forgot', 'reset'].includes(value) ? value : 'login', returnDashboard: value => value === 'true', returnScanner: value => value === 'true' } },
      CheckoutReturn: "checkout/return",
    },
  },
};
function Home() {
  return <HomeScreen />;
}
function Explore() {
  return <DiscoveryScreen />;
}
function ProfileNavigator() {
  if (Platform.OS === 'ios') return <ProfileScreen />;
  return <Profile.Navigator initialRouteName="ProfileHome" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Profile.Screen name="ProfileHome" component={ProfileScreen} />
    <Profile.Screen name="SavedEvents" component={SavedEventsScreen} />
    <Profile.Screen name="Tickets" component={TicketsScreen} />
    <Profile.Screen name="Orders" component={OrdersScreen} />
  </Profile.Navigator>;
}
function FeedNavigator() {
  return <Feed.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Feed.Screen name="FeedHome" component={FriendsScreen} />
    <Feed.Screen name="FriendsManage" component={FriendsManageScreen} />
  </Feed.Navigator>;
}
function MainTabs() {
  const { t } = usePreferences();
  return (
    <PersistentTabScenes>
    <Tabs.Navigator
      // Keep tab state mounted, but let native screens remove hidden pages from
      // the view hierarchy. Leaving every iOS page attached makes its glass and
      // lists compete with the capsule while the destination becomes visible.
      // Pushing Search/Tickets keeps the selected tab attached beneath the stack.
      detachInactiveScreens
      tabBar={(props) => <MainTabBarRegistration {...props} />}
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneStyle: { backgroundColor: colors.bg },
        freezeOnBlur: false,
        lazy: Platform.OS !== 'ios',
      }}
    >
      <Tabs.Screen
        name="Home"
        component={Home}
        options={{ title: t("home") }}
      />
      <Tabs.Screen
        name="Explore"
        component={Explore}
        options={{ title: t("explore") }}
      />
      <Tabs.Screen
        name="Feed"
        component={FeedNavigator}
        options={{ title: "Feed" }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{ title: t("profile") }}
      />
    </Tabs.Navigator>
    </PersistentTabScenes>
  );
}
function SafetyRoute({ route, navigation }: NativeStackScreenProps<RootParamList, 'SafetyGroup'>) {
  return <SafetyGroupScreen eventId={route.params.eventId} onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs', { screen: 'Home' })} onLogin={() => navigation.navigate('Auth', { returnSafetyGroup: route.params.eventId })} bottomBar={<PublicProfileTabBar activeIndex={1}/>} />;
}
function OutingsRoute({route}:NativeStackScreenProps<RootParamList,'Outings'>){return <OutingsScreen key={[route.params?.planId,route.params?.ticketId,route.params?.plan,route.params?.ticket,route.params?.tab].join(':')} planId={route.params?.planId??route.params?.plan} ticketId={route.params?.ticketId??route.params?.ticket} initialTab={route.params?.tab}/>;}
function EventNightRoute({route}:NativeStackScreenProps<RootParamList,'EventNight'>){return <EventNightScreen eventId={route.params.eventId}/>;}
function DashboardRoute({ route, navigation }: NativeStackScreenProps<RootParamList, 'Dashboard'>) {
  const { user, ready } = useAuth();
  const publicDocument = route.params?.section==='agreement'||route.params?.section==='stripe-info';
  useFocusEffect(useCallback(() => { if (ready && !user && !publicDocument) navigation.navigate('Auth', { returnDashboard: true, returnDashboardParams: route.params }); }, [ready, user, navigation, route.params, publicDocument]));
  const section = ['overview','events','new','scanner','wardrobe','finance','invoicing','profile','purchases','promotions','edit','company','agreement','stripe-info'].includes(route.params?.section ?? '') ? route.params!.section as DashboardScreenProps['initialSection'] : undefined;
  if (!user && !publicDocument) return <View style={{ flex: 1, backgroundColor: colors.bg }}/>;
  return <View style={{ flex: 1 }}><DashboardScreen onSignIn={() => navigation.navigate('Auth', {returnDashboard:true,returnDashboardParams:{section:'agreement'}})} key={[section, route.params?.eventId, route.params?.filter, route.params?.organizerReturn, route.params?.campaignId, route.params?.returnStatus].join(':')} initialSection={section} initialEventId={route.params?.eventId} initialEventFilter={route.params?.filter} organizerReturn={route.params?.organizerReturn} campaignId={route.params?.campaignId} returnStatus={route.params?.returnStatus} onClose={() => navigation.popTo('Tabs', { screen: 'Home' })} onScanner={() => navigation.navigate('Scanner')} onTickets={() => openAccountPage(navigation, 'Tickets')} onOrders={() => openAccountPage(navigation, 'Orders')} onProfileSettings={() => navigation.navigate('Tabs', { screen: 'Profile', params: { screen: 'ProfileHome' } })} onPublicProfile={() => { if(user) navigation.navigate('PublicProfile', { id: user.id }); }}/><SceneMainTabBar/></View>;
}
function ScannerDashboardRoute({ route, navigation }: NativeStackScreenProps<RootParamList, 'Scanner'>) {
  const { user, ready } = useAuth();
  useFocusEffect(useCallback(() => { if(ready && !user) navigation.navigate('Auth', {returnScanner:true}); }, [ready,user,navigation]));
  return <View style={{ flex:1 }}><DashboardScreen initialSection="scanner" initialEventId={route.params?.eventId} onClose={() => navigation.popTo('Tabs', {screen:'Home'})} onScanner={() => {}} onTickets={() => openAccountPage(navigation, 'Tickets')} onOrders={() => openAccountPage(navigation, 'Orders')} onProfileSettings={() => navigation.navigate('Tabs', {screen:'Profile',params:{screen:'ProfileHome'}})} onPublicProfile={() => {if(user) navigation.navigate('PublicProfile',{id:user.id});}}/><SceneMainTabBar/></View>;
}
function AdminRoute() {
  return <View testID="admin-profile" style={{ flex: 1 }}><View style={{ flex: 1, paddingBottom: 88 }}><AdminScreen /></View><SceneMainTabBar /></View>;
}
// UIKit cannot push a root card on top of a presented Event modal. Keep the
// purchase stack inside that presentation so an interactive native back swipe
// reveals the actual Event view (including its scroll), not a snapshot or reload.
function EventFlow({ route }: { route: { params: RootParamList['Event'] } }) {
  const nestedEventName: `NestedEvent:${string}` = `NestedEvent:${useId()}`;
  return <ThemeProvider value={{ ...theme, colors: { ...theme.colors, background: 'transparent' } }}><Purchase.Navigator key={route.params.id} initialRouteName="EventDetails" screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
    <Purchase.Screen name="EventDetails" component={EventScreen} initialParams={route.params} options={{ animation: 'none', contentStyle: { backgroundColor: 'transparent' }, gestureEnabled: false }} />
    {/* Keep nested events inside the current UIKit presentation. A unique route
        name per flow avoids Event > Event without changing native transitions. */}
    <Purchase.Screen name={nestedEventName} component={EventFlow} options={({ route: event }) => ({
      presentation: event.params.presentation === 'page' ? 'card' : 'transparentModal',
      animation: event.params.presentation === 'page' ? 'slide_from_right' : 'none',
      contentStyle: { backgroundColor: event.params.presentation === 'page' ? colors.bg : 'transparent' },
      gestureEnabled: event.params.presentation === 'page',
    })} />
    <Purchase.Screen name="PublicProfile" component={PublicProfileScreen} options={{ presentation: Platform.OS === 'web' ? 'transparentModal' : 'card', gestureEnabled: true }} />
    <Purchase.Screen name="SafetyGroup" component={SafetyRoute} options={{ presentation: Platform.OS === 'web' ? 'transparentModal' : 'card' }}/>
    <Purchase.Screen name="Outings" component={OutingsRoute}/>
    <Purchase.Screen name="EventNight" component={EventNightRoute}/>
    <Purchase.Screen name="Legal" component={LegalScreen}/>
    <Purchase.Screen name="Checkout" component={CheckoutScreen} options={{ ...nativeBackOptions, presentation: Platform.OS === 'web' ? 'transparentModal' : 'card' }} />
    <Purchase.Screen name="CheckoutReturn" component={CheckoutReturnScreen} options={{ presentation: Platform.OS === 'web' ? 'transparentModal' : 'card' }} />
    <Purchase.Screen name="Auth" component={AuthScreen} options={{ animation: "fade", gestureEnabled: false, presentation: Platform.OS === 'web' ? 'transparentModal' : 'card' }} />
  </Purchase.Navigator></ThemeProvider>;
}
// Keep the navigation tree stable when its mirrored state updates the navbar.
const MainNavigationScreens = React.memo(function MainNavigationScreens() {
  return (
    <Root.Navigator
      UNSTABLE_router={profileStackRouter}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Root.Screen name="Tabs" component={MainTabs} />
      <Root.Screen
        name="Event"
        component={EventFlow}
        options={({ route }) => ({
          presentation:
            route.params.presentation === "page"
              ? "card"
              : "transparentModal",
          animation:
            route.params.presentation === "page"
              ? "slide_from_right"
              : "none",
          contentStyle: {
            backgroundColor:
              route.params.presentation === "page"
                ? colors.bg
                : "transparent",
          },
          gestureEnabled: route.params.presentation === "page",
        })}
      />
      <Root.Screen
        name="Search"
        component={SearchScreen}
        options={{ ...nativeBackOptions, presentation: "card" }}
      />
      <Root.Screen
        name="Auth"
        component={AuthScreen}
        options={{ animation: "fade", gestureEnabled: false }}
      />
      {Platform.OS === 'ios' && <>
        <Root.Screen name="Tickets" component={TicketsScreen} options={{ ...nativeBackOptions, presentation: 'card' }} />
        <Root.Screen name="Orders" component={OrdersScreen} options={{ ...nativeBackOptions, presentation: 'card' }} />
        <Root.Screen name="SavedEvents" component={SavedEventsScreen} options={{ ...nativeBackOptions, presentation: 'card' }} />
      </>}
      <Root.Screen name="PublicProfile" component={PublicProfileScreen} options={{ animation: 'slide_from_right' }} />
      <Root.Screen name="Legal" component={LegalScreen}/>
      <Root.Screen name="SafetyGroup" component={SafetyRoute}/>
      <Root.Screen name="Outings" component={OutingsRoute}/>
      <Root.Screen name="EventNight" component={EventNightRoute}/>
      <Root.Screen name="Dashboard" component={DashboardRoute} options={{ animation: "none" }}/>
      <Root.Screen name="Scanner" component={ScannerDashboardRoute} options={{ animation: "none" }}/>
      <Root.Screen name="ScannerHistory" component={ScannerHistoryScreen} options={{ ...nativeBackOptions, presentation: "card" }}/>
      <Root.Screen name="Wardrobe" component={WardrobeScreen} options={{ ...nativeBackOptions, presentation: "card" }}/>
      <Root.Screen name="QuickScanner" component={QuickScannerScreen}/>
      <Root.Screen name="Admin" component={AdminRoute} options={{ animation: 'none' }}/>
      <Root.Screen name="CheckoutReturn" component={CheckoutReturnScreen} options={{ presentation: "transparentModal", animation: "fade", gestureEnabled: false }} />
    </Root.Navigator>
  );
});
function Navigator() {
  const navigator = useNavigationContainerRef<RootParamList>();
  const [dashboardWorkspace, setDashboardWorkspace] = useState(false);
  const [rootState, setRootState] = useState<NavigationState>();
  const syncWorkspace = () => { const state=navigator.getRootState(); setRootState(state); diagnosticScreen(navigator.getCurrentRoute()?.name); const name=state?.routes[state.index]?.name; setDashboardWorkspace(name==='Dashboard'||name==='Scanner'||name==='ScannerHistory'); };

  useEffect(() => {
    if (Platform.OS === "web") return;
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);
  return (
    <View style={{ flex:1, width:'100%', alignSelf:'center', maxWidth:Platform.OS==='web'&&!dashboardWorkspace?600:undefined }}><NavigationContainer ref={navigator} onReady={syncWorkspace} onStateChange={syncWorkspace} theme={theme} linking={linking}>
      <MainTabBarProvider navigation={navigator} state={rootState}>
      <MainNavigationScreens />
      <PaymentRecovery navigation={navigator} state={rootState} />
      <PushNavigation navigation={navigator} state={rootState} />
      <TicketCacheSync />
      </MainTabBarProvider>
    </NavigationContainer></View>
  );
}
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    captureAppError(error, true, true);
    console.error("Spottr native screen failed", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 30,
          gap: 26,
          backgroundColor: colors.bg,
        }}
      >
        <Logo size={56} />
        <Text style={styles.subtitle}>Something went wrong.</Text>
        <Button
          title="Try again"
          onPress={() => this.setState({ failed: false })}
        />
      </View>
    );
  }
}
export default function App() {
  const [fontsReady] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });
  return (
    <AppFontsReadyContext.Provider value={fontsReady}>
    <InterfaceProvider><GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <SafeAreaProvider>
          <FormKeyboardProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>
                  <ToastProvider>
                  <PreferencesProvider>
                    <PushProvider>
                    <StatusBar style="light" />
                    <Navigator />
                    </PushProvider>
                  </PreferencesProvider>
                  </ToastProvider>
                </AuthProvider>
              </QueryClientProvider>
            </ErrorBoundary>
          </FormKeyboardProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView></InterfaceProvider>
    </AppFontsReadyContext.Provider>
  );
}
