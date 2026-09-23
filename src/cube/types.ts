// src/cube/types.ts
export type FaceName = 'R' | 'L' | 'U' | 'D' | 'F' | 'B';
export type AxisIdx = 0 | 1 | 2;

export type Axis = 'x' | 'y' | 'z';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w

/** A general turn: rotate layer `layer` around axis `axisIdx` by ±90°. */
export interface LayerTurn {
    axisIdx: AxisIdx;
    /** Layer coordinate: ±1/0 for 3x3, ±0.5 for 2x2, ±1.5/±0.5 for 4x4. */
    layer: number;
    /** true = +90° (right-hand rule) around the +axis direction. */
    prime: boolean;
}

export interface Cubie {
    id: number;
    position: Vec3;            // grid coords in {-1, 0, 1}
    quaternion: Quat;          // orientation
    stickers: [string, string, string, string, string, string];
    // local frame order matching THREE.BoxGeometry:
    // [ +X, -X, +Y, -Y, +Z, -Z ]
}

export interface FaceTurn {
    face: FaceName;
    prime: boolean;
}

/** Convert a named face turn into the equivalent layer turn. */
export function faceToLayer(face: FaceName, prime: boolean, size = 3): LayerTurn {
    const outer = (size - 1) / 2;
    const map: Record<FaceName, [AxisIdx, number]> = {
        R: [0, outer], L: [0, -outer],
        U: [1, outer], D: [1, -outer],
        F: [2, outer], B: [2, -outer],
    };
    const [axisIdx, layer] = map[face];
    // Layer -1 rotations are expressed around -axis, so flip prime.
    return { axisIdx, layer, prime: layer > 0 ? prime : !prime };
}

/** Valid layer coordinates for a cube of the given size, ascending. */
export function layerCoords(size = 3): number[] {
    const outer = (size - 1) / 2;
    const coords: number[] = [];
    for (let i = 0; i < size; i++) coords.push(-outer + i);
    return coords;
}