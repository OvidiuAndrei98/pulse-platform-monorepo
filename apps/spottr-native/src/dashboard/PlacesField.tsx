import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, View, type TextStyle } from "react-native";
import { MapPin } from "lucide-react-native";
import { randomUUID } from "expo-crypto";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { s, dColors } from "./common";
import { e } from "./EditorControls";
import { createPlacesApi, createPlaceSearch, type PlaceSearchState, type Venue } from "./places";

const initial: PlaceSearchState = { query: "", predictions: [], loading: false, selecting: false, error: false, searched: false };
export function PlacesField({ value, onChange, onSelect, disabled = false, error }: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: Venue) => void;
  disabled?: boolean;
  error?: string;
}) {
  const { copy, language } = usePreferences(), { user } = useAuth();
  const [state, setState] = useState(initial);
  const [focused, setFocused] = useState(false);
  const selected = useRef(onSelect); selected.current = onSelect;
  const search = useRef<ReturnType<typeof createPlaceSearch> | null>(null);
  useEffect(() => {
    setState(initial);
    if (!disabled) search.current = createPlaceSearch({ api: createPlacesApi(accountApi), nonce: randomUUID, language,
      onState: setState, onSelect: place => { Keyboard.dismiss(); selected.current(place); } });
    return () => { search.current?.dispose(); search.current = null; };
  }, [disabled, language, user?.id]);
  const active = state.loading || state.selecting;
  return <View style={{ gap: 7 }}>
    <Text style={s.label}>{copy("eventForm.venue")}</Text>
    <View style={[e.input, s.row, { gap: 8 }, focused && { borderColor: "#ff004499" }, (error || state.error) && { borderColor: colors.danger }, disabled && { opacity: 0.5 }]}>
      <MapPin size={16} color={colors.accent} />
      <TextInput variant="bare" testID="event-venue-input" accessibilityLabel={copy("eventForm.venue")} editable={!disabled}
        value={value} maxLength={120} autoCorrect={false} placeholder={copy("common.locationSearchPlaceholder")}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholderTextColor={dColors.muted} style={[e.text, { flex: 1, padding: 0, minHeight: 20, borderWidth: 0, backgroundColor: "transparent", ...Platform.select({ web: { outlineWidth: 0, outlineStyle: "none" } as unknown as TextStyle, default: {} }) }]}
        onChangeText={value => { onChange(value); search.current?.change(value); }} />
      {active && <ActivityIndicator size="small" color={colors.accent} accessibilityLabel={copy("common.loading")} />}
    </View>
    {state.predictions.length > 0 && <View testID="event-venue-results" style={{ backgroundColor: "#111111", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
      {state.predictions.map(prediction => <Pressable key={prediction.placeId} testID={`event-venue-${prediction.placeId}`} accessibilityRole="button"
        disabled={state.selecting} onPress={() => void search.current?.select(prediction)}
        style={({ pressed }) => ({ padding: 14, gap: 5, opacity: state.selecting ? 0.5 : 1, backgroundColor: pressed ? "#ffffff0d" : "transparent" })}>
        <Text style={s.text}>{prediction.name}</Text>
        <Text style={[s.muted, { fontSize: 12 }]}>{prediction.description}</Text>
      </Pressable>)}
      <Text accessibilityLabel="Google Maps" style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, alignSelf: "flex-end", color: "#ffffff", fontSize: 12, fontWeight: "400" }}>Google Maps</Text>
    </View>}
    {!active && state.searched && !state.error && !state.predictions.length && <Text accessibilityLiveRegion="polite" style={s.muted}>
      {language === "ro" ? "Nu am găsit locații. Încearcă un alt nume." : "No locations found. Try another name."}
    </Text>}
    {state.error && <View style={{ gap: 8 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12 }}>{copy("feedback.loadFailed")}</Text>
      <Pressable accessibilityRole="button" onPress={() => search.current?.retry()}><Text style={{ color: colors.accent }}>{copy("common.retry")}</Text></Pressable>
    </View>}
    {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>}
  </View>;
}
