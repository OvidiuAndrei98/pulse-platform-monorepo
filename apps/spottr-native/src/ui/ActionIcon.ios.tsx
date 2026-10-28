import React from 'react';
import { requireOptionalNativeModule } from 'expo';
import type { SFSymbol } from 'expo-symbols';
import { ActionIconFallback, type ActionIconProps } from './ActionIconFallback';

const NativeSymbol: typeof import('expo-symbols').SymbolView | null =
  requireOptionalNativeModule('SymbolModule') ? require('expo-symbols').SymbolView : null;
const symbols = { back: 'chevron.left', bell: 'bell', bookmark: 'bookmark', search: 'magnifyingglass',
  share: 'square.and.arrow.up', close: 'xmark' } as const satisfies Record<ActionIconProps['name'], SFSymbol>;

export function ActionIcon(props: ActionIconProps) {
  if (!NativeSymbol) return <ActionIconFallback {...props} />;
  const name = props.name === 'bookmark' && props.filled ? 'bookmark.fill' : symbols[props.name];
  return <NativeSymbol name={name} size={props.size ?? 20} tintColor={props.color ?? 'white'}
    weight="regular" type="monochrome" resizeMode="scaleAspectFit" accessible={false} pointerEvents="none" />;
}
