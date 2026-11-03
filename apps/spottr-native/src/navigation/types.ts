import type { NavigatorScreenParams } from "@react-navigation/native";
export type ProfileParamList = {
  ProfileHome: undefined;
  Dashboard: RootParamList['Dashboard'];
  Admin: RootParamList['Admin'];
  SavedEvents: undefined;
  Tickets: undefined;
  Orders: undefined;
};
export type FriendsParamList = { FriendsHome: undefined; FriendsManage: undefined };
export type TabsParamList = {
  Home: undefined;
  Explore:
    | { category?: string; focusSearch?: boolean; date?: string }
    | undefined;
  Friends: NavigatorScreenParams<FriendsParamList> | undefined;
  Feed: undefined;
  Profile: NavigatorScreenParams<ProfileParamList> | undefined;
};
export type RootParamList = {
  [nestedEvent: `NestedEvent:${string}`]: { id: string; presentation?: "sheet" | "page" };
  Tabs: NavigatorScreenParams<TabsParamList>;
  Event: { id: string; presentation?: "sheet" | "page" };
  EventDetails: { id: string; presentation?: "sheet" | "page" };
  Search: undefined;
  Notifications: undefined;
  Tickets: undefined;
  Orders: undefined;
  SavedEvents: undefined;
  PublicProfile: { id: string };
  Legal: { document: 'terms' | 'privacy' };
  SafetyGroup: { eventId: string };
  Outings: { new?:boolean; planId?:string; ticketId?:string; plan?:string; ticket?:string; event?:string; tab?:'plans'|'transfers' } | undefined;
  TicketTransfers: {ticketId?:string;ticket?:string} | undefined;
  EventNight: { eventId:string };
  Dashboard: { section?: string; eventId?: string; filter?: string; organizerReturn?: 'connect' | 'promotion'; campaignId?: string; returnStatus?: 'complete' | 'refresh' | 'cancelled' } | undefined;
  Scanner: { eventId?: string } | undefined;
  ScannerHistory: { eventId: string; eventTitle?: string };
  Wardrobe: { staff?: boolean } | undefined;
  Admin: { section?: string; organizerId?: string } | undefined;
  QuickScanner: { token?: string } | undefined;
  Checkout: { eventId: string; ticketTypeId?: string; quantities?: Record<string,number> };
  CheckoutReturn: { eventId: string; sessionId?: string; nativeOrderId?: string; cancelled?: string };
  Auth:
    | {
        mode?: "login" | "register" | "forgot" | "reset";
        token?: string;
        activation?: string;
        returnTab?: "Home" | "Explore" | "Friends" | "Feed" | "Profile";
        returnEvent?: string;
        returnProfile?: string;
        returnSafetyGroup?: string;
        returnOutings?: boolean;
        returnOutingsEvent?: string;
        returnTicketTransfers?: boolean;
        returnEventNight?: string;
        returnDashboard?: boolean;
        returnDashboardParams?: RootParamList['Dashboard'];
        returnScanner?: boolean;
      }
    | undefined;
};
