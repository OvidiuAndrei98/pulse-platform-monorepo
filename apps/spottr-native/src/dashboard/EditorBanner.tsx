import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { ImagePlus, Trash2 } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { EventImage } from "../ui/common";
import { colors } from "../ui/theme";
import { useAction } from "./common";
import { uploadDashboardImage } from "./media";
import { e } from "./EditorControls";

export function EditorBanner({
  value,
  onChange,
  disabled,
  onBusy,
  error,
}: {
  value?: string;
  onChange: (url: string) => void;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  error?: string;
}) {
  const { copy } = usePreferences(),
    upload = useAction();
  const pick = async () => {
    onBusy(true);
    try {
      await upload.run(
        () => uploadDashboardImage(),
        undefined,
        (url) => {
          if (url) onChange(url);
        },
      );
    } finally {
      onBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={[e.text, { fontWeight: "500" }]}>
        {copy("eventForm.image")}
      </Text>
      <View
        style={{
          overflow: "hidden",
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: "#ffffff26",
          backgroundColor: "#ffffff05",
        }}
      >
        {value ? (
          <View style={{ aspectRatio: 16 / 7 }}>
            <EventImage uri={value} style={{ width: "100%", height: "100%" }} />
            <LinearGradient
              colors={["transparent", "#000000b3"]}
              style={{ position: "absolute", inset: 0 }}
            />
            <View
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                disabled={disabled || upload.busy}
                onPress={() => void pick()}
                style={{
                  height: 36,
                  justifyContent: "center",
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#ffffff33",
                  backgroundColor: "#00000099",
                  paddingHorizontal: 12,
                }}
              >
                <Text style={[e.small, { color: "white", fontWeight: "600" }]}>
                  {copy("media.replaceImage")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy("media.deleteImage")}
                disabled={disabled || upload.busy}
                onPress={() => onChange("")}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#ffffff33",
                  backgroundColor: "#00000099",
                }}
              >
                <Trash2 size={16} color="white" />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            testID="editor-banner-upload"
            accessibilityRole="button"
            disabled={disabled || upload.busy}
            onPress={() => void pick()}
            style={{
              minHeight: 144,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 24,
              paddingHorizontal: 16,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {upload.busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <ImagePlus size={24} color={colors.accent} />
            )}
            <Text style={[e.text, { fontWeight: "600" }]}>
              {copy(
                upload.busy ? "media.uploadingImage" : "media.addEventImage",
              )}
            </Text>
            <Text style={e.small}>{copy("media.supportedImages")}</Text>
          </Pressable>
        )}
      </View>
      {upload.feedback}
      {error && <Text style={e.error}>{error}</Text>}
    </View>
  );
}
