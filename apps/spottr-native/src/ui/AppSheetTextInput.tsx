import { Platform, TextInput } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

// Gorhom's focus bookkeeping calls TextInput.State.currentlyFocusedInput,
// which RN Web does not expose. Native keeps its keyboard-aware input.
export const AppSheetTextInput = Platform.OS === 'web' ? TextInput : BottomSheetTextInput;
