// src/pyraminx/solver.ts
// Complete Pyraminx solver:
//  - exact pattern database over the rest state (edge perm+ori, center perm),
//    built once lazily by BFS from solved,
//  - greedy descent with wide turns,
//  - direct tip twists last (tip turns never disturb the rest).
// Move tables are DERIVED from the engine and self-verified in tests.
import {
    commitPyraTurn,
    homeLayout,
    PyraSticker,
    PyraTurn,
    VERTICES,
} from './geometry';
import * as THREE from 'three';

// Faces: 0=F, 1=R, 2=L, 3=D. Cell idx: ups 0..5, downs 6..8.
const EDGE_SLOTS: [[number, number], [number, number]][] = [
    [[0, 1], [1, 2]], // UR
    [[0, 2], [2, 1]], // UL
    [[1, 1], [2, 2]], // UB
    [[0, 4], [3, 1]], // RL
    [[1, 4], [3, 4]], // RB
    [[2, 4], [3, 2]], // BL
];
// Center slots: vertex-adjacent triples (NOT face-bound!). Each center
// piece has one sticker on each of the 3 faces around its home vertex.
const CENTER_SLOTS: [number, number][][] = [
    [[0, 6], [1, 6], [2, 6]], // near U
    [[0, 7], [1, 8], [3, 7]], // near R
    [[0, 8], [2, 7], [3, 6]], // near L
    [[1, 7], [2, 8], [3, 8]], // near B
];
// Tip slots per vertex: corner cells (one sticker per adjacent face).
const TIP_SLOTS: [number, number][][] = [
    [[0, 0], [1, 0], [2, 0]], // U
    [[0, 5], [2, 3], [3, 0]], // L
    [[0, 3], [1, 5], [3, 3]], // R
    [[1, 3], [2, 5], [3, 5]], // B
];

const FACE_LETTER = ['f', 'r', 'l', 'd'];

const WIDE_TURNS: PyraTurn[] = [];
for (const vertex of [0, 1, 2, 3] as const) {
    WIDE_TURNS.push({ vertex, wide: true, prime: false });
    WIDE_TURNS.push({ vertex, wide: true, prime: true });
}

const homeStickers = () => homeLayout().stickers;
const homeLetter = (s: PyraSticker): string => FACE_LETTER[s.face];

const CANON_EDGE = ['fr', 'fl', 'lr', 'df', 'dr', 'dl'];
const CANON_CENTER = ['flr', 'dfr', 'dfl', 'dlr'];

export interface RestState {
    edgePiece: number[];
    edgeOri: number[];
    centerPiece: number[];
    centerOri: number[];
}

/** Read edge+center arrangement from stickers. */
export function encodeRest(stickers: PyraSticker[]): RestState {
    const byPos = new Map<string, PyraSticker>();
    for (const s of stickers) byPos.set(s.pos.join(','), s);
    const at = (face: number, cell: number): PyraSticker => {
        const h = homeStickers()[face * 9 + cell];
        const s = byPos.get(h.pos.join(','));
        if (!s) throw new Error(`Empty slot ${face}:${cell}`);
        return s;
    };
    const edgePiece: number[] = [];
    const edgeOri: number[] = [];
    for (const [[f1, c1], [f2, c2]] of EDGE_SLOTS) {
        const s1 = at(f1, c1);
        const s2 = at(f2, c2);
        const homes = [homeLetter(s1), homeLetter(s2)].sort();
        const piece = CANON_EDGE.indexOf(homes.join(''));
        if (piece < 0) throw new Error(`Unknown edge ${homes.join('')}`);
        edgePiece.push(piece);
        edgeOri.push(homeLetter(s1) === homes[0] ? 0 : 1);
    }
    const centerPiece: number[] = [];
    const centerOri: number[] = [];
    for (const cells of CENTER_SLOTS) {
        const slots = cells.map(([f, c]) => ({ f, c, s: at(f, c) }));
        const homes = slots.map((e) => homeLetter(e.s)).sort();
        const key = homes.join('');
        const piece = CANON_CENTER.indexOf(key);
        if (piece < 0) throw new Error(`Unknown center ${key}`);
        centerPiece.push(piece);
        // orientation: slot index of the alpha-first home sticker
        const ref = homes[0];
        const atIdx = slots.findIndex((e) => homeLetter(e.s) === ref);
        centerOri.push(atIdx);
    }
    return { edgePiece, edgeOri, centerPiece, centerOri };
}

