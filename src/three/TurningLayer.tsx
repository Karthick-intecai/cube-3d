// src/three/TurningLayer.tsx
import { useFrame } from '@react-three/fiber/native';
import { useRef } from 'react';
import * as THREE from 'three';
import { TURN_DURATION_MS } from '../cube/constants';
import { Cubie, LayerTurn } from '../cube/types';
import { CubieMesh } from './CubieMesh';

interface Props {
    cubies: Cubie[];
    turn: LayerTurn;
    onComplete: () => void;
    /** Per-turn animation length in ms. Defaults to TURN_DURATION_MS. */
    durationMs?: number;
}

export function TurningLayer({ cubies, turn, onComplete, durationMs = TURN_DURATION_MS }: Props) {
    const ref = useRef<THREE.Group>(null);
    const startRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    const axisVec = new THREE.Vector3(
        turn.axisIdx === 0 ? 1 : 0,
        turn.axisIdx === 1 ? 1 : 0,
        turn.axisIdx === 2 ? 1 : 0
    );
    const angle = (turn.prime ? 1 : -1) * (Math.PI / 2);

    useFrame(() => {
        if (!ref.current || doneRef.current) return;
        if (startRef.current === null) startRef.current = performance.now();

        const t = Math.min((performance.now() - startRef.current) / Math.max(1, durationMs), 1);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        ref.current.quaternion.setFromAxisAngle(axisVec, angle * eased);

        if (t >= 1) {
            doneRef.current = true;
            onComplete();
        }
    });

    return (
        <group ref={ref}>
            {cubies.map((c) => (
                <CubieMesh key={c.id} cubie={c} />
            ))}
        </group>
    );
}
