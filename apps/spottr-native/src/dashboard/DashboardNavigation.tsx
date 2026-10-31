import type { ScrollViewInstance } from 'react-native';
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Calendar,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plus,
  QrCode,
  Shirt,
  ReceiptText,
  Ticket,
  User,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { Logo } from "../ui/Logo";
import { dColors as colors } from "./common";

export type DashboardSection =
  | "wardrobe"
  | "overview"
  | "events"
  | "new"
  | "finance"
  | "invoicing"
  | "profile"
  | "purchases"
  | "promotions"
  | "edit"
  | "company"
  | "agreement"
  | "stripe-info";
export const dashboardTabs = [
  ["overview", "dashboard", LayoutDashboard],
  ["scanner", "ticketValidation", QrCode],
  ["wardrobe", "wardrobe", Shirt],
  ["events", "events", Calendar],
  ["promotions", "promotions", Megaphone],
  ["new", "newEvent", Plus],
  ["finance", "finance", WalletCards],
  ["invoicing", "invoicing", ReceiptText],
  ["profile", "profile", User],
  ["purchases", "purchases", Ticket],
  ["logout", "logout", LogOut],
] as const;
type NavProps = {
  section: DashboardSection | "scanner";
  onNavigate(section: string): void;
  validator?: boolean;
};
const activeSection = (section: NavProps["section"]) =>
  section === "edit"
    ? "events"
    : section === "company"
      ? "scanner"
      : section === "agreement" || section === "stripe-info"
        ? "overview"
        : section;

