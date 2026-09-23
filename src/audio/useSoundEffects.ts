// src/audio/useSoundEffects.ts
import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from '../store/useSettings';

const TURN_SOURCE = require('../../assets/sounds/turn.wav');

/**
 * Why sound was silent:
 * 1. iOS silent switch mutes playback unless playsInSilentMode is set.
 * 2. `let idx = 0` reset on every render, and new closures each render
 *    made useCubeEvents re-fire unstably.
 * 3. seekTo() is async — fire play after it settles.
 */
function usePooledSound(source: any, size: number, enabledRef: React.MutableRefObject<boolean>) {
    // Fixed hook count (max 4) — unrolled so order never changes.
    const p1 = useAudioPlayer(source);
    const p2 = useAudioPlayer(source);
    const p3 = useAudioPlayer(source);
    const p4 = useAudioPlayer(source);
    const poolRef = useRef<AudioPlayer[]>([]);
    if (poolRef.current.length === 0) {
        poolRef.current = [p1, p2, p3, p4].slice(0, size);
    }
    const idxRef = useRef(0);

    return useCallback(() => {
        if (!enabledRef.current) return;
        const pool = poolRef.current;
        const p = pool[idxRef.current % pool.length];
        idxRef.current = (idxRef.current + 1) % pool.length;
        try {
            const r = p.seekTo(0) as unknown as Promise<void> | void;
            if (r && typeof (r as Promise<void>).then === 'function') {
                (r as Promise<void>).then(() => p.play()).catch(() => {
                    try { p.play(); } catch { /* noop */ }
                });
            } else {
                p.play();
            }
        } catch {
            try { p.play(); } catch { /* noop */ }
        }
    }, [enabledRef]);
}

export function useSoundEffects() {
    // Shared toggle so the HomeScreen instance and the useCubeEvents
    // instance stay in sync.
    const enabled = useSettings((s) => s.soundOn);
    const setEnabled = useSettings((s) => s.setSoundOn);
    const enabledRef = useRef(enabled);
    useEffect(() => { enabledRef.current = enabled; }, [enabled]);

    // iOS: allow playback with the silent switch on (speedcube clicks).
    useEffect(() => {
        setAudioModeAsync({ playsInSilentMode: true }).catch(() => { });
    }, []);

    const turn = usePooledSound(TURN_SOURCE, 4, enabledRef);
    const scrambleTick = usePooledSound(TURN_SOURCE, 4, enabledRef);
    const undo = usePooledSound(TURN_SOURCE, 2, enabledRef);
    const reset = usePooledSound(TURN_SOURCE, 1, enabledRef);
    const win = usePooledSound(TURN_SOURCE, 1, enabledRef);
    // Backwards-compatible alias: scramble button plays a tick per turn
    // via turn events; this is for the initial press feedback.
    const scramble = scrambleTick;

    return { turn, scramble, scrambleTick, undo, reset, win, enabled, setEnabled };
}
