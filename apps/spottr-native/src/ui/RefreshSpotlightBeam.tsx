import React, { useId } from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { colors } from "./theme";

export type RefreshSpotlightProps = {
  progress: number;
  active: boolean;
  visible: boolean;
};

/** Soft edges and a diffused pool of light; no image or platform-specific asset. */
export function RefreshSpotlightBeam() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg
      width={104}
      height={60}
      viewBox="0 0 104 60"
      fill="none"
      accessible={false}
    >
      <Defs>
        <LinearGradient id={`${id}beam`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.85} />
          <Stop offset="0.45" stopColor={colors.accent} stopOpacity={0.34} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${id}edges`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="white" stopOpacity={0} />
          <Stop offset="0.4" stopColor="white" stopOpacity={0.8} />
          <Stop offset="0.5" stopColor="white" />
          <Stop offset="0.6" stopColor="white" stopOpacity={0.8} />
          <Stop offset="1" stopColor="white" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`${id}soft`}>
          <Rect width="104" height="60" fill={`url(#${id}edges)`} />
        </Mask>
        <RadialGradient id={`${id}glow`}>
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.55} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path
        d="M50 5 L9 55 Q52 63 95 55 L54 5Z"
        fill={`url(#${id}beam)`}
        mask={`url(#${id}soft)`}
      />
      <Ellipse
        cx="52"
        cy="51"
        rx="36"
        ry="7"
        fill={`url(#${id}glow)`}
        opacity={0.38}
      />
      <Ellipse cx="52" cy="5" rx="10" ry="5" fill={`url(#${id}glow)`} />
      <Circle cx="52" cy="5" r="1.5" fill="#ff8bab" />
    </Svg>
  );
}