export function DashboardSidebar({ section, onNavigate, validator }: NavProps) {
  const { copy } = usePreferences();
  const ids = validator
    ? ["profile", "scanner"]
    : [
        "overview",
        "profile",
        "scanner",
        "wardrobe",
        "finance",
        "invoicing",
        "purchases",
        "events",
        "promotions",
      ];
  return (
    <View
      testID="dashboard-sidebar"
      style={{
        width: 240,
        borderRightWidth: 1,
        borderColor: "#ffffff1a",
        backgroundColor: "#00000066",
      }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
      >
        <View
          style={{
            paddingTop: 16,
            paddingBottom: 16,
            paddingRight: 16,
            paddingLeft: 8,
            gap: 12,
          }}
        >
          <View style={{ paddingLeft: 8, gap: 4 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Logo size={16} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 2.4,
                  color: colors.accent,
                }}
              >
                SPOTTR
              </Text>
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                letterSpacing: -0.45,
                color: colors.text,
              }}
            >
              {copy(
                validator
                  ? "dashboardNav.ticketValidation"
                  : "dashboardNav.organizer",
              )}
            </Text>
          </View>
          <View>
            {ids.map((id) => {
              const tab = dashboardTabs.find((t) => t[0] === id)!;
              const Icon = tab[2],
                selected = activeSection(section) === id;
              return (
                <Pressable
                  key={id}
                  testID={`dashboard-nav-${id}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => onNavigate(id)}
                  style={{
                    height: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? "#ff004433" : "transparent",
                    backgroundColor: selected ? "#ff004426" : "transparent",
                  }}
                >
                  <Icon
                    size={16}
                    color={selected ? colors.accent : colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: selected ? colors.accent : colors.muted,
                    }}
                  >
                    {copy(`dashboardNav.${tab[1]}`)}
                  </Text>
                </Pressable>
              );
            })}
            {!validator && (
              <Pressable
                testID="dashboard-nav-new"
                accessibilityRole="button"
                onPress={() => onNavigate("new")}
                style={{
                  marginTop: 12,
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ff00444d",
                  backgroundColor: "#ff00441a",
                }}
              >
                <Plus size={16} strokeWidth={2.5} color={colors.accent} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.accent,
                  }}
                >
                  {copy("dashboardNav.newEvent")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          <Pressable
            testID="dashboard-nav-logout"
            accessibilityRole="button"
            onPress={() => onNavigate("logout")}
            style={{
              height: 40,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
            }}
          >
            <LogOut size={16} color={colors.muted} />
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}
            >
              {copy("dashboardNav.logout")}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 10, fontWeight: "500", color: "#9ca89e99" }}>
            © {new Date().getFullYear()} SPOTTR.{" "}
            {copy("dashboardNav.copyright")}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

export function DashboardHeader({ section, onNavigate, validator }: NavProps) {
  const { copy } = usePreferences(),
    { width } = useWindowDimensions();
  const tabs = validator
    ? dashboardTabs.filter((t) => t[0] === "profile" || t[0] === "scanner")
    : dashboardTabs;
  const active = activeSection(section),
    tab = dashboardTabs.find((t) => t[0] === active);
  const crumbs: { id: string; label: string }[] = [
    {
      id: validator ? "profile" : "overview",
      label: validator ? "dashboardNav.profile" : "dashboardNav.dashboard",
    },
  ];
  if (tab && tab[0] !== crumbs[0]!.id)
    crumbs.push({ id: tab[0], label: `dashboardNav.${tab[1]}` });
  if (section === "edit")
    crumbs.push({ id: "edit", label: "dashboardNav.details" });
  if (section === "agreement" || section === "stripe-info")
    crumbs.push({
      id: section,
      label:
        section === "agreement"
          ? "legalDocuments.agreement.title"
          : "stripeConnect.title",
    });
  const scroll = useRef<ScrollViewInstance>(null),
    frames = useRef<Record<string, { x: number; width: number }>>({});
  const [layoutVersion, setLayoutVersion] = useState(0),
    [visible, setVisible] = useState(false);
  const x = useRef(new Animated.Value(0)).current,
    w = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    const frame = frames.current[active];
    if (!frame || width >= 768) return;
    setVisible(true);
    if (first.current) {
      x.setValue(frame.x);
      w.setValue(frame.width);
      first.current = false;
    } else
      Animated.parallel([
        Animated.spring(x, {
          toValue: frame.x,
          stiffness: 400,
          damping: 30,
          mass: 1,
          useNativeDriver: false,
        }),
        Animated.spring(w, {
          toValue: frame.width,
          stiffness: 400,
          damping: 30,
          mass: 1,
          useNativeDriver: false,
        }),
      ]).start();
    scroll.current?.scrollTo({
      x: Math.max(0, frame.x - (width - frame.width) / 2),
      animated: true,
    });
  }, [active, layoutVersion, width, x, w]);
  const pointer = useRef<{
    x: number;
    scroll: number;
    dragged: boolean;
  } | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        pointer.current = null;
      }, 0);
    };
    const cancel = () => {
      pointer.current = null;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      clearTimeout(clearTimer);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  const mouseHandlers =
    Platform.OS === "web"
      ? {
          onPointerDownCapture: (event: any) => {
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            const node =
              scroll.current?.getScrollableNode() as unknown as HTMLElement;
            pointer.current = {
              x: event.clientX,
              scroll: node?.scrollLeft ?? 0,
              dragged: false,
            };
          },
          onPointerMoveCapture: (event: any) => {
            const p = pointer.current;
            if (!p || event.buttons !== 1) return;
            if (Math.abs(event.clientX - p.x) > 6) p.dragged = true;
            if (p.dragged) {
              const node =
                scroll.current?.getScrollableNode() as unknown as HTMLElement;
              if (node) node.scrollLeft = p.scroll - (event.clientX - p.x);
              event.preventDefault();
            }
          },
          onClickCapture: (event: any) => {
            if (pointer.current?.dragged) {
              event.preventDefault();
              event.stopPropagation();
            }
            pointer.current = null;
          },
          onPointerCancel: () => {
            pointer.current = null;
          },
        }
      : {};
  return (
    <View
      testID="dashboard-header"
      style={{
        borderBottomWidth: 1,
        borderColor: "#ffffff1a",
        backgroundColor: colors.bg,
        zIndex: 20,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 1024,
          alignSelf: "center",
          paddingHorizontal: width >= 640 ? 32 : 20,
          paddingTop: 12,
          paddingBottom: 10,
        }}
      >
        <View
          testID="dashboard-breadcrumbs"
          accessibilityLabel={copy("dashboardNav.breadcrumb")}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.id}>
              {i > 0 && <ChevronRight size={14} color="#9ca89e66" />}
              <Pressable
                disabled={i === crumbs.length - 1}
                onPress={() => onNavigate(crumb.id)}
                style={{
                  minWidth: 0,
                  flexShrink: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  backgroundColor:
                    i === crumbs.length - 1 ? "#ffffff0d" : "transparent",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12,
                    lineHeight: 16,
                    fontWeight: i === crumbs.length - 1 ? "600" : "400",
                    color: i === crumbs.length - 1 ? colors.text : colors.muted,
                  }}
                >
                  {copy(crumb.label)}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
        {width < 768 && (
          <View
            {...mouseHandlers}
            testID="dashboard-mobile-tabs"
            style={{ marginTop: 12, marginHorizontal: -16 }}
          >
            <ScrollView
              ref={scroll}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingBottom: 4,
                gap: 6,
              }}
            >
              {visible && (
                <Animated.View
                  testID="dashboard-tab-indicator"
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: 36,
                    width: w,
                    transform: [{ translateX: x }],
                    borderRadius: 12,
                    backgroundColor: colors.accent,
                  }}
                />
              )}
              {tabs.map(([id, label, Icon]) => (
                <Pressable
                  key={id}
                  testID={`dashboard-nav-${id}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active === id }}
                  onLayout={(event) => {
                    const { x: left, width: size } = event.nativeEvent.layout;
                    if (
                      frames.current[id]?.x === left &&
                      frames.current[id]?.width === size
                    )
                      return;
                    frames.current[id] = { x: left, width: size };
                    setLayoutVersion((v) => v + 1);
                  }}
                  onPress={() => {
                    if (!pointer.current?.dragged) onNavigate(id);
                  }}
                  style={{
                    height: 36,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#ffffff1a",
                    backgroundColor:
                      active === id ? "transparent" : "#ffffff0d",
                    paddingHorizontal: 14,
                  }}
                >
                  <Icon
                    size={14}
                    color={active === id ? "#ffffff" : colors.muted}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: active === id ? "#ffffff" : colors.muted,
                    }}
                  >
                    {copy(`dashboardNav.${label}`)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}
