// src/cube/reconstruct.ts
// Build renderable Cubie[] from a 54-char solver state string
// (F R U D L B, row-major, letters = home faces).
import * as THREE from 'three';
import { createSolvedCube } from './createCube';
import { cubiesToSolverState, faceGrids, SOLVER_FACE_NORMALS } from './facelets';
import { Cubie } from './types';

const LETTER_TO_POS: Record<string, [number, number, number]> = {
    f: [0, 0, 1], b: [0, 0, -1],
    r: [1, 0, 0], l: [-1, 0, 0],
    u: [0, 1, 0], d: [0, -1, 0],
};

/** Home-face letter of a home cubie's sticker slot (identity orientation). */
function homeLetter(idx: number): string {
    // stickers order: [+X, -X, +Y, -Y, +Z, -Z]
    return ['r', 'l', 'u', 'd', 'f', 'b'][idx];
}

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

/** All 24 cube rotations as quaternions. */
function allOrientations(): THREE.Quaternion[] {
    const out: THREE.Quaternion[] = [];
    const axes: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const perms: number[][] = [
        [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    for (const p of perms) {
        for (const sx of [1, -1]) {
            for (const sy of [1, -1]) {
                for (const sz of [1, -1]) {
                    const bx = new THREE.Vector3(...axes[p[0]]).multiplyScalar(sx);
                    const by = new THREE.Vector3(...axes[p[1]]).multiplyScalar(sy);
                    const bz = new THREE.Vector3(...axes[p[2]]).multiplyScalar(sz);
                    // Right-handed (det +1) only.
                    if (new THREE.Vector3().crossVectors(bx, by).dot(bz) < 0) continue;
                    const m = new THREE.Matrix4().makeBasis(bx, by, bz);
                    out.push(new THREE.Quaternion().setFromRotationMatrix(m));
                }
            }
        }
    }
    return out;
}

/**
 * Rebuild cubies from a solver state string (6·size² letters).
 * Throws on invalid input.
 * Verified by round-trip: cubiesToSolverState(stateToCubies(s)) === s.
 */
export function stateToCubies(state: string, size = 3): Cubie[] {
    const need = 6 * size * size;
    if (state.length !== need || !/^[frudlb]+$/.test(state)) {
        throw new Error(`State must be ${need} letters (f/r/u/d/l/b).`);
    }
    const outer = (size - 1) / 2;
    const grids = faceGrids(size);
    const letters: string[][] = [];
    for (let f = 0; f < 6; f++) letters.push([...state.slice(f * size * size, (f + 1) * size * size)]);

    const normals = SOLVER_FACE_NORMALS.map((n) => new THREE.Vector3(...n));
    const orientations = allOrientations();

    const homeByPos = new Map<string, Cubie>();
    for (const c of createSolvedCube(size)) homeByPos.set(c.position.join(','), c);

    // (face, index) of a grid position.
    const slotEntries: { pos: [number, number, number]; face: number; idx: number }[] = [];
    for (let f = 0; f < 6; f++) {
        grids[f].forEach((g, i) => slotEntries.push({ pos: [g[0], g[1], g[2]], face: f, idx: i }));
    }

    const cubies: Cubie[] = [];
    let id = 0;
    const coords: number[] = [];
    for (let i = 0; i < size; i++) coords.push(-outer + i);
    for (const x of coords) {
        for (const y of coords) {
            for (const z of coords) {
                if (Math.abs(x) < outer - 0.99 && Math.abs(y) < outer - 0.99 && Math.abs(z) < outer - 0.99) continue;
                const pos: [number, number, number] = [x, y, z];
                const entries = slotEntries.filter(
                    (e) => e.pos[0] === x && e.pos[1] === y && e.pos[2] === z
                );

                // Home position from the slot letters (scaled to this size).
                const slotLetters = entries.map((e) => letters[e.face][e.idx]);
                const home: [number, number, number] = [0, 0, 0];
                for (const L of slotLetters) {
                    const d = LETTER_TO_POS[L];
                    home[0] += d[0] * outer; home[1] += d[1] * outer; home[2] += d[2] * outer;
                }
                const homeCubie = homeByPos.get(home.join(','));
                if (!homeCubie) throw new Error(`No piece for ${slotLetters.join('')}.`);

                // Find the orientation showing the right letters on each slot face.
                let placed: Cubie | null = null;
                for (const q of orientations) {
                    const ok = entries.every((e) => {
                        const local = normals[e.face].clone().applyQuaternion(q.clone().invert());
                        const idx = axisToIdx(local);
                        return idx >= 0 && homeLetter(idx) === letters[e.face][e.idx];
                    });
                    if (ok) {
                        placed = {
                            ...homeCubie,
                            id: id++,
                            position: pos,
                            quaternion: [q.x, q.y, q.z, q.w],
                        };
                        break;
                    }
                }
                if (!placed) throw new Error(`Cannot orient piece at ${pos}.`);
                cubies.push(placed);
            }
        }
    }

    // Round-trip proof.
    const back = cubiesToSolverState(cubies, size);
    if (back !== state) throw new Error('Reconstruction round-trip mismatch.');
    return cubies;
}
