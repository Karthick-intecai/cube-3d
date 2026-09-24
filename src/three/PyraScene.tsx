// src/three/PyraScene.tsx
import { Canvas, useThree } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';
import { homeLayout, PyraTurn, turnMembers, VERTICES } from '../pyraminx/geometry';
import { usePyraStore } from '../pyraminx/pyraStore';
import { OrbitRig } from './OrbitRig';
import { usePanControls } from './panControls';
import { PyraCore, PyraMesh } from './PyraMesh';
import { PyraTurning } from './PyraTurning';

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

/** Project a world tangent basis to screen and solve the swipe into it. */
function swipeToWorld(
    dx: number, dy: number,
    touchPoint: THREE.Vector3,
    normal: THREE.Vector3,
    camera: THREE.Camera,
    size: { width: number; height: number }
): THREE.Vector3 | null {
    const up = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(normal, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(normal, t1).normalize();
    const eps = 0.05;
    const p0 = touchPoint.clone().project(camera);
    const p1 = touchPoint.clone().addScaledVector(t1, eps).project(camera);
    const p2 = touchPoint.clone().addScaledVector(t2, eps).project(camera);
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const v1 = new THREE.Vector2((p1.x - p0.x) * halfW, -(p1.y - p0.y) * halfH);
    const v2 = new THREE.Vector2((p2.x - p0.x) * halfW, -(p2.y - p0.y) * halfH);
    const det = v1.x * v2.y - v1.y * v2.x;
    if (Math.abs(det) < 1e-6) return null;
    const a = (dx * v2.y - dy * v2.x) / det;
    const b = (v1.x * dy - v1.y * dx) / det;
    const world = t1.clone().multiplyScalar(a).addScaledVector(t2, b);
    if (world.lengthSq() < 1e-8) return null;
    return world.normalize();
}

/** Decide the pyraminx turn for a swipe: nearest vertex, tip vs wide, direction. */
function computePyraTurn(
    worldSwipe: THREE.Vector3,
    touchPoint: THREE.Vector3,
    tipThresh: number
): PyraTurn {
    let vertex: 0 | 1 | 2 | 3 = 0;
    let best = Infinity;
    VERTICES.forEach((v, i) => {
        const d = touchPoint.distanceTo(new THREE.Vector3(...v));
        if (d < best) { best = d; vertex = i as 0 | 1 | 2 | 3; }
    });
    const v = new THREE.Vector3(...VERTICES[vertex]);
    const axis = v.clone().normalize();
    const r = touchPoint.clone().sub(v);
    const s = axis.dot(new THREE.Vector3().crossVectors(r, worldSwipe));
    return { vertex, wide: best >= tipThresh, prime: s > 0 };
}

interface Props {
    onSwipeTurn: (turn: PyraTurn) => void;
    lockTurns?: boolean;
}

export function PyraScene({ onSwipeTurn, lockTurns = false }: Props) {
    const bridge = useRef<Bridge | null>(null);
    const mode = useRef<'idle' | 'orbit' | 'turn'>('idle');
    const touch = useRef<{ point: THREE.Vector3; normal: THREE.Vector3 } | null>(null);

    const theta = useSharedValue(0);
    const phi = useSharedValue(1.12);
    const radius = useSharedValue(7.6);

    const stickers = usePyraStore((s) => s.stickers);
    const active = usePyraStore((s) => s.active);
    const finishActive = usePyraStore((s) => s.finishActive);
    const scrambling = usePyraStore((s) => s.scrambling);
    const turnMs = usePyraStore((s) => s.turnMs);
    const tipThresh = useMemo(() => homeLayout().tipThresh, []);

    const activeRef = useRef(active);
    useEffect(() => { activeRef.current = active; }, [active]);
    const lockRef = useRef(lockTurns || scrambling);
    useEffect(() => { lockRef.current = lockTurns || scrambling; }, [lockTurns, scrambling]);
    const stickersRef = useRef(stickers);
    useEffect(() => { stickersRef.current = stickers; }, [stickers]);
    // Stable callback ref so the memoized gesture never goes stale.
    const onSwipeTurnRef = useRef(onSwipeTurn);
    useEffect(() => { onSwipeTurnRef.current = onSwipeTurn; }, [onSwipeTurn]);

    const handleBegin = (x: number, y: number) => {
        if (activeRef.current !== null) {
            mode.current = 'idle';
            touch.current = null;
            return;
        }
        if (lockRef.current) {
            touch.current = null;
            mode.current = 'orbit';
            return;
        }
        const b = bridge.current;
        if (!b) return;
        const { camera, scene, raycaster, size } = b;
        camera.updateMatrixWorld();
        const ndc = new THREE.Vector2(
            (x / size.width) * 2 - 1,
            -(y / size.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(scene.children, true);
        for (const hit of hits) {
            const id = (hit.object as any).userData?.stickerId;
            if (typeof id === 'number' && hit.face) {
                const st = stickersRef.current.find((s) => s.id === id);
                if (!st) continue;
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
        const world = swipeToWorld(tx, ty, point, normal, b.camera, b.size);
        if (world) {
            onSwipeTurnRef.current(computePyraTurn(world, point, tipThresh));
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

    const turningIds = useMemo(() => {
        const set = new Set<number>();
        if (active) {
            for (const id of turnMembers(stickers, active)) set.add(id);
        }
        return set;
    }, [stickers, active]);
    const staticStickers = stickers.filter((s) => !turningIds.has(s.id));
    const turningStickers = stickers.filter((s) => turningIds.has(s.id));

    return (
        <View style={StyleSheet.absoluteFill} collapsable={false} {...panHandlers}>
            <Canvas camera={{ position: [0, 2.2, 7.6], fov: 40 }}>
                    <ContextBridge bridge={bridge} />
                    <ambientLight intensity={0.45} />
                    <hemisphereLight args={['#cdd8ff', '#14161f', 0.55]} />
                    <directionalLight position={[6, 8, 5]} intensity={1.6} />
                    <directionalLight position={[-7, 3, -6]} intensity={0.55} color="#9db8ff" />
                    <directionalLight position={[-2, -5, 4]} intensity={0.3} />

                    <PyraCore />

                    {staticStickers.map((s) => (
                        <PyraMesh key={s.id} sticker={s} />
                    ))}

                    {active && (
                        <PyraTurning
                            key={`${active.vertex}-${active.wide}-${active.prime}-${stickers[0]?.id ?? 0}`}
                            stickers={turningStickers}
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
