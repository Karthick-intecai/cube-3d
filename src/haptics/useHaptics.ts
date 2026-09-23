// src/haptics/useHaptics.ts
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { useSettings } from '../store/useSettings';

export function useHaptics() {
    // Shared toggle so all hook instances stay in sync.
    const enabled = useSettings((s) => s.hapticsOn);
    const setEnabled = useSettings((s) => s.setHapticsOn);

    const tap = useCallback(() => {
        if (!useSettings.getState().hapticsOn) return;
        Haptics.selectionAsync().catch(() => { });
    }, []);

    const turn = useCallback(() => {
        if (!useSettings.getState().hapticsOn) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    }, []);

    const heavy = useCallback(() => {
        if (!useSettings.getState().hapticsOn) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    }, []);

    const success = useCallback(() => {
        if (!useSettings.getState().hapticsOn) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    }, []);

    const error = useCallback(() => {
        if (!useSettings.getState().hapticsOn) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
    }, []);

    return { enabled, setEnabled, tap, turn, heavy, success, error };
}
