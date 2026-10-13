import React, { useMemo } from 'react';
import { Image } from 'react-native-svg';
import type { StoryTextProps } from './StoryText';

/** SVG-to-image export cannot inherit Expo's document font faces. Embed text
 * drawn with the already-loaded Inter font, at the full 1080px export scale. */
export function StoryText({ x, y, size, color = '#ffffff', weight = 'medium', spacing = 0, anchor = 'start', width, children }: StoryTextProps) {
  const text = useMemo(() => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const family = weight === 'black' ? 'Inter_900Black' : weight === 'bold' ? 'Inter_700Bold' : 'Inter_500Medium';
    const font = `${size}px "${family}", Arial, sans-serif`;
    ctx.font = font; ctx.letterSpacing = `${spacing}px`;
    const metrics = ctx.measureText(children), pad = Math.ceil(size * 0.2);
    const baseline = Math.ceil(size * 1.2) + pad;
    canvas.width = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight) + Math.max(0, metrics.actualBoundingBoxLeft) + pad * 2);
    canvas.height = baseline + Math.ceil(size * 0.4) + pad;
    ctx.font = font; ctx.letterSpacing = `${spacing}px`; ctx.fillStyle = color;
    ctx.fillText(children, pad, baseline);
    return { uri: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, baseline, pad, advance: metrics.width };
  }, [children, size, color, weight, spacing]);
  if (!text) return null;
  const scale = width && text.advance > 0 ? width / text.advance : 1;
  const offset = anchor === 'end' ? text.advance : anchor === 'middle' ? text.advance / 2 : 0;
  return <Image href={{ uri: text.uri }} x={x - (text.pad + offset) * scale} y={y - text.baseline}
    width={text.width * scale} height={text.height} preserveAspectRatio="none" accessibilityLabel={children} />;
}
