// src/cube/turns.ts
import * as THREE from 'three';
import { Cubie, FaceName, LayerTurn, faceToLayer } from './types';

export function commitLayerTurn(cubies: Cubie[], turn: LayerTurn): Cubie[] {
    const axisVec = new THREE.Vector3(
        turn.axisIdx === 0 ? 1 : 0,
        turn.axisIdx === 1 ? 1 : 0,
        turn.axisIdx === 2 ? 1 : 0
    );
    const angle = (turn.prime ? 1 : -1) * (Math.PI / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);

    const inLayer = new Set(
        cubies.filter((c) => c.position[turn.axisIdx] === turn.layer).map((c) => c.id)
    );

    // Even sizes use half-integer coords — snap to halves, else to integers.
    const halfStep = !Number.isInteger(turn.layer);
    const snap = (v: number) => (halfStep ? Math.round(v * 2) / 2 : Math.round(v));

    return cubies.map((c) => {
        if (!inLayer.has(c.id)) return c;

        const p = new THREE.Vector3(...c.position).applyQuaternion(q);
        const position: Cubie['position'] = [snap(p.x), snap(p.y), snap(p.z)];

        const newQ = q.clone().multiply(new THREE.Quaternion(...c.quaternion));
        const quaternion: Cubie['quaternion'] = [newQ.x, newQ.y, newQ.z, newQ.w];

        return { ...c, position, quaternion };
    });
}

/** Backwards-compatible helper (3x3 outer-layer turns). */
export function commitTurn(cubies: Cubie[], face: FaceName, prime: boolean, size = 3): Cubie[] {
    return commitLayerTurn(cubies, faceToLayer(face, prime, size));
}
