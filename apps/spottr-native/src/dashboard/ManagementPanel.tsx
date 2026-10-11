import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { dColors as colors } from "./common";
import { p } from "./managementUi";

/** Counterpart of the original dashboard ManagementDrawer: full-height right panel. */
export function ManagementPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
}: React.PropsWithChildren<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
}>) {
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    { copy } = usePreferences();
  const panelWidth = width < 640 ? width : Math.min(480, width * 0.92),
    x = useRef(new Animated.Value(1)).current,
    [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    const animation = Animated.spring(x, {
      toValue: open ? 0 : 1,
      stiffness: 360,
      damping: 36,
      mass: 1,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, x]);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open, onClose]);
  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <Animated.View
            style={{
              position: "absolute",
              inset: 0,
              opacity: x.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            }}
          >
            {Platform.OS !== "web" && (
              <BlurView
                intensity={20}
                tint="dark"
                pointerEvents="none"
                style={{ position: "absolute", inset: 0 }}
              />
            )}
            <Pressable
              accessibilityLabel={copy("common.close")}
              onPress={onClose}
              style={[
                { flex: 1, backgroundColor: "#000000b3" },
                Platform.OS === "web" &&
                  ({ backdropFilter: "blur(4px)" } as ViewStyle),
              ]}
            />
          </Animated.View>
          <Animated.View
            testID="management-drawer"
            accessibilityViewIsModal
            style={{
              width: panelWidth,
              height: "100%",
              position: "absolute",
              right: 0,
              backgroundColor: "#0b0d0c",
              borderLeftWidth: 1,
              borderLeftColor: "#ffffff1a",
              boxShadow: "-24px 0px 70px rgba(0,0,0,0.5)",
              transform: [
                {
                  translateX: x.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, panelWidth],
                  }),
                },
              ],
            }}
          >
            <View
              style={[
                p.row,
                {
                  alignItems: "flex-start",
                  paddingHorizontal: width >= 640 ? 24 : 20,
                  paddingTop: Math.max(width >= 640 ? 24 : 20, insets.top),
                  paddingBottom: 16,
                  gap: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#ffffff1a",
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={p.sectionTitle}>{title}</Text>
                {subtitle && <Text style={p.tiny}>{subtitle}</Text>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy("common.close")}
                onPress={onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff0d",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                padding: width >= 640 ? 24 : 20,
                paddingBottom: Math.max(32, insets.bottom),
                gap: 20,
              }}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
