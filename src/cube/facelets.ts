// src/cube/facelets.ts
import * as THREE from 'three';
import { COLORS } from './constants';
import { Cubie, FaceName, LayerTurn, faceToLayer } from './types';

const COLOR_TO_LETTER = new Map<string, string>([
    [COLORS.F, 'f'],
    [COLORS.R, 'r'],
    [COLORS.U, 'u'],
    [COLORS.D, 'd'],
    [COLORS.L, 'l'],
    [COLORS.B, 'b'],
]);

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

/** Letter of the solved face a sticker belongs to (centers define faces). */
export function stickerLetter(color: string): string {
    return COLOR_TO_LETTER.get(color) ?? '?';
}

/**
 * The 9 grid positions of each face in solver reading order
 * (top→bottom rows, left→right cols, U up; U read with F edge at
 * bottom, D read with F edge at top).
 * Order: F, R, U, D, L, B.
 */
export function faceGrids(size = 3): [number, number, number][][] {
    const outer = (size - 1) / 2;
    const desc: number[] = [];
    for (let i = 0; i < size; i++) desc.push(outer - i);
    const asc = [...desc].reverse();
    const P = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
    return [
        // F (z=outer): rows y top→bottom, cols x left→right
        desc.flatMap((y) => asc.map((x) => P(x, y, outer))),
        // R (x=outer): rows y top→bottom, cols z front→back
        desc.flatMap((y) => desc.map((z) => P(outer, y, z))),
        // U (y=outer): rows z back→front, cols x left→right
        asc.flatMap((z) => asc.map((x) => P(x, outer, z))),
        // D (y=-outer): rows z front→back, cols x left→right
        desc.flatMap((z) => asc.map((x) => P(x, -outer, z))),
        // L (x=-outer): rows y top→bottom, cols z back→front
        desc.flatMap((y) => asc.map((z) => P(-outer, y, z))),
        // B (z=-outer): rows y top→bottom, cols x right→left
        desc.flatMap((y) => desc.map((x) => P(x, y, -outer))),
    ];
}

/** Face normals in solver order: F, R, U, D, L, B. */
export const SOLVER_FACE_NORMALS: [number, number, number][] = [
    [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, -1, 0], [-1, 0, 0], [0, 0, -1],
];

/**
 * State string (F R U D L B, row-major) for the given cube size.
 * Letters denote solved faces (f = front color, etc.), not raw colors.
 */
export function cubiesToSolverState(cubies: Cubie[], size = 3): string {
    const byPos = new Map<string, Cubie>();
    for (const c of cubies) byPos.set(c.position.join(','), c);
    const normals = SOLVER_FACE_NORMALS.map((n) => new THREE.Vector3(...n));
    let out = '';
    const grids = faceGrids(size);
    for (let f = 0; f < 6; f++) {
        for (const p of grids[f]) {
            const cubie = byPos.get(p.join(','));
            if (!cubie) { out += '?'; continue; }
            const q = new THREE.Quaternion(...cubie.quaternion);
            const localDir = normals[f].clone().applyQuaternion(q.invert());
            const idx = axisToIdx(localDir);
            out += idx < 0 ? '?' : stickerLetter(cubie.stickers[idx]);
        }
    }
    return out;
}

/**
 * Parse solution/scramble notation ("R U' F2 r b' M E2 S") into layer turns.
 * Uppercase = single outer layer. Lowercase = wide turn (outer + middle).
 * M/E/S = middle slices (follow L/D/F directions).
 */
export function parseMoves(notation: string): LayerTurn[] {
    const moves: LayerTurn[] = [];
    const push = (axisIdx: 0 | 1 | 2, layers: number[], prime: boolean, double: boolean) => {
        for (const layer of layers) {
            moves.push({ axisIdx, layer: layer as -1 | 0 | 1, prime });
            if (double) moves.push({ axisIdx, layer: layer as -1 | 0 | 1, prime });
        }
    };
    // Middle-slice base directions (follow L / D / F respectively).
    const middleBase: Record<string, LayerTurn> = {
        M: { axisIdx: 0, layer: 0, prime: true },
        E: { axisIdx: 1, layer: 0, prime: true },
        S: { axisIdx: 2, layer: 0, prime: false },
    };
    for (const tok of notation.trim().split(/\s+/)) {
        if (!tok) continue;
        // rubiks-cube-solver emits "Rprime"; humans write "R'".
        const suffixPrime = tok.includes("'") || tok.toLowerCase().includes('prime');
        const double = tok.includes('2');
        const ch = tok[0];
        const upper = ch.toUpperCase();
        if ('RLUDFB'.includes(upper)) {
            const face = upper as FaceName;
            // faceToLayer encodes "clockwise viewed from outside".
            const t = faceToLayer(face, suffixPrime);
            const layers = ch === upper ? [t.layer] : [t.layer, 0];
            push(t.axisIdx, layers, t.prime, double);
        } else if ('MES'.includes(upper)) {
            const base = middleBase[upper];
            push(base.axisIdx, [0], suffixPrime ? !base.prime : base.prime, double);
        }
    }
    return moves;
}
