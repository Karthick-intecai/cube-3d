// src/three/CubeScene.tsx
import { Canvas, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';
import { LayerTurn, layerCoords } from '../cube/types';
import { useCubeStore } from '../store/cubeStore';
import { CubieMesh } from './CubieMesh';
import { OrbitRig } from './OrbitRig';
import { computeLayerTurn, screenSwipeToWorld } from './swipeMath';
import { TurningLayer } from './TurningLayer';
import { usePanControls } from './panControls';

interface Bridge {
    camera: THREE.Camera;
    scene: THREE.Scene;
    raycaster: THREE.Raycaster;
    size: { width: number; height: number };
}

function ContextBridge({ bridge }: { bridge: React.MutableRefObject<Bridge | null> }) {
    const { camera, scene, raycaster, size } = useThree();
    useEffect(() => {
        bridge.current = { camera, scene, raycaster, size };
    }, [camera, scene, raycaster, size, bridge]);
    return null;
}

interface Props {
    onSwipeTurn: (turn: LayerTurn) => void;
    /** When true, face turns are blocked but background orbit still works. */
    lockTurns?: boolean;
}

const CAMERA_RADIUS: Record<number, number> = { 2: 7, 3: 9, 4: 11.5 };

export function CubeScene({ onSwipeTurn, lockTurns = false }: Props) {
    const bridge = useRef<Bridge | null>(null);
    const mode = useRef<'idle' | 'orbit' | 'turn'>('idle');
    const touch = useRef<{
        point: THREE.Vector3;
        normal: THREE.Vector3;
    } | null>(null);

    const theta = useSharedValue(Math.PI / 4);
    const phi = useSharedValue(Math.PI / 3);
    const radius = useSharedValue(9);

    const cubies = useCubeStore((s) => s.cubies);
    const cubeSize = useCubeStore((s) => s.size);
    const active = useCubeStore((s) => s.active);
    const finishActive = useCubeStore((s) => s.finishActive);
    const scrambling = useCubeStore((s) => s.scrambling);
    const turnMs = useCubeStore((s) => s.turnMs);

    const layers = useMemo(() => layerCoords(cubeSize), [cubeSize]);
    const outerExtent = (cubeSize - 1) / 2 + 0.47;
    const coreSize = Math.max(0.05, outerExtent * 2 - 0.9);

    useEffect(() => {
        radius.value = CAMERA_RADIUS[cubeSize] ?? 9;
    }, [cubeSize, radius]);

    // Keep refs of live values so gesture callbacks read the latest
    // without re-creating the gesture every time.
    const activeRef = useRef(active);
    useEffect(() => { activeRef.current = active; }, [active]);
    const lockRef = useRef(lockTurns || scrambling);
    useEffect(() => { lockRef.current = lockTurns || scrambling; }, [lockTurns, scrambling]);
    // Stable callback ref so the memoized gesture never goes stale.
    const onSwipeTurnRef = useRef(onSwipeTurn);
    useEffect(() => { onSwipeTurnRef.current = onSwipeTurn; }, [onSwipeTurn]);

    const handleBegin = (x: number, y: number) => {
        // ⛔ Ignore new gestures while a turn is animating.
        if (activeRef.current !== null) {
            mode.current = 'idle';
            touch.current = null;
            return;
        }
        // Locked (paused/scrambling): allow orbit, but never start a turn.
        if (lockRef.current) {
            touch.current = null;
            mode.current = 'orbit';
            return;
        }

        const b = bridge.current;
        if (!b) return;
        const { camera, scene, raycaster, size } = b;

        // Ensure the camera matrix is up to date before raycasting.
        camera.updateMatrixWorld();

        const ndc = new THREE.Vector2(
            (x / size.width) * 2 - 1,
            -(y / size.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(scene.children, true);

        for (const hit of hits) {
            const id = (hit.object as any).userData?.cubieId;
            if (typeof id === 'number' && hit.face) {
                const worldNormal = hit.face.normal
                    .clone()
                    .transformDirection(hit.object.matrixWorld)
                    .normalize();
                touch.current = { point: hit.point.clone(), normal: worldNormal };
                mode.current = 'turn';
                return;
            }
        }
        touch.current = null;
        mode.current = 'orbit';
    };

    const handleChange = (cx: number, cy: number) => {
        if (mode.current !== 'orbit') return;
        theta.value -= cx * 0.01;
        phi.value = Math.max(0.15, Math.min(Math.PI - 0.15, phi.value - cy * 0.01));
    };

    const handleEnd = (tx: number, ty: number) => {
        if (mode.current !== 'turn' || !touch.current || !bridge.current) {
            mode.current = 'idle';
            return;
        }
        const b = bridge.current;
        const { point, normal } = touch.current;

        const world = screenSwipeToWorld(tx, ty, point, normal, b.camera, b.size);
        if (world) {
            const turn = computeLayerTurn(normal, world, point, layers);
            if (turn) onSwipeTurnRef.current(turn);
        }

        mode.current = 'idle';
        touch.current = null;
    };

    // RN-core responder (not gesture-handler): single-touch activation is
    // unreliable for RNGH Pan on some Android builds. Created once.
    const panHandlers = usePanControls({
        onBegin: handleBegin,
        onChange: handleChange,
        onEnd: handleEnd,
    });

    // Split cubies: those in the active layer (animated) vs the rest.
    const turningIds = new Set<number>();
    if (active) {
        for (const c of cubies) {
            if (c.position[active?.axisIdx] === active?.layer) turningIds.add(c.id);
        }
    }
    const staticCubies = cubies.filter((c) => !turningIds.has(c.id));
    const turningCubies = cubies.filter((c) => turningIds.has(c.id));

    return (
        <View style={StyleSheet.absoluteFill} collapsable={false} {...panHandlers}>
            <Canvas camera={{ position: [5.5, 4.5, 5.5], fov: 42 }}>
                    <ContextBridge bridge={bridge} />
                    <ambientLight intensity={0.9} />
                    <directionalLight position={[6, 8, 5]} intensity={1.1} />
                    <directionalLight position={[-6, -4, -5]} intensity={0.4} />

                    {/* Inner core: fills the seams with black plastic like a real cube.
                        Raycast disabled so swipes through gaps don't grab it. */}
                    <mesh raycast={() => null}>
                        <boxGeometry args={[coreSize, coreSize, coreSize]} />
                        <meshStandardMaterial color="#0d1017" roughness={0.9} metalness={0} />
                    </mesh>

                    {staticCubies.map((c) => (
                        <CubieMesh key={c.id} cubie={c} />
                    ))}

                    {active && (
                        <TurningLayer
                            key={`${active?.axisIdx}-${active?.layer}-${active.prime}-${cubies[0].id}`}
                            cubies={turningCubies}
                            turn={active}
                            durationMs={turnMs}
                            onComplete={finishActive}
                        />
                    )}

                    <OrbitRig theta={theta} phi={phi} radius={radius} />
                </Canvas>
        </View>
    );
}