// ---------- integer keys ----------
function permIndex(perm: number[]): number {
    // Lehmer code
    let idx = 0;
    const used = new Array(perm.length).fill(false);
    for (let i = 0; i < perm.length; i++) {
        let rank = 0;
        for (let j = 0; j < perm[i]; j++) if (!used[j]) rank++;
        idx = idx * (perm.length - i) + rank;
        used[perm[i]] = true;
    }
    return idx;
}

function oriIndex(ori: number[], base: number): number {
    let idx = 0;
    for (const o of ori) idx = idx * base + o;
    return idx;
}

export function restKey(r: RestState): number {
    return (
        (permIndex(r.edgePiece) * 64 + oriIndex(r.edgeOri, 2)) * 24 * 81 +
        permIndex(r.centerPiece) * 81 +
        oriIndex(r.centerOri, 3)
    );
}
export const REST_SPACE = 720 * 64 * 24 * 81;

// ---------- move tables (derived) ----------
interface MoveTable {
    turn: PyraTurn;
    edgeTo: number[];   // edgeTo[to] = from
    edgeFlip: boolean[]; // orientation flips for the piece landing at to
    centerTo: number[];
    centerTwist: number[]; // orientation shift (mod 3) for the piece landing at to
}

export type { MoveTable };

function deriveTables(): MoveTable[] {
    const solved = homeStickers();
    const base = encodeRest(solved);
    return WIDE_TURNS.map((turn) => {
        const moved = commitPyraTurn(solved, turn);
        const after = encodeRest(moved);
        // perm: which from-slot's piece is now at to-slot
        const edgeTo: number[] = [];
        const edgeFlip: boolean[] = [];
        for (let to = 0; to < 6; to++) {
            const piece = after.edgePiece[to];
            const from = base.edgePiece.indexOf(piece);
            edgeTo.push(from);
            edgeFlip.push(after.edgeOri[to] !== base.edgeOri[from]);
        }
        const centerTo: number[] = [];
        const centerTwist: number[] = [];
        for (let to = 0; to < 4; to++) {
            const from = base.centerPiece.indexOf(after.centerPiece[to]);
            centerTo.push(from);
            centerTwist.push((after.centerOri[to] - base.centerOri[from] + 9) % 3);
        }
        return { turn, edgeTo, edgeFlip, centerTo, centerTwist };
    });
}

let tablesCache: MoveTable[] | null = null;
export function moveTables(): MoveTable[] {
    if (!tablesCache) tablesCache = deriveTables();
    return tablesCache;
}

/** Apply a table move to a rest state (exported for tests). */
export function applyTable(r: RestState, t: MoveTable): RestState {    const edgePiece = t.edgeTo.map((from) => r.edgePiece[from]);
    const edgeOri = t.edgeTo.map((from, to) => (r.edgeOri[from] + (t.edgeFlip[to] ? 1 : 0)) % 2);
    const centerPiece = t.centerTo.map((from) => r.centerPiece[from]);
    const centerOri = t.centerTo.map((from, to) => (r.centerOri[from] + t.centerTwist[to]) % 3);
    return { edgePiece, edgeOri, centerPiece, centerOri };
}

// ---------- small pattern databases (edges / centers separately) ----------
function edgeKeyOf(r: RestState): number {
    return permIndex(r.edgePiece) * 64 + oriIndex(r.edgeOri, 2);
}
function centerKeyOf(r: RestState): number {
    return permIndex(r.centerPiece) * 81 + oriIndex(r.centerOri, 3);
}

