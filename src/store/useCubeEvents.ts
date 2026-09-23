// src/store/useCubeEvents.ts
import { useEffect, useRef } from 'react';
import { useSoundEffects } from '../audio/useSoundEffects';
import { useHaptics } from '../haptics/useHaptics';
import { useCubeStore } from './cubeStore';

export function useCubeEvents() {
    const sfx = useSoundEffects();
    const haptics = useHaptics();

    const active = useCubeStore((s) => s.active);
    const solved = useCubeStore((s) => s.solved);

    // Stable refs so the effect fires once per turn, not on every render.
    // (useSoundEffects/useHaptics return new object identities each render.)
    const sfxRef = useRef(sfx);
    sfxRef.current = sfx;
    const hapticsRef = useRef(haptics);
    hapticsRef.current = haptics;

    const prevActive = useRef(active);
    const prevSolved = useRef(solved);

    useEffect(() => {
        // new turn just started
        if (active && active !== prevActive.current) {
            sfxRef.current.turn();
            hapticsRef.current.turn();
        }
        prevActive.current = active;

        // solved for the first time
        if (solved && !prevSolved.current) {
            sfxRef.current.win();
            hapticsRef.current.success();
        }
        prevSolved.current = solved;
    }, [active, solved]);
}
