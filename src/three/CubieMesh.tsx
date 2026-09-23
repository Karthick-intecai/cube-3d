// src/three/CubieMesh.tsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { COLORS, CUBIE_SIZE, SPACING } from '../cube/constants';
import { Cubie } from '../cube/types';

interface Props {
    cubie: Cubie;
    onPress?: (cubie: Cubie, localNormal: THREE.Vector3) => void;
}

const BODY_RADIUS = 0.09;
const PLATE_SIZE = 0.74;
const PLATE_THICK = 0.05;
// Body half-size; plates sit proud of the body surface.
const BODY_HALF = CUBIE_SIZE / 2;
const PLATE_OFF = BODY_HALF + PLATE_THICK / 2 - 0.015;

// Local frame order matching THREE.BoxGeometry: [ +X, -X, +Y, -Y, +Z, -Z ]
const FACE_POS: [number, number, number][] = [
    [PLATE_OFF, 0, 0],
    [-PLATE_OFF, 0, 0],
    [0, PLATE_OFF, 0],
    [0, -PLATE_OFF, 0],
    [0, 0, PLATE_OFF],
    [0, 0, -PLATE_OFF],
];
const FACE_ROT: [number, number, number][] = [
    [0, Math.PI / 2, 0],
    [0, -Math.PI / 2, 0],
    [-Math.PI / 2, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, 0, 0],
    [0, Math.PI, 0],
];

export function CubieMesh({ cubie, onPress }: Props) {
    // Shared across all cubies — same dimensions, so build once.
    const bodyGeom = useMemo(
        () => new RoundedBoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE, 4, BODY_RADIUS),
        []
    );
    const plateGeom = useMemo(
        () => new RoundedBoxGeometry(PLATE_SIZE, PLATE_SIZE, PLATE_THICK, 2, 0.02),
        []
    );
    const bodyMat = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color: '#0d1017',
                roughness: 0.35,
                metalness: 0.15,
            }),
        []
    );
    const plateMats = useMemo(
        () =>
            cubie.stickers.map(
                (color) =>
                    new THREE.MeshStandardMaterial({
                        color,
                        roughness: 0.35,
                        metalness: 0.05,
                    })
            ),
        // stickers never change per cubie
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const pos: [number, number, number] = [
        cubie.position[0] * SPACING,
        cubie.position[1] * SPACING,
        cubie.position[2] * SPACING,
    ];

    return (
        <group position={pos} quaternion={cubie.quaternion}>
            {/* Rounded black plastic body — visible in the seams like a real cube */}
            <mesh geometry={bodyGeom} material={bodyMat} userData={{ cubieId: cubie.id }} />
            {/* Colored caps on visible faces only */}
            {cubie.stickers.map((color, i) =>
                color === COLORS.HIDDEN ? null : (
                    <mesh
                        key={i}
                        geometry={plateGeom}
                        material={plateMats[i]}
                        position={FACE_POS[i]}
                        rotation={FACE_ROT[i]}
                        userData={{ cubieId: cubie.id }}
                    />
                )
            )}
        </group>
    );
}
