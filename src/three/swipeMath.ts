// src/three/swipeMath.ts
import * as THREE from 'three';
import { AxisIdx, LayerTurn } from '../cube/types';

const AXES = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
];

export function screenSwipeToWorld(
    dx: number,
    dy: number,
    touchPoint: THREE.Vector3,
    faceNormal: THREE.Vector3,
    camera: THREE.Camera,
    size: { width: number; height: number }
): THREE.Vector3 | null {
    const tangents = AXES.filter((a) => Math.abs(a.dot(faceNormal)) < 0.5);
    if (tangents.length !== 2) return null;

    const eps = 0.01;
    const p0 = touchPoint.clone().project(camera);
    const p1 = touchPoint.clone().addScaledVector(tangents[0], eps).project(camera);
    const p2 = touchPoint.clone().addScaledVector(tangents[1], eps).project(camera);

    const halfW = size.width / 2;
    const halfH = size.height / 2;

    const v1 = new THREE.Vector2((p1.x - p0.x) * halfW, -(p1.y - p0.y) * halfH);
    const v2 = new THREE.Vector2((p2.x - p0.x) * halfW, -(p2.y - p0.y) * halfH);
    const swipe = new THREE.Vector2(dx, dy);

    const det = v1.x * v2.y - v1.y * v2.x;
    if (Math.abs(det) < 1e-6) return null;

    const a = (swipe.x * v2.y - swipe.y * v2.x) / det;
    const b = (v1.x * swipe.y - v1.y * swipe.x) / det;

    const world = tangents[0].clone().multiplyScalar(a).addScaledVector(tangents[1], b);
    if (world.lengthSq() < 1e-8) return null;
    return world.normalize();
}

/**
 * Compute the layer turn that the swipe should trigger.
 * `layers` are the valid layer coords for the cube size, ascending.
 */
export function computeLayerTurn(
    n: THREE.Vector3,
    worldSwipe: THREE.Vector3,
    touchPoint: THREE.Vector3,
    layers: number[] = [-1, 0, 1]
): LayerTurn | null {
    const tangents = AXES.filter((a) => Math.abs(a.dot(n)) < 0.5);
    if (tangents.length !== 2) return null;

    // Snap the swipe to the nearest tangent axis (signed).
    // Pick the signed tangent with the largest alignment dot product.
    let bestDot = -Infinity;
    let bestTangent: THREE.Vector3 | null = null;
    for (const t of tangents) {
        for (const s of [1, -1]) {
            const d = worldSwipe.dot(t) * s;
            if (d > bestDot) {
                bestDot = d;
                bestTangent = t.clone().multiplyScalar(s);
            }
        }
    }
    if (!bestTangent) return null;

    // Rotation axis = face normal × swipe direction (right-hand rule).
    const axis = new THREE.Vector3().crossVectors(n, bestTangent);

    const abs = [Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)];
    let axisIdx: AxisIdx = 0;
    if (abs[1] > abs[0] && abs[1] >= abs[2]) axisIdx = 1;
    else if (abs[2] > abs[0] && abs[2] > abs[1]) axisIdx = 2;

    const axisSign = axis.getComponent(axisIdx) > 0 ? 1 : -1;
    // Snap to the nearest valid layer for this cube size.
    const v = touchPoint.getComponent(axisIdx);
    let layer = layers[0];
    for (const l of layers) {
        if (Math.abs(l - v) < Math.abs(layer - v)) layer = l;
    }

    return {
        axisIdx,
        layer,
        prime: axisSign > 0, // +90° around +axis
    };
}