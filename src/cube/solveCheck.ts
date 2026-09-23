// src/cube/solveCheck.ts
import * as THREE from 'three';
import { Cubie } from './types';

const FACES: { n: THREE.Vector3; idx: number }[] = [
    { n: new THREE.Vector3(1, 0, 0), idx: 0 }, // +X
    { n: new THREE.Vector3(-1, 0, 0), idx: 1 }, // -X
    { n: new THREE.Vector3(0, 1, 0), idx: 2 }, // +Y
    { n: new THREE.Vector3(0, -1, 0), idx: 3 }, // -Y
    { n: new THREE.Vector3(0, 0, 1), idx: 4 }, // +Z
    { n: new THREE.Vector3(0, 0, -1), idx: 5 }, // -Z
];

function axisToIdx(v: THREE.Vector3): number {
    const x = Math.round(v.x), y = Math.round(v.y), z = Math.round(v.z);
    if (x === 1) return 0;
    if (x === -1) return 1;
    if (y === 1) return 2;
    if (y === -1) return 3;
    if (z === 1) return 4;
    if (z === -1) return 5;
    return -1;
}

export function isSolved(cubies: Cubie[]): boolean {
    if (cubies.length === 0) return true;
    const outer = Math.max(...cubies.flatMap((c) => c.position.map(Math.abs)));
    for (const { n } of FACES) {
        const layer = cubies.filter(c => new THREE.Vector3(...c.position).dot(n) === outer);
        const colors = new Set<string>();
        for (const c of layer) {
            const q = new THREE.Quaternion(...c.quaternion);
            const localDir = n.clone().applyQuaternion(q.invert());
            const idx = axisToIdx(localDir);
            colors.add(c.stickers[idx]);
        }
        if (colors.size !== 1) return false;
    }
    return true;
}