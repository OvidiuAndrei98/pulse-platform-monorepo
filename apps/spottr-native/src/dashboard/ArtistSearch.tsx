import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Music2, Search } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@packages/api-client/src/schema";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading } from "../ui/common";
import { Field, s, dColors } from "./common";
import { e } from "./EditorControls";
type Artist = components["schemas"]["ArtistInput"];
export function ArtistSearch({ onAdd }: { onAdd: (artist: Artist) => void }) {
  const { copy } = usePreferences(),
    [text, setText] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ["dashboard-spotify", query],
    enabled: query.length >= 2,
    queryFn: ({ signal }) =>
      accountApi<
        Array<{
          id: string;
          name: string;
          imageUrl?: string;
          spotifyUrl?: string;
        }>
      >(`/spotify/search?q=${encodeURIComponent(query)}`, { signal }),
  });
  return (
    <View style={{ gap: 10, zIndex: 30 }}>
      <Field
        hideLabel
        testID="editor-artist-search"
        label={copy("lineup.searchArtist")}
        placeholder={copy("lineup.searchArtist")}
        inputStyle={[e.input, { paddingLeft: 44 }]}
        value={text}
        onChange={(v) => setText(v.slice(0, 120))}
      />
      <Search
        pointerEvents="none"
        size={16}
        color={dColors.muted}
        style={{ position: "absolute", top: 15, left: 16 }}
      />
      {query.length >= 2 && query === text.trim() && (results.isPending || results.isError || !!results.data?.length) && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{
            position: "absolute",
            top: "100%",
            marginTop: 8,
            left: 0,
            right: 0,
            maxHeight: 240,
            zIndex: 30,
            backgroundColor: "#09090b",
            borderWidth: 1,
            borderColor: "#ffffff1a",
            borderRadius: 12,
            boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          }}
          contentContainerStyle={{ padding: 6 }}
        >
          {results.isPending ? (
            <Loading />
          ) : results.isError ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() => void results.refetch()}
            />
          ) : (
            results.data?.map((artist) => (
              <Pressable
                key={artist.id}
                accessibilityRole="button"
                onPress={() => {
                  onAdd({
                    name: artist.name,
                    imageUrl: artist.imageUrl,
                    spotifyUrl: artist.spotifyUrl,
                    source: "SPOTIFY",
                    isHeadliner: false,
                  });
                  setText("");
                  setQuery("");
                }}
                style={[
                  s.row,
                  {
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                  },
                ]}
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
                      backgroundColor: "#ff00441a",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Music2 size={16} color="#ff0044" />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[e.text, { fontWeight: "500" }]}>
                    {artist.name}
                  </Text>
                  <Text style={e.small}>{copy("lineup.spotifyArtist")}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
