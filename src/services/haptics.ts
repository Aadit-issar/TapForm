import * as Haptics from 'expo-haptics';

type HapticTask = () => Promise<void>;

function trigger(name: string, task: HapticTask) {
  try {
    void task().then(
      () => {
        if (__DEV__) console.info(`[TapForm haptics] ${name}: trigger resolved`);
      },
      (error: unknown) => {
        if (__DEV__) console.warn(`[TapForm haptics] ${name}: trigger rejected`, error);
      },
    );
  } catch (error) {
    if (__DEV__) console.warn(`[TapForm haptics] ${name}: trigger failed`, error);
  }
}

// Android uses Expo's Vibrator-backed impact/notification effects. The view
// feedback API used by performAndroidHapticsAsync can be suppressed by the
// system's touch-feedback setting, so it is reserved for direct diagnostics.
export function tap() {
  trigger('tap', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function selection(_nextValue?: boolean) {
  trigger('selection', () => Haptics.selectionAsync());
}

export function requestFound() {
  trigger('requestFound', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function success() {
  trigger('success', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function warning() {
  trigger('warning', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function error() {
  trigger('error', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
