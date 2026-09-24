// src/pyraminx/geometry.ts
// Tetrahedral Pyraminx model. Stickers are the units (36 total):
// positions live on a triangular lattice, turns rotate vertex regions
// by ±120° and snap back onto the lattice.
import * as THREE from 'three';

export type Vec3 = [number, number, number];

export interface PyraSticker {
    id: number;
    pos: Vec3;
    normal: Vec3;
    /** Accumulated world-frame orientation (turns compose like cube quats). */
    quaternion: [number, number, number, number];
    color: string;
    face: number; // home face 0..3
}

export interface PyraTurn {
    vertex: 0 | 1 | 2 | 3; // U, L, R, B
    wide: boolean;         // two layers (false = tip only)
    prime: boolean;        // +120° about the vertex axis
}

export const VERTEX_NAMES = ['U', 'L', 'R', 'B'] as const;

export const FACE_COLORS = ['#009e60', '#0051ba', '#c41e3a', '#ffd500']; // F L R D
export const TURN_MS = 220;
export const SCRAMBLE_TURNS = 14;

// Regular tetrahedron, apex up, front edge facing +Z.
// Built from the EXACT (±1,±1,±1) tetrahedron (all edges 2√2) rotated
// into place. Hand-rounded decimals here previously broke exact
// 3-fold symmetry (~3e-4 error), which broke rotation-based matching.
// All construction below introduces only ~1e-16 float error.
const RAW_EXACT: Vec3[] = [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
];
function orientTetra(): Vec3[] {
    const pts = RAW_EXACT.map(
        (v) => new THREE.Vector3(v[0], v[1], v[2])
    );
    // Apex: vertex 0 -> +Y.
    const r1 = new THREE.Quaternion().setFromUnitVectors(
        pts[0].clone().normalize(),
        new THREE.Vector3(0, 1, 0)
    );
    pts.forEach((p) => p.applyQuaternion(r1));
    // Yaw: vertex with min z -> back (-Z), others symmetric front.
    let bi = 1;
    for (let i = 2; i < 4; i++) {
        if (pts[i].z < pts[bi].z) bi = i;
    }
    const yaw = Math.PI - Math.atan2(pts[bi].x, pts[bi].z);
    const r2 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw
    );
    pts.forEach((p) => p.applyQuaternion(r2));
    // Label: apex U, back B (-x? no: min-z), +x R, -x L.
    const order = [0];
    const rest = [1, 2, 3].filter((i) => i !== bi);
    // Of the two front vertices, +x is R.
    rest.sort((a, b) => pts[a].x - pts[b].x);
    const L = rest[0], R = rest[1];
    const V: Record<string, THREE.Vector3> = { U: pts[0], L: pts[L], R: pts[R], B: pts[bi] };
    const out = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
    return [out(V.U), out(V.L), out(V.R), out(V.B)];
}
const ORIENTED = orientTetra();
const U: Vec3 = ORIENTED[0];
const L: Vec3 = ORIENTED[1];
const R: Vec3 = ORIENTED[2];
const B: Vec3 = ORIENTED[3];

export const VERTICES: Vec3[] = [U, L, R, B];

// Faces as vertex triples. Corner addressing uses (P0, P1, P2) order.
const FACES: { verts: [Vec3, Vec3, Vec3]; color: string }[] = [
    { verts: [U, R, L], color: FACE_COLORS[0] }, // front
    { verts: [U, B, R], color: FACE_COLORS[2] }, // right
    { verts: [U, L, B], color: FACE_COLORS[1] }, // left
    { verts: [L, R, B], color: FACE_COLORS[3] }, // down (base)
];