function buildPart(
    keyOf: (r: RestState) => number,
    size: number,
    start: RestState
): Uint8Array {
    const table = new Uint8Array(size).fill(255);
    const tables = moveTables();
    table[keyOf(start)] = 0;
    let frontier: RestState[] = [start];
    let depth = 0;
    while (frontier.length > 0) {
        depth++;
        const next: RestState[] = [];
        for (const r of frontier) {
            for (const t of tables) {
                const nr = applyTable(r, t);
                const k = keyOf(nr);
                if (table[k] === 255) {
                    table[k] = depth;
                    next.push(nr);
                }
            }
        }
        frontier = next;
    }
    return table;
}

let edgePDBCache: Uint8Array | null = null;
let centerPDBCache: Uint8Array | null = null;

function homeRestState(): RestState {
    return encodeRest(homeStickers());
}

/** Exact edge / center distances. Builds in ~100-200ms once, then cached. */
function pdbTables(): { edge: Uint8Array; center: Uint8Array } {
    if (!edgePDBCache || !centerPDBCache) {
        const start = homeRestState();
        edgePDBCache = buildPart(edgeKeyOf, 720 * 64, start);
        centerPDBCache = buildPart(centerKeyOf, 24 * 81, start);
    }
    return { edge: edgePDBCache, center: centerPDBCache };
}

// ---------- IDA* over wide turns ----------
function idaSolve(start: RestState): PyraTurn[] {
    const { edge, center } = pdbTables();
    const tables = moveTables();
    const h = (r: RestState) =>
        Math.max(edge[edgeKeyOf(r)], center[centerKeyOf(r)]);
    let bound = h(start);
    const path: number[] = [];
    for (let iter = 0; iter < 24; iter++) {
        let minNext = Infinity;
        let solved = false;
        const stack: { r: RestState; g: number; lastV: number; it: number }[] = [
            { r: start, g: 0, lastV: -1, it: 0 },
        ];
        while (stack.length > 0) {
            const top = stack[stack.length - 1];
            const hv = h(top.r);
            const f = top.g + hv;
            if (f > bound) {
                if (f < minNext) minNext = f;
                stack.pop();
                path.pop();
                continue;
            }
            if (hv === 0) { solved = true; break; }
            if (top.it < tables.length) {
                const ti = top.it++;
                const t = tables[ti];
                // Same vertex twice collapses (UU=U', UU'=id) — prune safely.
                if (t.turn.vertex === top.lastV) continue;
                stack.push({
                    r: applyTable(top.r, t),
                    g: top.g + 1,
                    lastV: t.turn.vertex,
                    it: 0,
                });
                path.push(ti);
            } else {
                stack.pop();
                path.pop();
            }
        }
        if (solved) return path.map((ti) => tables[ti].turn);
        if (minNext === Infinity) break;
        bound = minNext;
    }
    throw new Error('Pyraminx rest did not solve');
}

// ---------- solver ----------
export interface PyraSolution {
    moves: PyraTurn[];
    labels: string[];
}

/** Direct tip twists for a fully placed rest state. */
function solveTips(stickers: PyraSticker[]): PyraTurn[] {
    const moves: PyraTurn[] = [];
    const byPos = new Map<string, PyraSticker>();
    const cur = stickers.map((s) => ({ ...s }));
    const reindex = () => {
        byPos.clear();
        for (const s of cur) byPos.set(s.pos.join(','), s);
    };
    reindex();
    const home = homeStickers();
    for (let v = 0; v < 4; v++) {
        // tip slots' home colors
        const slots = TIP_SLOTS[v];
        for (let k = 0; k < 3; k++) {
            const ok = slots.every(([f, c]) => {
                const h = home[f * 9 + c];
                const s = byPos.get(h.pos.join(','));
                return s !== undefined && s.color === h.color;
            });
            if (ok) break;
            // Tip turns move only tip stickers, so the rest is untouched.
            const tip: PyraTurn = { vertex: v as 0 | 1 | 2 | 3, wide: false, prime: false };
            const moved = commitPyraTurn(cur, tip);
            for (let i = 0; i < cur.length; i++) cur[i] = moved[i];
            moves.push(tip);
            reindex();
            if (k === 2) throw new Error(`Tip ${v} will not solve`);
        }
    }
    return moves;
}

