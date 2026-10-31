import { AccentPressable } from '../ui/AccentPressable';
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { AppSheetScrollView } from "../ui/AppSheetScrollView";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import { AppSheet } from "../ui/AppSheet";
import { Text } from "../ui/Text";
import { Feedback, Loading } from "../ui/common";
import { usePreferences } from "../usePreferences";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { eventCategories } from "../../../pulse-app/src/core/mappers";
import { queryClient } from "../data/queries";
import { colors } from "../ui/theme";

export function useHiddenCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["hidden-categories", user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const data = await accountApi<unknown>("/users/me/hidden-categories", {
        signal,
      });
      if (data === null) return [] as string[];
      if (!Array.isArray(data) || data.some((item) => typeof item !== "string"))
        throw new Error("Invalid categories");
      return data as string[];
    },
  });
}
export function PreferencesSheet({ onClose }: { onClose: () => void }) {
  const { copy } = usePreferences(),
    { user, controller } = useAuth();
  const query = useHiddenCategories();
  const [selections, setSelections] = useState<Record<string, boolean>>({}),
    [failed, setFailed] = useState(false);
  const changes = useRef(
    new Map<
      string,
      { confirmed: boolean; desired: boolean; saving: boolean }
    >(),
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const toggle = (category: string) => {
    const token = controller.getToken();
    if (!token) return;
    const state = changes.current.get(category) ?? {
      confirmed: query.data?.includes(category) ?? false,
      desired: query.data?.includes(category) ?? false,
      saving: false,
    };
    changes.current.set(category, state);
    state.desired = !state.desired;
    setSelections((old) => ({ ...old, [category]: state.desired }));
    setFailed(false);
    if (state.saving) return;
    state.saving = true;
    void (async () => {
      try {
        while (
          state.confirmed !== state.desired &&
          controller.getToken() === token
        ) {
          const target = state.desired;
          await accountApi(
            "/users/me/hidden-categories" +
              (target ? "" : "/" + encodeURIComponent(category)),
            {
              method: target ? "POST" : "DELETE",
              body: target ? { category } : undefined,
              token,
            },
          );
          state.confirmed = target;
          if (controller.getToken() !== token) return;
          queryClient.setQueryData<string[]>(
            ["hidden-categories", user?.id],
            (old) =>
              target
                ? [...new Set([...(old ?? []), category])]
                : (old ?? []).filter((item) => item !== category),
          );
        }
        if (controller.getToken() === token) {
          void queryClient.invalidateQueries({ queryKey: ["home-events"] });
          void queryClient.invalidateQueries({ queryKey: ["events"] });
        }
      } catch {
        state.desired = state.confirmed;
        if (alive.current && controller.getToken() === token) {
          setSelections((old) => ({ ...old, [category]: state.confirmed }));
          setFailed(true);
        }
      } finally {
        state.saving = false;
      }
    })();
  };
  return (
    <AppSheet
      open
      onClose={onClose}
      height={0.78}
      label={copy("common.close")}
      testID="preferences-sheet"
    >
      <AppSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 28,
          gap: 20,
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: "white",
              letterSpacing: -0.8,
            }}
          >
            {copy("hiddenCategories.title")}
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 12,
              lineHeight: 20,
              marginTop: 8,
            }}
          >
            {copy("hiddenCategories.hint")}
          </Text>
        </View>
        {query.isPending ? (
          <Loading />
        ) : query.isError && !query.data ? (
          <Feedback
            title={copy("feedback.loadFailed")}
            retry={() => void query.refetch()}
          />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {eventCategories.map((category) => {
              const selected =
                selections[category] ?? query.data?.includes(category) ?? false;
              return (
                <AccentPressable fallback={Pressable}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={category}
                  onPress={() => toggle(category)}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 99,
                    backgroundColor: selected ? colors.accent : "#161616",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {selected && <Check color="white" size={14} />}
                  <Text
                    style={{
                      color: selected ? "white" : "#a4aaa5",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {category}
                  </Text>
                </AccentPressable>
              );
            })}
          </View>
        )}
        {failed && <Feedback compact title={copy("feedback.actionFailed")} />}
        <Text style={{ color: "#ffffff73", fontSize: 12 }}>
          {copy("hiddenCategories.savedAutomatically")}
        </Text>
      </AppSheetScrollView>
    </AppSheet>
  );
}
