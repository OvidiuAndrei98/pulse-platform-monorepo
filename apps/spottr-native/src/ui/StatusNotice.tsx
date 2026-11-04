import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AlertCircle, RotateCw } from 'lucide-react-native';
import { Text } from './Text';
import { ActionButton } from './ActionButton';
import { colors, tokens } from './theme';

export function StatusNotice({ kind = 'empty', title, detail, onRetry, retryLabel, busy = false, compact = false }: {
  kind?: 'empty' | 'error' | 'loading' | 'success'; title: string; detail?: string;
  onRetry?: () => void; retryLabel?: string; busy?: boolean; compact?: boolean;
}) {
  const error = kind === 'error';
  return <View testID={`status-notice-${kind}`} style={[s.root, error && s.error, compact && s.compact]}
    accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined}
    accessibilityState={{ busy: kind === 'loading' || busy }}>
    {kind === 'loading' ? <ActivityIndicator color={colors.accent} /> : error ?
      <View style={s.errorIcon} pointerEvents="none"><AlertCircle color={colors.accent} size={18} strokeWidth={1.8} /></View> : null}
    <View style={error ? s.message : undefined}>
      <Text style={[s.title, error && s.errorTitle]}>{title}</Text>
      {detail && <Text style={[s.detail, error && s.errorDetail]}>{detail}</Text>}
    </View>
    {onRetry && retryLabel && (error ? <Pressable testID="status-notice-retry" accessibilityRole="button"
      accessibilityLabel={retryLabel} accessibilityState={{ disabled: busy, busy }} disabled={busy}
      onPress={onRetry} style={({ pressed }) => [s.retry, pressed && !busy && s.retryPressed, busy && s.retryBusy]}>
      {busy ? <ActivityIndicator size="small" color={colors.text} /> : <RotateCw size={17} color={colors.text} strokeWidth={1.8} />}
    </Pressable> : <ActionButton tone="secondary" title={retryLabel} onPress={onRetry} busy={busy} />)}
  </View>;
}

const s = StyleSheet.create({
  root: { padding: tokens.spacing.xl, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing.md, minWidth: 0 },
  compact: { padding: tokens.spacing.md, gap: tokens.spacing.sm },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center', color: colors.text },
  detail: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: colors.muted, maxWidth: 560 },
  error: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', alignSelf: 'stretch',
    padding: 14, gap: 12, borderRadius: 20, borderCurve: 'continuous', backgroundColor: colors.surface, marginVertical: 8 },
  errorIcon: { width: 32, height: 32, borderRadius: 16, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.accent}14` },
  message: { flex: 1, minWidth: 0, gap: 3 },
  errorTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'left' },
  errorDetail: { fontSize: 12, lineHeight: 18, textAlign: 'left' },
  retry: { width: 44, height: 44, borderRadius: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  retryPressed: { backgroundColor: '#ffffff1f' },
  retryBusy: { opacity: 0.55 },
});