/**
 * Solve any pyraminx state. Returns wide moves (rest, near-optimal via
 * IDA* on exact PDB heuristics) + tip moves. PDBs build in ~100-200ms
 * once, then each solve takes milliseconds.
 */
export function solvePyraminx(stickers: PyraSticker[]): PyraSolution {
    const moves: PyraTurn[] = [];
    const labels: string[] = [];
    const name = (t: PyraTurn) =>
        `${'ULRB'[t.vertex]}${t.wide ? 'w' : ''}${t.prime ? "'" : ''}`;
    const restMoves = idaSolve(encodeRest(stickers));
    for (const m of restMoves) {
        moves.push(m);
        labels.push(name(m));
    }
    // Apply rest moves, then solve tips directly.
    let cur = stickers.map((s) => ({ ...s }));
    for (const m of restMoves) cur = commitPyraTurn(cur, m);
    const tipMoves = solveTips(cur);
    for (const m of tipMoves) {
        moves.push(m);
        labels.push(name(m));
    }
    return { moves, labels };
}

// ---------- state reconstruction (36 letters -> stickers) ----------
const TETRA_ROTATIONS: THREE.Quaternion[] = (() => {
    const rots: THREE.Quaternion[] = [new THREE.Quaternion()];
    for (const v of VERTICES) {
        const axis = new THREE.Vector3(v[0], v[1], v[2]).normalize();
        rots.push(new THREE.Quaternion().setFromAxisAngle(axis, (2 * Math.PI) / 3));
        rots.push(new THREE.Quaternion().setFromAxisAngle(axis, (-2 * Math.PI) / 3));
    }
    // 180° about axes through midpoints of opposite edges.
    const pairs: [number, number][][] = [
        [[0, 1], [2, 3]],
        [[0, 2], [1, 3]],
        [[0, 3], [1, 2]],
    ];
    for (const [[a, b], [c, d]] of pairs) {
        const m1 = new THREE.Vector3(...VERTICES[a]).add(new THREE.Vector3(...VERTICES[b]));
        const m2 = new THREE.Vector3(...VERTICES[c]).add(new THREE.Vector3(...VERTICES[d]));
        const axis = m1.sub(m2).normalize();
        rots.push(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI));
    }
    return rots;
})();

const FACE_NORMALS: THREE.Vector3[] = (() => {
    const home = homeLayout().stickers;
    const ns: THREE.Vector3[] = [];
    for (let f = 0; f < 4; f++) ns.push(new THREE.Vector3(...home[f * 9].normal));
    return ns;
})();

interface HomePiece {
    stickers: { n: THREE.Vector3; letter: string; homeId: number }[];
}

/** All 14 home pieces (tips, edges, centers) with normals + face letters. */
function homePieces(): HomePiece[] {    const letterOf = (face: number): string => ['f', 'r', 'l', 'd'][face];
    const mk = (cells: [number, number][]): HomePiece => ({
        stickers: cells.map(([f, i]) => ({
            n: FACE_NORMALS[f].clone(),
            letter: letterOf(f),
            homeId: f * 9 + i,
        })),
    });
    const pieces: HomePiece[] = [];
    const tipCells: [number, number][][] = [
        [[0, 0], [1, 0], [2, 0]],
        [[0, 5], [2, 3], [3, 0]],
        [[0, 3], [1, 5], [3, 3]],
        [[1, 3], [2, 5], [3, 5]],
    ];
    for (const g of tipCells) pieces.push(mk(g));
    const edgeCells: [number, number][][] = [
        [[0, 1], [1, 2]], [[0, 2], [2, 1]], [[1, 1], [2, 2]],
        [[0, 4], [3, 1]], [[1, 4], [3, 4]], [[2, 4], [3, 2]],
    ];
    for (const g of edgeCells) pieces.push(mk(g));
    const centerCells: [number, number][][] = [
        [[0, 6], [1, 6], [2, 6]],
        [[0, 7], [1, 8], [3, 7]],
        [[0, 8], [2, 7], [3, 6]],
        [[1, 7], [2, 8], [3, 8]],
    ];
    for (const g of centerCells) pieces.push(mk(g));
    return pieces;
}

