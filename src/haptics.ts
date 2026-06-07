import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const triggerSubtleHaptic = (): void => {
  const feedback = Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  feedback.catch(() => undefined);
};