interface Cell {
    kind: 'up' | 'down';
    i: number;
    j: number;
    center: THREE.Vector3;
    corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

function sub(a: THREE.Vector3, b: THREE.Vector3) { return a.clone().sub(b); }
function add3(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    return new THREE.Vector3(
        (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3
    );
}

function lattice(P0: THREE.Vector3, P1: THREE.Vector3, P2: THREE.Vector3) {
    const e1 = sub(P1, P0).multiplyScalar(1 / 3);
    const e2 = sub(P2, P0).multiplyScalar(1 / 3);
    const L = (i: number, j: number) => P0.clone().addScaledVector(e1, i).addScaledVector(e2, j);
    return { L };
}

function faceCells(f: number): Cell[] {
    const [P0, P1, P2] = FACES[f].verts.map((v) => new THREE.Vector3(...v));
    const { L } = lattice(P0, P1, P2);
    const cells: Cell[] = [];
    const ups: [number, number][] = [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2]];
    for (const [i, j] of ups) {
        cells.push({
            kind: 'up', i, j,
            center: add3(L(i, j), L(i + 1, j), L(i, j + 1)),
            corners: [L(i, j), L(i + 1, j), L(i, j + 1)],
        });
    }
    const downs: [number, number][] = [[0, 0], [1, 0], [0, 1]];
    for (const [i, j] of downs) {
        cells.push({
            kind: 'down', i, j,
            center: add3(L(i + 1, j), L(i, j + 1), L(i + 1, j + 1)),
            corners: [L(i + 1, j), L(i, j + 1), L(i + 1, j + 1)],
        });
    }
    return cells;
}

/** Corner cell sets within a face: which-position (0=P0, 1=P1, 2=P2), wide? */
function cornerCells(cells: Cell[], which: 0 | 1 | 2, wide: boolean): Cell[] {
    const near = (c: Cell): boolean => {
        if (c.kind === 'down') {
            if (!wide) return false;
            if (which === 0) return c.i === 0 && c.j === 0;
            if (which === 1) return c.i === 1 && c.j === 0;
            return c.i === 0 && c.j === 1;
        }
        if (!wide) {
            if (which === 0) return c.i === 0 && c.j === 0;
            if (which === 1) return c.i === 2 && c.j === 0;
            return c.i === 0 && c.j === 2;
        }
        if (which === 0) return c.i + c.j <= 1;
        if (which === 1) return c.i >= 1;
        return c.j >= 1;
    };
    return cells.filter(near);
}

function outwardNormal(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
    const n = new THREE.Vector3().crossVectors(sub(b, a), sub(c, a)).normalize();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const center = new THREE.Vector3(
        (U[0] + L[0] + R[0] + B[0]) / 4,
        (U[1] + L[1] + R[1] + B[1]) / 4,
        (U[2] + L[2] + R[2] + B[2]) / 4
    );
    if (n.dot(sub(centroid, center)) < 0) n.negate();
    return n;
}

export interface HomeLayout {
    stickers: PyraSticker[];
    normals: THREE.Vector3[];
    tipThresh: number;
    wideThresh: number;
    edgeLen: number;
}

let homeCache: HomeLayout | null = null;

/** Build the solved sticker layout (cached). */
export function homeLayout(): HomeLayout {
    if (homeCache) return homeCache;
    const stickers: PyraSticker[] = [];
    const normals: THREE.Vector3[] = [];
    let id = 0;
    for (let f = 0; f < 4; f++) {
        const [P0, P1, P2] = FACES[f].verts.map((v) => new THREE.Vector3(...v));
        const n = outwardNormal(P0, P1, P2);
        normals.push(n.clone());
        for (const cell of faceCells(f)) {
            stickers.push({
                id: id++,
                pos: [cell.center.x, cell.center.y, cell.center.z],
                normal: [n.x, n.y, n.z],
                quaternion: [0, 0, 0, 1],
                color: FACES[f].color,
                face: f,
            });
        }
    }
    // Membership thresholds from the distance clusters to vertex 0.
    const v0 = new THREE.Vector3(...VERTICES[0]);
    const dists = stickers
        .map((s) => new THREE.Vector3(...s.pos).distanceTo(v0))
        .sort((a, b) => a - b);
    const tipThresh = (dists[2] + dists[3]) / 2;
    const wideThresh = (dists[11] + dists[12]) / 2;
    const edgeLen = new THREE.Vector3(...U).distanceTo(new THREE.Vector3(...L));
    homeCache = { stickers, normals, tipThresh, wideThresh, edgeLen };
    return homeCache;
}

/** Sticker ids in a turn region, from CURRENT positions. */
export function turnMembers(stickers: PyraSticker[], turn: PyraTurn): number[] {
    const { tipThresh, wideThresh } = homeLayout();
    const v = new THREE.Vector3(...VERTICES[turn.vertex]);
    const thresh = turn.wide ? wideThresh : tipThresh;
    const out: number[] = [];
    for (const s of stickers) {
        if (new THREE.Vector3(...s.pos).distanceTo(v) < thresh) out.push(s.id);
    }
    return out;
}

function nearest<T>(items: T[], key: (t: T) => THREE.Vector3, p: THREE.Vector3): T {
    let best = items[0];
    let bestD = Infinity;
    for (const it of items) {
        const d = key(it).distanceToSquared(p);
        if (d < bestD) { bestD = d; best = it; }
    }
    return best;
}

/** Apply a turn: rotate members ±120° about the vertex axis, snap to lattice. */
export function commitPyraTurn(stickers: PyraSticker[], turn: PyraTurn): PyraSticker[] {
    const home = homeLayout();
    const axis = new THREE.Vector3(...VERTICES[turn.vertex]).normalize();
    const angle = (turn.prime ? 1 : -1) * ((2 * Math.PI) / 3);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    const members = new Set(turnMembers(stickers, turn));
    return stickers.map((s) => {
        if (!members.has(s.id)) return s;
        const p = new THREE.Vector3(...s.pos).applyQuaternion(q);
        const slot = nearest(home.stickers, (h) => new THREE.Vector3(...h.pos), p);
        const n0 = new THREE.Vector3(...s.normal).applyQuaternion(q);
        const n = nearest(home.normals, (h) => h, n0);
        const nq = q.clone().multiply(new THREE.Quaternion(...s.quaternion)).normalize();
        return {
            ...s,
            pos: [...slot.pos] as Vec3,
            normal: [n.x, n.y, n.z] as Vec3,
            quaternion: [nq.x, nq.y, nq.z, nq.w] as [number, number, number, number],
        };
    });
}

export function invertTurn(t: PyraTurn): PyraTurn {
    return { ...t, prime: !t.prime };
}

/** Solved = every face shows a single color. */
export function isPyraSolved(stickers: PyraSticker[]): boolean {
    const home = homeLayout();
    const seen = new Map<number, string>();
    for (const s of stickers) {
        const p = new THREE.Vector3(...s.normal);
        let fi = 0;
        let best = Infinity;
        home.normals.forEach((n, i) => {
            const d = n.distanceToSquared(p);
            if (d < best) { best = d; fi = i; }
        });
        const prev = seen.get(fi);
        if (prev === undefined) seen.set(fi, s.color);
        else if (prev !== s.color) return false;
    }
    return true;
}

export function randomPyraScramble(n = SCRAMBLE_TURNS): PyraTurn[] {
    const moves: PyraTurn[] = [];
    let lastVertex = -1;
    for (let i = 0; i < n; i++) {
        let vertex: 0 | 1 | 2 | 3;
        do {
            vertex = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
        } while (vertex === lastVertex);
        lastVertex = vertex;
        moves.push({ vertex, wide: Math.random() < 0.6, prime: Math.random() < 0.5 });
    }
    return moves;
}

export function turnNotation(t: PyraTurn): string {
    return `${VERTEX_NAMES[t.vertex]}${t.wide ? 'w' : ''}${t.prime ? "'" : ''}`;
}

// Re-export cell corner logic for tests.
export { cornerCells, faceCells };

/**
 * Local triangle corners (relative to center) for every home sticker,
 * aligned with homeLayout().stickers order. Rendered with
 * quaternion = sticker.quaternion * baseQuat(home normal).
 */
export function homeTriangleLocal(): THREE.Vector3[][] {
    const out: THREE.Vector3[][] = [];
    for (let f = 0; f < 4; f++) {
        for (const cell of faceCells(f)) {
            out.push(cell.corners.map((c) => c.clone().sub(cell.center)));
        }
    }
    return out;
}

/** Rotation taking +Z to the given home normal. */
export function baseQuatFor(normal: Vec3): THREE.Quaternion {
    return new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(...normal).normalize()
    );
}