function roundVec(v: THREE.Vector3): string {
    return [v.x, v.y, v.z].map((x) => Math.round(x)).join(',');
}

const LETTER_HEX: Record<string, string> = {
    f: '#009e60', r: '#c41e3a', l: '#0051ba', d: '#ffd500',
};

/**
 * Rebuild stickers from 36 face letters (F,R,L,D faces × 9 reading order).
 * Throws on invalid input. Round-trip verified in tests.
 */
export function stateToPyraStickers(state: string): PyraSticker[] {
    if (state.length !== 36 || !/^[frld]+$/.test(state)) {
        throw new Error('Pyraminx state must be 36 letters (f/r/l/d).');
    }
    const letters: string[][] = [];
    for (let f = 0; f < 4; f++) letters.push([...state.slice(f * 9, f * 9 + 9)]);
    const home = homeLayout().stickers;
    const pieces = homePieces();
    const remaining = [...pieces];
    // Slot groups in fixed order: tips, edges, centers (disjoint, covering).
    const groups: [number, number][][] = [
        [[0, 0], [1, 0], [2, 0]],
        [[0, 5], [2, 3], [3, 0]],
        [[0, 3], [1, 5], [3, 3]],
        [[1, 3], [2, 5], [3, 5]],
        [[0, 1], [1, 2]], [[0, 2], [2, 1]], [[1, 1], [2, 2]],
        [[0, 4], [3, 1]], [[1, 4], [3, 4]], [[2, 4], [3, 2]],
        [[0, 6], [1, 6], [2, 6]],
        [[0, 7], [1, 8], [3, 7]],
        [[0, 8], [2, 7], [3, 6]],
        [[1, 7], [2, 8], [3, 8]],
    ];
    const pieceKey = (p: HomePiece) =>
        p.stickers.map((s) => s.letter).sort().join('');
    const out: PyraSticker[] = [];
    const homeLetterOf = (homeId: number): string =>
        ['f', 'r', 'l', 'd'][home[homeId].face];

    // Find all rotations fitting a piece into a slot group.
    const fittings = (
        group: [number, number][],
        piece: HomePiece
    ): THREE.Quaternion[] => {
        const slotPos = group.map(([f, i]) => home[f * 9 + i].pos);
        const homeIds = piece.stickers.map((s) => s.homeId);
        const fits: THREE.Quaternion[] = [];
        for (const cand of TETRA_ROTATIONS) {
            const mapped = homeIds.map((hid) => {
                const hp = home[hid].pos;
                return new THREE.Vector3(hp[0], hp[1], hp[2]).applyQuaternion(cand);
            });
            // NOTE: exact-distance matching, NOT toFixed strings:
            // (-2.6e-16).toFixed(6) is "-0.000000" but (1.1e-16).toFixed(6)
            // is "0.000000", which broke matching on tiny negatives.
            const used = new Set<number>();
            let ok = true;
            for (const m of mapped) {
                const hit = slotPos.findIndex(
                    (sp, si) =>
                        !used.has(si) &&
                        m.distanceToSquared(new THREE.Vector3(sp[0], sp[1], sp[2])) < 1e-9
                );
                if (hit < 0) { ok = false; break; }
                used.add(hit);
            }
            if (!ok || used.size !== group.length) continue;
            for (const [f, i] of group) {
                const hp = home[f * 9 + i].pos;
                const src = homeIds.find((hid) => {
                    const sp = home[hid].pos;
                    const m = new THREE.Vector3(sp[0], sp[1], sp[2]).applyQuaternion(cand);
                    return m.distanceToSquared(new THREE.Vector3(...hp)) < 1e-12;
                });
                if (src === undefined || homeLetterOf(src) !== letters[f][i]) { ok = false; break; }
            }
            if (ok) fits.push(cand);
        }
        return fits;
    };
    const emit = (group: [number, number][], piece: HomePiece, q: THREE.Quaternion) => {
        for (const [f, i] of group) {
            const h = home[f * 9 + i];
            const hp = new THREE.Vector3(...h.pos);
            const homeId = piece.stickers.find((s) => {
                const sp = home[s.homeId].pos;
                const rotated = new THREE.Vector3(sp[0], sp[1], sp[2]).applyQuaternion(q);
                return rotated.distanceToSquared(hp) < 1e-12;
            })?.homeId;
            if (homeId === undefined) throw new Error(`Slot map failed at ${f}:${i}`);
            out.push({
                id: homeId,
                pos: [...h.pos] as [number, number, number],
                normal: [...h.normal] as [number, number, number],
                quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
                color: LETTER_HEX[letters[f][i]],
                face: home[homeId].face,
            });
        }
    };

    // Tips never leave their vertex: assign directly (rotation must exist).
    const tipGroups = groups.slice(0, 4);
    const tipPool = pieces.splice(0, 4);
    const tipNames = ['U', 'L', 'R', 'B'];
    for (let v = 0; v < 4; v++) {
        const want = tipGroups[v].map(([f, i]) => letters[f][i]).sort().join('');
        const pi = tipPool.findIndex((p) => pieceKey(p) === want);
        if (pi < 0) {
            throw new Error(
                `Tip ${tipNames[v]} has impossible colors — re-check those faces`
            );
        }
        const [piece] = tipPool.splice(pi, 1);
        const fits = fittings(tipGroups[v], piece);
        if (fits.length === 0) {
            throw new Error(`Tip ${tipNames[v]} is impossible — re-check those faces`);
        }
        emit(tipGroups[v], piece, fits[0]);
    }
    // Edges + centers permute: backtracking DFS with MRV.
    const flexGroups = groups.slice(4);
    const flexPieces = pieces; // 6 edges + 4 centers
    const keyOf = (cells: [number, number][]) =>
        cells.map(([f, i]) => letters[f][i]).sort().join('');
    // Recursive DFS returns true when all groups placed.
    const placed: { group: [number, number][]; piece: HomePiece; q: THREE.Quaternion }[] = [];
    const dfs = (remainingGroups: [number, number][][], pool: HomePiece[]): boolean => {
        if (remainingGroups.length === 0) return true;
        // MRV: group with fewest (piece, rotation) options.
        let bestGI = -1;
        let bestOpts: { piece: HomePiece; q: THREE.Quaternion }[] = [];
        for (let gi = 0; gi < remainingGroups.length; gi++) {
            const want = keyOf(remainingGroups[gi]);
            const opts: { piece: HomePiece; q: THREE.Quaternion }[] = [];
            for (const p of pool) {
                if (pieceKey(p) !== want) continue;
                for (const q of fittings(remainingGroups[gi], p)) {
                    opts.push({ piece: p, q });
                }
            }
            if (opts.length === 0) return false;
            if (bestGI < 0 || opts.length < bestOpts.length) {
                bestGI = gi;
                bestOpts = opts;
                if (opts.length === 1) break;
            }
        }
        const [group] = remainingGroups.splice(bestGI, 1);
        for (const { piece, q } of bestOpts) {
            const pi = pool.indexOf(piece);
            pool.splice(pi, 1);
            placed.push({ group, piece, q });
            if (dfs(remainingGroups, pool)) return true;
            placed.pop();
            pool.splice(pi, 0, piece);
        }
        remainingGroups.splice(bestGI, 0, group);
        return false;
    };
    if (!dfs([...flexGroups], [...flexPieces])) {
        throw new Error('No consistent piece placement — re-check entered colors');
    }
    for (const { group, piece, q } of placed) emit(group, piece, q);
    return out;
}

