// src/cube/twoByTwo.ts
// Helpers for physical 2x2 cubes.
// Strategy: a 2x2 is the corners of a 3x3. Embed the 8 corners into a
// 3x3 state (edges/centers solved, parity fixed), solve with the 3x3
// Fridrich solver, then map the moves back (middle-slice moves don't
// touch corners, wide turns act as face turns).
import { LayerTurn } from './types';
import { stickerLetter } from './facelets';
import { FaceKey } from './validate';

export type Face2 = Record<FaceKey, string[]>; // 4 hex stickers per face

// 2x2 grid index → corner slot, in reading order (same convention as 3x3).
// idx: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right.
type Slot = { label: string; cells: [FaceKey, number][] };
const CORNER_SLOTS_2: Slot[] = [
    { label: 'top-front-right corner (U/F/R)', cells: [['U', 3], ['F', 1], ['R', 0]] },
    { label: 'top-front-left corner (U/F/L)', cells: [['U', 2], ['F', 0], ['L', 1]] },
    { label: 'top-back-right corner (U/B/R)', cells: [['U', 1], ['B', 0], ['R', 1]] },
    { label: 'top-back-left corner (U/B/L)', cells: [['U', 0], ['B', 1], ['L', 0]] },
    { label: 'bottom-front-right corner (D/F/R)', cells: [['D', 1], ['F', 3], ['R', 2]] },
    { label: 'bottom-front-left corner (D/F/L)', cells: [['D', 0], ['F', 2], ['L', 3]] },
    { label: 'bottom-back-right corner (D/B/R)', cells: [['D', 3], ['B', 2], ['R', 3]] },
    { label: 'bottom-back-left corner (D/B/L)', cells: [['D', 2], ['B', 3], ['L', 2]] },
];

const REAL_CORNERS = new Set(
    ['ufr', 'ufl', 'ubr', 'ubl', 'dfr', 'dfl', 'dbr', 'dbl'].map((s) =>
        [...s].sort().join('')
    )
);

// Canonical corner order for parity: UFR UFL UBR UBL DFR DFL DBR DBL.
const CANONICAL = ['fru', 'flu', 'bru', 'blu', 'frd', 'fld', 'brd', 'bld'].map((s) =>
    [...s].sort().join('')
);

/** Piece-existence check for 2x2 grids (corners only). */
export function findBadCorners2(
    faces: Face2
): { message: string; faces: FaceKey[] } | null {
    const letters = (f: FaceKey, i: number) => stickerLetter(faces[f][i]);
    for (const slot of CORNER_SLOTS_2) {
        const key = slot.cells.map(([f, i]) => letters(f, i)).sort().join('');
        if (!REAL_CORNERS.has(key)) {
            return {
                message: `The ${slot.label} has a color combo no real cube has. Re-check those stickers.`,
                faces: slot.cells.map(([f]) => f),
            };
        }
    }
    return null;
}

/** Permutation parity (0 even / 1 odd) of the 8 corners (hex grids). */
export function cornerParity(faces: Face2): number {
    const letters = {} as Record<FaceKey, string[]>;
    for (const f of Object.keys(faces) as FaceKey[]) {
        letters[f] = faces[f].map((hex) => stickerLetter(hex));
    }
    return cornerParityLetters(letters);
}

function cornerParityLetters(g: Record<FaceKey, string[]>): number {
    const perm = CORNER_SLOTS_2.map((slot) => {
        const key = slot.cells.map(([f, i]) => g[f][i]).sort().join('');
        return CANONICAL.indexOf(key);
    });
    // Parity via cycle decomposition: parity = (n - cycles) % 2.
    const seen = new Array(8).fill(false);
    let cycles = 0;
    for (let i = 0; i < 8; i++) {
        if (seen[i] || perm[i] < 0) continue;
        cycles++;
        let j = i;
        while (!seen[j]) { seen[j] = true; j = perm[j]; }
    }
    return (8 - cycles) % 2;
}

/** 2x2 cell index → 3x3 corner-cell index (for embedding). */
const CELL_2_TO_3 = [0, 2, 6, 8];

/**
 * Embed 2x2 corner letters into a full 3x3 state (edges + centers solved).
 * Fixes edge parity when corners are odd so the 3x3 is always legal.
 * Input: letter grids (f/r/u/d/l/b) in F R U D L B reading order.
 */
export function embed2x2In3x3(grids: Record<FaceKey, string[]>): string {
    const order: FaceKey[] = ['F', 'R', 'U', 'D', 'L', 'B'];
    // Start from a solved 3x3 letter grid.
    const home: Record<FaceKey, string> = { F: 'f', R: 'r', U: 'u', D: 'd', L: 'l', B: 'b' };
    const g: Record<FaceKey, string[]> = {} as Record<FaceKey, string[]>;
    for (const f of order) g[f] = Array.from({ length: 9 }, () => home[f]);
    // Overwrite corners from the 2x2.
    for (const f of order) {
        for (let i = 0; i < 4; i++) g[f][CELL_2_TO_3[i]] = grids[f][i];
    }
    // Odd corner parity needs odd edge parity for a legal 3x3:
    // swap the UF and UR edges (invisible on the 2x2).
    if (cornerParityLetters(g) === 1) {
        // UF edge: U[7], F[1] <-> UR edge: U[5], R[1]
        const t0 = g.U[7]; g.U[7] = g.U[5]; g.U[5] = t0;
        const t1 = g.F[1]; g.F[1] = g.R[1]; g.R[1] = t1;
    }
    return order.map((f) => g[f].join('')).join('');
}

/**
 * Map 3x3 solution turns onto a 2x2: middle-slice turns (M/E/S) never
 * touch corners → dropped; wide turns act as their outer face turn.
 * 3x3 outer layers (±1) are remapped to 2x2 layers (±0.5).
 */
export function mapMovesTo2x2(moves: LayerTurn[]): LayerTurn[] {
    const out: LayerTurn[] = [];
    for (const m of moves) {
        if (m.layer === 0) continue; // M/E/S slice or wide-turn middle part
        out.push({ ...m, layer: m.layer > 0 ? 0.5 : -0.5 });
    }
    return out;
}
