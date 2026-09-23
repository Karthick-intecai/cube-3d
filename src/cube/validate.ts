// src/cube/validate.ts
import { stickerLetter } from './facelets';

export type FaceKey = 'F' | 'R' | 'U' | 'D' | 'L' | 'B';

// Grid indices are reading order per face (row-major, top row first).
type Slot = { label: string; cells: [FaceKey, number][] };

const CORNER_SLOTS: Slot[] = [
    { label: 'top-front-right corner (U/F/R)', cells: [['U', 8], ['F', 2], ['R', 0]] },
    { label: 'top-front-left corner (U/F/L)', cells: [['U', 6], ['F', 0], ['L', 2]] },
    { label: 'top-back-right corner (U/B/R)', cells: [['U', 2], ['B', 0], ['R', 2]] },
    { label: 'top-back-left corner (U/B/L)', cells: [['U', 0], ['B', 2], ['L', 0]] },
    { label: 'bottom-front-right corner (D/F/R)', cells: [['D', 2], ['F', 8], ['R', 6]] },
    { label: 'bottom-front-left corner (D/F/L)', cells: [['D', 0], ['F', 6], ['L', 8]] },
    { label: 'bottom-back-right corner (D/B/R)', cells: [['D', 8], ['B', 6], ['R', 8]] },
    { label: 'bottom-back-left corner (D/B/L)', cells: [['D', 6], ['B', 8], ['L', 6]] },
];

const EDGE_SLOTS: Slot[] = [
    { label: 'top-front edge (U/F)', cells: [['U', 7], ['F', 1]] },
    { label: 'top-right edge (U/R)', cells: [['U', 5], ['R', 1]] },
    { label: 'top-back edge (U/B)', cells: [['U', 1], ['B', 1]] },
    { label: 'top-left edge (U/L)', cells: [['U', 3], ['L', 1]] },
    { label: 'bottom-front edge (D/F)', cells: [['D', 1], ['F', 7]] },
    { label: 'bottom-right edge (D/R)', cells: [['D', 5], ['R', 7]] },
    { label: 'bottom-back edge (D/B)', cells: [['D', 7], ['B', 7]] },
    { label: 'bottom-left edge (D/L)', cells: [['D', 3], ['L', 7]] },
    { label: 'front-right edge (F/R)', cells: [['F', 5], ['R', 3]] },
    { label: 'front-left edge (F/L)', cells: [['F', 3], ['L', 5]] },
    { label: 'back-right edge (B/R)', cells: [['B', 3], ['R', 5]] },
    { label: 'back-left edge (B/L)', cells: [['B', 5], ['L', 3]] },
];

const REAL_CORNERS = new Set(
    ['ufr', 'ufl', 'ubr', 'ubl', 'dfr', 'dfl', 'dbr', 'dbl'].map((s) =>
        [...s].sort().join('')
    )
);
const REAL_EDGES = new Set(
    ['uf', 'ur', 'ub', 'ul', 'df', 'dr', 'db', 'dl', 'fr', 'fl', 'br', 'bl'].map((s) =>
        [...s].sort().join('')
    )
);

/**
 * Check that every corner/edge slot holds a color combo that exists on a
 * real cube. Returns the first bad piece (with involved faces) or null.
 */
export function findBadPieces(
    faces: Record<FaceKey, string[]>
): { message: string; faces: FaceKey[] } | null {
    const letters = (f: FaceKey, i: number) => stickerLetter(faces[f][i]);
    for (const slot of CORNER_SLOTS) {
        const key = slot.cells.map(([f, i]) => letters(f, i)).sort().join('');
        if (!REAL_CORNERS.has(key)) {
            return {
                message: `The ${slot.label} has a color combo no real cube has. Re-check those stickers.`,
                faces: slot.cells.map(([f]) => f),
            };
        }
    }
    for (const slot of EDGE_SLOTS) {
        const key = slot.cells.map(([f, i]) => letters(f, i)).sort().join('');
        if (!REAL_EDGES.has(key)) {
            return {
                message: `The ${slot.label} has a color combo no real cube has. Re-check those stickers.`,
                faces: slot.cells.map(([f]) => f),
            };
        }
    }
    return null;
}
