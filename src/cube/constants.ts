// src/cube/constants.ts
import * as THREE from 'three';
import { Axis, FaceName } from './types';

export const COLORS = {
    R: '#c41e3a',  // right  - red
    L: '#ff8c00',  // left   - orange
    U: '#ffffff',  // top    - white
    D: '#ffd500',  // bottom - yellow
    F: '#009e60',  // front  - green
    B: '#0051ba',  // back   - blue
    HIDDEN: '#111318',
};

export const SPACING = 1;
export const CUBIE_SIZE = 0.94;
export const TURN_DURATION_MS = 180;
/** Fast turn used during animated scrambles — feels like a real speedcube. */
export const SCRAMBLE_TURN_MS = 85;
/** Number of moves in an animated scramble. */
export const SCRAMBLE_LENGTH = 20;

export interface FaceInfo {
    axis: Axis;
    axisVec: THREE.Vector3;
    layerCoord: -1 | 1;
}

// Clockwise when viewed from OUTSIDE the face
// = rotate around the outward normal by -90° (right-hand rule)
export const FACE_INFO: Record<FaceName, FaceInfo> = {
    R: { axis: 'x', axisVec: new THREE.Vector3(1, 0, 0), layerCoord: 1 },
    L: { axis: 'x', axisVec: new THREE.Vector3(-1, 0, 0), layerCoord: -1 },
    U: { axis: 'y', axisVec: new THREE.Vector3(0, 1, 0), layerCoord: 1 },
    D: { axis: 'y', axisVec: new THREE.Vector3(0, -1, 0), layerCoord: -1 },
    F: { axis: 'z', axisVec: new THREE.Vector3(0, 0, 1), layerCoord: 1 },
    B: { axis: 'z', axisVec: new THREE.Vector3(0, 0, -1), layerCoord: -1 },
};