// ---------- entry validation (pinpoints bad pieces before solving) ----------
export type PyraFaceKey = 'F' | 'R' | 'L' | 'D';
const PYRA_ORDER: PyraFaceKey[] = ['F', 'R', 'L', 'D'];

/**
 * Pyraminx has its own color→letter map (blue = LEFT face here).
 * The shared cube stickerLetter maps this blue to 'b' (back) — wrong here.
 */
const PYRA_HEX: Record<string, string> = {
    '#009e60': 'f',
    '#c41e3a': 'r',
    '#0051ba': 'l',
    '#ffd500': 'd',
};
export function pyraLetter(hex: string): string {
    return PYRA_HEX[hex.toLowerCase()] ?? '?';
}
export function pyraHex(letter: string): string {
    const found = Object.entries(PYRA_HEX).find(([, v]) => v === letter);
    return found ? found[0] : '#111318';
}

const REAL_TIPS = new Set(['flr', 'dfl', 'dfr', 'dlr']);
const REAL_EDGES = new Set(['fr', 'fl', 'lr', 'df', 'dr', 'dl']);
const REAL_CENTERS = new Set(['flr', 'dfr', 'dfl', 'dlr']);

const TIP_GROUPS: [PyraFaceKey, number][][] = [
    [['F', 0], ['R', 0], ['L', 0]],
    [['F', 5], ['L', 3], ['D', 0]],
    [['F', 3], ['R', 5], ['D', 3]],
    [['R', 3], ['L', 5], ['D', 5]],
];
const EDGE_GROUPS: [PyraFaceKey, number][][] = [
    [['F', 1], ['R', 2]], [['F', 2], ['L', 1]], [['R', 1], ['L', 2]],
    [['F', 4], ['D', 1]], [['R', 4], ['D', 4]], [['L', 4], ['D', 2]],
];
const CENTER_GROUPS: [PyraFaceKey, number][][] = [
    [['F', 6], ['R', 6], ['L', 6]],
    [['F', 7], ['R', 8], ['D', 7]],
    [['F', 8], ['L', 7], ['D', 6]],
    [['R', 7], ['L', 8], ['D', 8]],
];

