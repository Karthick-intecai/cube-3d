// src/three/SolutionScene.tsx
// Presentational animated cube for solution playback.
// No gestures: the parent drives `active` turns and commits on `onDone`.
import { Canvas } from '@react-three/fiber/native';
import { StyleSheet, View } from 'react-native';
import { Cubie, LayerTurn } from '../cube/types';
import { CubieMesh } from './CubieMesh';
import { TurningLayer } from './TurningLayer';

interface Props {
    cubies: Cubie[];
    active: LayerTurn | null;
    durationMs?: number;
    onDone: () => void;
}

export function SolutionScene({ cubies, active, durationMs = 260, onDone }: Props) {
    const turningIds = new Set<number>();
    if (active) {
        for (const c of cubies) {
            if (c.position[active.axisIdx] === active.layer) turningIds.add(c.id);
        }
    }
    const staticCubies = cubies.filter((c) => !turningIds.has(c.id));
    const turningCubies = cubies.filter((c) => turningIds.has(c.id));
    const outer = Math.max(0.5, ...cubies.flatMap((c) => c.position.map(Math.abs)));
    const coreSize = Math.max(0.05, (outer + 0.47) * 2 - 0.9);

    return (
        <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Canvas camera={{ position: [5.2, 4.2, 6.4], fov: 40 }}>
                <ambientLight intensity={0.9} />
                <directionalLight position={[6, 8, 5]} intensity={1.1} />
                <directionalLight position={[-6, -4, -5]} intensity={0.4} />

                    <mesh raycast={() => null}>
                        <boxGeometry args={[coreSize, coreSize, coreSize]} />
                        <meshStandardMaterial color="#0d1017" roughness={0.9} metalness={0} />
                    </mesh>

                {staticCubies.map((c) => (
                    <CubieMesh key={c.id} cubie={c} />
                ))}

                {active && (
                    <TurningLayer
                        key={`${active.axisIdx}-${active.layer}-${active.prime}-${cubies[0]?.id ?? 0}`}
                        cubies={turningCubies}
                        turn={active}
                        durationMs={durationMs}
                        onComplete={onDone}
                    />
                )}
            </Canvas>
        </View>
    );
}
