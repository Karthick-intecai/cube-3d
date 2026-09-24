// src/three/PyraSolutionScene.tsx
// Presentational animated pyraminx for solution playback.
// Background drag orbits the camera (no face turns here).
import { Canvas } from '@react-three/fiber/native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { PyraSticker, PyraTurn, turnMembers } from '../pyraminx/geometry';
import { OrbitRig } from './OrbitRig';
import { PyraCore, PyraMesh } from './PyraMesh';
import { PyraTurning } from './PyraTurning';

interface Props {
    stickers: PyraSticker[];
    active: PyraTurn | null;
    durationMs?: number;
    onDone: () => void;
}

export function PyraSolutionScene({ stickers, active, durationMs = 300, onDone }: Props) {
    const theta = useSharedValue(0);
    const phi = useSharedValue(1.12);
    const radius = useSharedValue(7.4);

    useEffect(() => {
        theta.value = 0;
        phi.value = 1.12;
        radius.value = 7.4;
    }, [theta, phi, radius]);

    const pan = Gesture.Pan()
        .runOnJS(true)
        .minDistance(4)
        .onChange((e) => {
            theta.value -= e.changeX * 0.01;
            phi.value = Math.max(0.15, Math.min(Math.PI - 0.15, phi.value - e.changeY * 0.01));
        });

    const turningIds = new Set<number>();
    if (active) {
        for (const id of turnMembers(stickers, active)) turningIds.add(id);
    }
    const staticStickers = stickers.filter((s) => !turningIds.has(s.id));
    const turningStickers = stickers.filter((s) => turningIds.has(s.id));

    return (
        <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill} collapsable={false}>
                <Canvas camera={{ position: [0, 2.0, 7.4], fov: 40 }}>
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
                            durationMs={durationMs}
                            onComplete={onDone}
                        />
                    )}

                    <OrbitRig theta={theta} phi={phi} radius={radius} />
                </Canvas>
            </View>
        </GestureDetector>
    );
}
