import type { NavigatorScreenParams } from "@react-navigation/native";
export type ProfileParamList = {
  ProfileHome: undefined;
  SavedEvents: undefined;
  Tickets: undefined;
  Orders: undefined;
};
export type FeedParamList = { FeedHome: undefined; FriendsManage: undefined };
export type TabsParamList = {
  Home: undefined;
  Explore:
    | { category?: string; focusSearch?: boolean; date?: string }
    | undefined;
  Feed: NavigatorScreenParams<FeedParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileParamList> | undefined;
};
export type RootParamList = {
  Tabs: NavigatorScreenParams<TabsParamList>;
  Event: { id: string; presentation?: "sheet" | "page" };
  EventDetails: { id: string; presentation?: "sheet" | "page" };
  Search: undefined;
  PublicProfile: { id: string };
  Legal: { document: 'terms' | 'privacy' };
  SafetyGroup: { eventId: string };
  Dashboard: { section?: string; eventId?: string; organizerReturn?: 'connect' | 'promotion'; campaignId?: string; returnStatus?: 'complete' | 'refresh' | 'cancelled' } | undefined;
  Scanner: { eventId?: string } | undefined;
  Admin: undefined;
  QuickScanner: { token?: string } | undefined;
  Checkout: { eventId: string; ticketTypeId: string };
  CheckoutReturn: { eventId: string; sessionId?: string; nativeOrderId?: string; cancelled?: string };
  Auth:
    | {
        mode?: "login" | "register" | "forgot" | "reset";
        token?: string;
        activation?: string;
        returnTab?: "Home" | "Explore" | "Feed" | "Profile";
        returnEvent?: string;
        returnProfile?: string;
        returnSafetyGroup?: string;
        returnDashboard?: boolean;
        returnDashboardParams?: RootParamList['Dashboard'];
        returnScanner?: boolean;
      }
    | undefined;
};
