// src/three/PyraTurning.tsx
import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';
import * as THREE from 'three';
import { TURN_MS } from '../pyraminx/geometry';
import { PyraSticker, PyraTurn, VERTICES } from '../pyraminx/geometry';
import { PyraMesh } from './PyraMesh';

interface Props {
    stickers: PyraSticker[];
    turn: PyraTurn;
    onComplete: () => void;
    durationMs?: number;
}

export function PyraTurning({ stickers, turn, onComplete, durationMs = TURN_MS }: Props) {
    const ref = useRef<THREE.Group>(null);
    const startRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    const axis = new THREE.Vector3(...VERTICES[turn.vertex]).normalize();
    const angle = (turn.prime ? 1 : -1) * ((2 * Math.PI) / 3);

    useFrame(() => {
        if (!ref.current || doneRef.current) return;
        if (startRef.current === null) startRef.current = performance.now();

        const t = Math.min((performance.now() - startRef.current) / Math.max(1, durationMs), 1);
        const eased = 1 - Math.pow(1 - t, 3);
        ref.current.quaternion.setFromAxisAngle(axis, angle * eased);

        if (t >= 1) {
            doneRef.current = true;
            onComplete();
        }
    });

    return (
        <group ref={ref}>
            {stickers.map((s) => (
                <PyraMesh key={s.id} sticker={s} />
            ))}
        </group>
    );
}
