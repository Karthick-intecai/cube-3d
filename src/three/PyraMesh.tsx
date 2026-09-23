// src/three/PyraMesh.tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { baseQuatFor, homeLayout, homeTriangleLocal, PyraSticker, VERTICES } from '../pyraminx/geometry';

let geoms: THREE.BufferGeometry[] | null = null;
const matsCache = new Map<string, THREE.MeshStandardMaterial>();

function getGeoms(): THREE.BufferGeometry[] {
    if (!geoms) {
        geoms = homeTriangleLocal().map((corners) => {
            const g = new THREE.BufferGeometry();
            const v = new Float32Array(corners.flatMap((c) => [c.x, c.y, c.z]));
            g.setAttribute('position', new THREE.BufferAttribute(v, 3));
            g.computeVertexNormals();
            return g;
        });
    }
    return geoms;
}

function getMat(color: string): THREE.MeshStandardMaterial {
    let m = matsCache.get(color);
    if (!m) {
        m = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.35,
            metalness: 0.05,
            side: THREE.DoubleSide,
        });
        matsCache.set(color, m);
    }
    return m;
}

export function PyraMesh({ sticker }: { sticker: PyraSticker }) {
    const renderQuat = useMemo(() => {
        const home = homeLayout().stickers[sticker.id];
        const base = baseQuatFor(home.normal);
        const q = new THREE.Quaternion(...sticker.quaternion).multiply(base);
        return [q.x, q.y, q.z, q.w] as [number, number, number, number];
    }, [sticker]);

    return (
        <mesh
            userData={{ stickerId: sticker.id }}
            position={sticker.pos}
            quaternion={renderQuat}
            geometry={getGeoms()[sticker.id]}
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
