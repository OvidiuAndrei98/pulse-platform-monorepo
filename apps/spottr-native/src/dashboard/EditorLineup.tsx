import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Camera,
  Check,
  ChevronDown,
  Link2,
  PenLine,
  Search,
  Star,
  Trash2,
} from "lucide-react-native";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { EventImage } from "../ui/common";
import { colors } from "../ui/theme";
import { EditorTimeField as TimeField } from "./DateTimeField";

import { Field, dColors, useAction } from "./common";
import { EditorChoice, EditorGrid, EditorHeading, e } from "./EditorControls";
import { ArtistSearch } from "./ArtistSearch";
import { uploadDashboardImage } from "./media";
import { updateLineupTime, type EditorErrors } from "./editorModel";
import type { EventDraft } from "./data";

type Artist = NonNullable<EventDraft["lineup"]>[number];
const empty = (): Artist => ({
  name: "",
  imageUrl: "",
  stage: "",
  performanceTime: "",
  spotifyUrl: "",
  source: "MANUAL",
  isHeadliner: false,
});

export function EditorLineup({
  value,
  onChange,
  disabled,
  showHeading = true,
  errors,
  onBusy,
}: {
  value: Artist[];
  onChange: (artists: Artist[]) => void;
  disabled: boolean;
  showHeading?: boolean;
  errors: EditorErrors;
  onBusy: (busy: boolean) => void;
}) {
  const { copy } = usePreferences();
  return (
    <View style={{ gap: showHeading ? 24 : 0 }}>
      {showHeading && (
        <EditorHeading
          title={copy("lineup.manageTitle")}
          hint={copy("lineup.manageHint")}
        />
      )}
      <View>
        {value.map((artist, i) => (
          <View
            testID={`editor-artist-${i}`}
            key={artist.id || i}
            style={{
              paddingVertical: 20,
              borderBottomWidth: 1,
              borderBottomColor: "#ffffff1a",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            {artist.imageUrl ? (
              <EventImage
                uri={artist.imageUrl}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "#ff004440",
                  backgroundColor: "#ff00441a",
                }}
              />
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Text numberOfLines={1} style={[e.text, { fontWeight: "600" }]}>
                {artist.name}
              </Text>
              {errors[`lineup.${i}`] && (
                <Text style={e.error}>{copy(errors[`lineup.${i}`]!)}</Text>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Field
                  hideLabel
                  label={copy("lineup.stage")}
                  placeholder={copy("lineup.stage")}
                  value={artist.stage ?? ""}
                  disabled={disabled}
                  maxLength={120}
                  onChange={(stage) =>
                    onChange(
                      value.map((a, j) => (j === i ? { ...a, stage } : a)),
                    )
                  }
                  style={{ width: 112 }}
                  inputStyle={{
                    height: 32,
                    minHeight: 32,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    fontSize: 12,
                    borderRadius: 6,
                  }}
                />
                <TimeField
                  compact
                  value={artist.performanceTime ?? ""}
                  disabled={disabled}
                  onChange={(v) => onChange(updateLineupTime(value, i, v))}
                />
                <EditorChoice
                  checkbox
                  compact
                  label={copy("lineup.headliner")}
                  selected={!!artist.isHeadliner}
                  disabled={disabled}
                  onPress={() =>
                    onChange(
                      value.map((a, j) =>
                        j === i ? { ...a, isHeadliner: !a.isHeadliner } : a,
                      ),
                    )
                  }
                  style={{
                    minHeight: 32,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    backgroundColor: "transparent",
                    borderColor: "#ffffff1a",
                  }}
                />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy("lineup.removeArtist", {
                name: artist.name,
              })}
              disabled={disabled}
              onPress={() => onChange(value.filter((_, j) => j !== i))}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={16} color={dColors.muted} />
            </Pressable>
          </View>
        ))}
      </View>
      {!disabled && (
        <View
          style={
            value.length
              ? {
                  marginTop: 20,
                  paddingTop: 24,
                  borderTopWidth: 1,
                  borderTopColor: "#ffffff1a",
                }
              : undefined
          }
        >
          <ArtistEntry
            onAdd={(artist) => onChange([...value, artist])}
            onBusy={onBusy}
          />
        </View>
      )}
    </View>
  );
}

function ArtistEntry({
  onAdd,
  onBusy,
}: {
  onAdd: (artist: Artist) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { copy } = usePreferences(),
    wide = useWindowDimensions().width >= 640,
    upload = useAction();
  const [mode, setMode] = useState<"spotify" | "manual">("spotify"),
    [artist, setArtist] = useState(empty),
    [links, setLinks] = useState(false);
  const reset = () => {
    setArtist(empty());
    setLinks(false);
    upload.clear();
  };
  const patch = (value: Partial<Artist>) =>
    setArtist((current) => ({ ...current, ...value }));
  const pick = async () => {
    onBusy(true);
    try {
      await upload.run(
        () => uploadDashboardImage("artist-image"),
        undefined,
        (url) => {
          if (url) patch({ imageUrl: url });
        },
      );
    } finally {
      onBusy(false);
    }
  };
  return (
    <View style={{ gap: 24 }}>
      <View
        accessibilityLabel={copy("lineup.entryMethod")}
        style={{
          flexDirection: "row",
          padding: 4,
          gap: 4,
          borderRadius: 99,
          backgroundColor: "#ffffff0a",
          alignSelf: "flex-start",
          maxWidth: "100%",
        }}
      >
        {(["spotify", "manual"] as const).map((item) => (
          <Pressable
            testID={`editor-artist-mode-${item}`}
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === item }}
            disabled={upload.busy}
            onPress={() => {
              if (mode !== item) {
                setMode(item);
                reset();
              }
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minHeight: 40,
              paddingHorizontal: 16,
              borderRadius: 99,
              backgroundColor: mode === item ? "#ffffff1a" : "transparent",
            }}
          >
            {item === "spotify" ? (
              <Search size={16} color={dColors.muted} />
            ) : (
              <PenLine size={16} color={dColors.muted} />
            )}
            <Text
              style={{
                fontSize: wide ? 14 : 12,
                color: mode === item ? dColors.text : dColors.muted,
                fontWeight: "500",
              }}
            >
              {copy(
                item === "spotify"
                  ? "lineup.searchSpotify"
                  : "lineup.manualEntry",
              )}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === "spotify" && !artist.name && <ArtistSearch onAdd={setArtist} />}
      {(mode === "manual" || !!artist.name) && (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: wide ? 20 : 16,
            }}
          >
            <Pressable
              testID="editor-artist-photo"
              accessibilityRole="button"
              accessibilityLabel={copy(
                artist.imageUrl ? "media.replaceImage" : "lineup.uploadImage",
              )}
              disabled={upload.busy}
              onPress={() => void pick()}
              style={{
                width: wide ? 96 : 80,
                height: wide ? 96 : 80,
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: "#ffffff33",
                backgroundColor: "#ffffff06",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {artist.imageUrl ? (
                <EventImage
                  uri={artist.imageUrl}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Camera size={20} color={dColors.muted} />
                  <Text style={e.small}>{copy("lineup.photo")}</Text>
                </View>
              )}
              {upload.busy && (
                <ActivityIndicator
                  style={{ position: "absolute" }}
                  color={colors.accent}
                />
              )}
            </Pressable>
            <Field
              testID="editor-artist-name"
              label={copy("lineup.artistName")}
              placeholder={copy("lineup.artistNamePlaceholder")}
              value={artist.name}
              onChange={(name) => patch({ name })}
              disabled={upload.busy}
              maxLength={120}
              style={{ flex: 1, minWidth: 0 }}
              inputStyle={e.input}
            />
          </View>
          {upload.feedback}
          <EditorGrid>
            <Field
              label={copy("lineup.stage")}
              placeholder={copy("lineup.stagePlaceholder")}
              value={artist.stage ?? ""}
              onChange={(stage) => patch({ stage })}
              disabled={upload.busy}
              maxLength={120}
              inputStyle={e.input}
            />
            <View style={{ gap: 8 }}>
              <Text style={e.text}>{copy("lineup.time")}</Text>
              <TimeField
                value={artist.performanceTime ?? ""}
                onChange={(performanceTime) => patch({ performanceTime })}
                disabled={upload.busy}
              />
            </View>
          </EditorGrid>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 4,
            }}
          >
            <Star
              size={20}
              color={artist.isHeadliner ? colors.accent : dColors.muted}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.text}>{copy("lineup.headliner")}</Text>
              <Text style={e.small}>{copy("lineup.headlinerHint")}</Text>
            </View>
            <Switch
              accessibilityLabel={copy("lineup.headliner")}
              value={!!artist.isHeadliner}
              disabled={upload.busy}
              onValueChange={(isHeadliner) => patch({ isHeadliner })}
              trackColor={{ false: "#ffffff26", true: colors.accent }}
              thumbColor="white"
            />
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: "#ffffff1a",
              paddingTop: 16,
              gap: 16,
            }}
          >
            <Pressable
              testID="editor-artist-links"
              accessibilityRole="button"
              accessibilityState={{ expanded: links }}
              disabled={upload.busy}
              onPress={() => setLinks(!links)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 4,
              }}
            >
              <Link2 size={16} color={dColors.muted} />
              <Text style={[e.text, { flex: 1, color: dColors.muted }]}>
                {copy("lineup.optionalLinks")}
              </Text>
              <ChevronDown
                size={16}
                color={dColors.muted}
                style={{ transform: [{ rotate: links ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            {links && (
              <EditorGrid>
                <Field
                  label={copy("lineup.imageUrl")}
                  value={artist.imageUrl ?? ""}
                  onChange={(imageUrl) => patch({ imageUrl })}
                  placeholder="https://..."
                  disabled={upload.busy}
                  inputStyle={e.input}
                />
                {mode === "manual" && (
                  <Field
                    label={copy("lineup.spotifyProfile")}
                    value={artist.spotifyUrl ?? ""}
                    onChange={(spotifyUrl) => patch({ spotifyUrl })}
                    placeholder="https://open.spotify.com/..."
                    disabled={upload.busy}
                    inputStyle={e.input}
                  />
                )}
              </EditorGrid>
            )}
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}
          >
            <Pressable
              accessibilityRole="button"
              disabled={upload.busy}
              onPress={reset}
              style={[e.ghost, { height: 40 }]}
            >
              <Text style={[e.text, { color: dColors.muted }]}>
                {copy("lineup.cancel")}
              </Text>
            </Pressable>
            <Pressable
              testID="editor-artist-add"
              accessibilityRole="button"
              disabled={!artist.name.trim() || upload.busy}
              onPress={() => {
                onAdd({ ...artist, name: artist.name.trim() });
                reset();
              }}
              style={[
                e.accentSmall,
                { opacity: !artist.name.trim() || upload.busy ? 0.4 : 1 },
              ]}
            >
              <Check size={16} color={colors.accent} />
              <Text
                style={[e.text, { color: colors.accent, fontWeight: "600" }]}
              >
                {copy("lineup.addToLineup")}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
