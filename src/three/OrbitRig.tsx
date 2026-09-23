// src/three/OrbitRig.tsx
import { useFrame, useThree } from '@react-three/fiber/native';
import { useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import * as THREE from 'three';

interface Props {
    theta: SharedValue<number>;
    phi: SharedValue<number>;
    radius: SharedValue<number>;
}

export function OrbitRig({ theta, phi, radius }: Props) {
    const { camera } = useThree();
    const target = useRef(new THREE.Vector3(0, 0, 0));

    useFrame(() => {
        const t = theta.value;
        const p = phi.value;
        const r = radius.value;
        const sinP = Math.sin(p);

        camera.position.set(
            r * sinP * Math.sin(t),
            r * Math.cos(p),
            r * sinP * Math.cos(t)
        );
        camera.lookAt(target.current);
    });

    return null;
}