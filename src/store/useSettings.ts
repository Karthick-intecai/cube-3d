// src/store/useSettings.ts
import { create } from 'zustand';

interface SettingsState {
    soundOn: boolean;
    hapticsOn: boolean;
    setSoundOn: (v: boolean) => void;
    setHapticsOn: (v: boolean) => void;
}

export const useSettings = create<SettingsState>((set) => ({
    soundOn: true,
    hapticsOn: true,
    setSoundOn: (v) => set({ soundOn: v }),
    setHapticsOn: (v) => set({ hapticsOn: v }),
}));
