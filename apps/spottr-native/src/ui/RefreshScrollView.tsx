import type { ScrollViewInstance } from 'react-native';
import React, { forwardRef, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RefreshSpotlight } from "./RefreshSpotlight";
import {useReducedMotionPreference} from "./useReducedMotionPreference";
import { useRefreshFeedback } from "./useRefreshFeedback";
import {
  REFRESH_LOADING_OFFSET,
  REFRESH_PULL_THRESHOLD,
  refreshPullIntent,
  refreshPullOffset,
} from "./refreshGesture";

export type RefreshScrollViewProps = Omit<ScrollViewProps, "refreshControl"> & {
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
};

export const RefreshScrollView = forwardRef<ScrollViewInstance, RefreshScrollViewProps>(
  function RefreshScrollView(
    { refreshing = false, onRefresh, children, ...props },
    ref,
  ) {
    const feedback = useRefreshFeedback(refreshing, onRefresh);
    const insets = useSafeAreaInsets();
    const reduced=useReducedMotionPreference();
    const scrollY = useRef(0);
    const touch = useRef<{ x: number; y: number } | null>(null);
    const [progress, setProgress] = useState(0);
    const androidOffset = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      if (Platform.OS !== "android") return;
      const toValue = feedback.holding
        ? REFRESH_LOADING_OFFSET
        : refreshPullOffset(progress * REFRESH_PULL_THRESHOLD);
      if (touch.current && !feedback.holding) {
        androidOffset.setValue(toValue);
        return;
      }
      const animation = Animated.timing(androidOffset, {
        toValue,
        duration: reduced?0:240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      });
      animation.start();
      return () => animation.stop();
    }, [feedback.holding, progress, androidOffset,reduced]);
    // The OS still owns scrolling, pull recognition and settling. Touch/scroll
    // observations only reveal our light; they never capture or block a gesture.
    return (
      <View style={[{ flex: 1 }, props.style]}>
        <ScrollView
          {...props}
          style={{ flex: 1 }}
          ref={ref}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
            if (!feedback.holding && touch.current && Platform.OS === "ios")
              setProgress(Math.max(0, -scrollY.current / 60));
            props.onScroll?.(event);
          }}
          onTouchStart={(event) => {
            touch.current =
              onRefresh &&
              !feedback.holding &&
              scrollY.current <= 1 &&
              event.nativeEvent.touches.length === 1
                ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
                : null;
            props.onTouchStart?.(event);
          }}
          onTouchMove={(event) => {
            if (touch.current && !feedback.holding) {
              const x = event.nativeEvent.pageX - touch.current.x,
                y = event.nativeEvent.pageY - touch.current.y;
              const intent = refreshPullIntent(x, y);
              if (
                event.nativeEvent.touches.length !== 1 ||
                intent === "scroll" ||
                scrollY.current > 1
              ) {
                touch.current = null;
                setProgress(0);
              } else if (intent === "pull" && Platform.OS !== "ios")
                setProgress(Math.max(0, y / REFRESH_PULL_THRESHOLD));
            }
            props.onTouchMove?.(event);
          }}
          onTouchEnd={(event) => {
            touch.current = null;
            setProgress(0);
            props.onTouchEnd?.(event);
          }}
          onTouchCancel={(event) => {
            touch.current = null;
            setProgress(0);
            props.onTouchCancel?.(event);
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={feedback.holding}
                onRefresh={() => {
                  setProgress(0);
                  feedback.run();
                }}
                tintColor="transparent"
                colors={["transparent"]}
                progressBackgroundColor="transparent"
                progressViewOffset={insets.top}
              />
            ) : undefined
          }
        >
          {Platform.OS === "android" && onRefresh ? (
            <Animated.View
              style={{ transform: [{ translateY: androidOffset }] }}
            >
              {children}
            </Animated.View>
          ) : (
            children
          )}
        </ScrollView>
        {onRefresh && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: insets.top,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <RefreshSpotlight
              progress={feedback.holding ? 1 : progress}
              active={feedback.busy || (!feedback.holding && progress > 0)}
              visible={feedback.busy || (!feedback.holding && progress > 0)}
            />
          </View>
        )}
      </View>
    );
  },
);
