// src/three/PyraMesh.tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { homeLayout, homeTriangleLocal, PyraSticker, VERTICES } from '../pyraminx/geometry';

// Real speedcube look: raised tile caps with panel gaps, glossy plastic.
const INSET = 0.86; // shrink toward centroid -> black seams
const TILE_DEPTH = 0.035;
const TILE_LIFT = 0.004;
const BEVEL = 0.006;

let tiles: THREE.BufferGeometry[] | null = null;
const matsCache = new Map<string, THREE.MeshPhysicalMaterial>();

/** Extruded, beveled tile from world-oriented home corners (centered). */
export function buildTileGeometry(
    corners: THREE.Vector3[],
    homeNormal: THREE.Vector3
): { geometry: THREE.BufferGeometry; quat: THREE.Quaternion } {
    const center = new THREE.Vector3()
        .add(corners[0]).add(corners[1]).add(corners[2])
        .multiplyScalar(1 / 3);
    const inset = corners.map((c) =>
        c.clone().sub(center).multiplyScalar(INSET).add(center)
    );
    // Local 2D frame in the tile plane, n forced outward.
    const u = inset[0].clone().sub(center).normalize();
    let n = new THREE.Vector3().crossVectors(
        inset[0].clone().sub(center),
        inset[1].clone().sub(center)
    ).normalize();
    if (n.dot(homeNormal) < 0) n.negate();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    const to2D = (p: THREE.Vector3) =>
        new THREE.Vector2(p.clone().sub(center).dot(u), p.clone().sub(center).dot(v));
    const shape = new THREE.Shape([to2D(inset[0]), to2D(inset[1]), to2D(inset[2])]);
    const g = new THREE.ExtrudeGeometry(shape, {
        depth: TILE_DEPTH,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL * 0.85,
        bevelSegments: 2,
        steps: 1,
    });
    // Basis (u, v, n) is right-handed by construction; tile faces +Z.
    g.computeVertexNormals();
    // Center the tile on its face plane + lift slightly off the core.
    g.translate(0, 0, -TILE_DEPTH / 2 + TILE_LIFT);
    return { geometry: g, quat: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(u, v, n)
    ) };
}

interface Tile {
    geometry: THREE.BufferGeometry;
    quat: THREE.Quaternion;
}

let tileCache: Tile[] | null = null;

function getTiles(): Tile[] {
    if (!tileCache) {
        const home = homeLayout().stickers;
        tileCache = homeTriangleLocal().map((corners, id) => {
            const { geometry, quat } = buildTileGeometry(
                corners,
                new THREE.Vector3(...home[id].normal)
            );
            return { geometry, quat };
        });
    }
    return tileCache;
}

function getMat(color: string): THREE.MeshPhysicalMaterial {
    let m = matsCache.get(color);
    if (!m) {
        m = new THREE.MeshPhysicalMaterial({
            color,
            roughness: 0.32,
            metalness: 0.0,
            clearcoat: 0.7,
            clearcoatRoughness: 0.25,
            side: THREE.DoubleSide,
        });
        matsCache.set(color, m);
    }
    return m;
}

export function PyraMesh({ sticker }: { sticker: PyraSticker }) {
    const renderQuat = useMemo(() => {
        // Tile shape is baked in world orientation; mesh rotation is the
        // accumulated turn rotation composed with the tile's base frame.
        const tile = getTiles()[sticker.id];
        const q = new THREE.Quaternion(...sticker.quaternion).multiply(tile.quat);
        return [q.x, q.y, q.z, q.w] as [number, number, number, number];
    }, [sticker]);

    return (
        <mesh
            userData={{ stickerId: sticker.id }}
            position={sticker.pos}
            quaternion={renderQuat}
            geometry={getTiles()[sticker.id].geometry}
            material={getMat(sticker.color)}
        />
    );
}

/** Dark inner tetrahedron so the seams look like real plastic. */
export function PyraCore() {
    const geom = useMemo(() => {
        // Faces opposite each vertex, scaled slightly toward the centroid.
        const v = VERTICES.map(
            (p) => new THREE.Vector3(p[0] * 0.94, p[1] * 0.94, p[2] * 0.94)
        );
        const tris: THREE.Vector3[][] = [
            [v[1], v[2], v[3]],
            [v[0], v[3], v[2]],
            [v[0], v[1], v[3]],
            [v[0], v[2], v[1]],
        ];
        const g = new THREE.BufferGeometry();
        const arr = new Float32Array(tris.flatMap((t) => t.flatMap((p) => [p.x, p.y, p.z])));
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        g.computeVertexNormals();
        return g;
    }, []);
    return (
        <mesh geometry={geom} raycast={() => null}>
            <meshStandardMaterial color="#0d1017" roughness={0.9} metalness={0} side={THREE.DoubleSide} />
        </mesh>
    );
}