/**
 * Check a manually entered pyraminx (hex grids in faceCells order).
 * Returns the first impossible piece (with involved faces) or null.
 */
export function findBadPyra(
    faces: Record<PyraFaceKey, string[]>
): { message: string; faces: PyraFaceKey[] } | null {
    const letters = (f: PyraFaceKey, i: number) => pyraLetter(faces[f][i]);
    const check = (
        groups: [PyraFaceKey, number][][],
        real: Set<string>,
        kind: string
    ): { message: string; faces: PyraFaceKey[] } | null => {
        for (const cells of groups) {
            const key = cells.map(([f, i]) => letters(f, i)).sort().join('');
            if (!real.has(key)) {
                const involved = cells.map(([f]) => f);
                return {
                    message: `A ${kind} has colors (${cells.map(([f, i]) => letters(f, i).toUpperCase()).join(', ')}) no real pyraminx has. Re-check the ${involved.join('/')} faces.`,
                    faces: involved,
                };
            }
        }
        return null;
    };
    return (
        check(TIP_GROUPS, REAL_TIPS, 'tip') ??
        check(EDGE_GROUPS, REAL_EDGES, 'edge') ??
        check(CENTER_GROUPS, REAL_CENTERS, 'center')
    );
}

export { PYRA_ORDER };
