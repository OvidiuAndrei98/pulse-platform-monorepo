import * as Haptics from 'expo-haptics';
import { createHapticFeedback } from './hapticFeedback';

export const haptic = createHapticFeedback({
  selection: () => Haptics.selectionAsync(),
  refresh: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
});
