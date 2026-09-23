import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSoundEffects } from '@/audio/useSoundEffects';
import { commitLayerTurn } from '@/cube/turns';
import { Cubie, LayerTurn } from '@/cube/types';
import { parseMoves } from '@/cube/facelets';
import { stateToCubies } from '@/cube/reconstruct';
import { embed2x2In3x3, mapMovesTo2x2 } from '@/cube/twoByTwo';
import { FaceKey } from '@/cube/validate';
import { useHaptics } from '@/haptics/useHaptics';
import { SolutionScene } from '@/three/SolutionScene';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const solver = require('rubiks-cube-solver');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CubeJs = require('cubejs');

const pretty = (s: string) => s.replace(/prime/g, "'");

interface PlayStep {
    turn: LayerTurn;
    label: string;
    phase: string;
}

interface Built {
    initial: Cubie[];
    steps: PlayStep[];
}

let kociembaReady = false;

function buildSolution(state: string, size: 2 | 3): Built {
    if (size === 2) {
        // 2x2 corners embedded in a 3x3, solved with Kociemba (short),
        // moves mapped back onto the 2x2 (middle slices don't move corners).
        const initial = stateToCubies(state, 2);
        const letters: Record<string, string[]> = {};
        (['F', 'R', 'U', 'D', 'L', 'B'] as const).forEach((f, i) => {
            letters[f] = [...state.slice(i * 4, i * 4 + 4)];
        });
        const emb = embed2x2In3x3(letters as Record<FaceKey, string[]>);
        const E: Record<string, string> = {};
        (['F', 'R', 'U', 'D', 'L', 'B'] as const).forEach((f, i) => {
            E[f] = emb.slice(i * 9, i * 9 + 9);
        });
        if (!kociembaReady) {
            CubeJs.initSolver();
            kociembaReady = true;
        }
        const sol: string = CubeJs.fromString(
            (E.U + E.R + E.F + E.D + E.L + E.B).toUpperCase()
        ).solve();
        if (!sol || !sol.trim()) throw new Error('No solution found.');
        const steps: PlayStep[] = [];
        for (const tok of sol.trim().split(/\s+/).filter(Boolean)) {
            for (const turn of mapMovesTo2x2(parseMoves(tok))) {
                steps.push({ turn, label: pretty(tok), phase: 'Solution' });
            }
        }
        return { initial, steps };
    }
    const initial = stateToCubies(state);
    const out = solver(state, { partitioned: true }) as {
        cross: string[]; f2l: string[]; oll: string; pll: string;
    };
    if (!out || !out.cross) throw new Error('No solution found.');
    const groups: { title: string; alg: string }[] = [
        ...out.cross.map((alg, i) => ({ title: `Cross ${i + 1}/4`, alg })),
        ...out.f2l.map((alg, i) => ({ title: `F2L pair ${i + 1}/4`, alg })),
        { title: 'OLL — yellow top', alg: out.oll },
        { title: 'PLL — finish', alg: out.pll },
    ];
    const steps: PlayStep[] = [];
    for (const g of groups) {
        for (const tok of g.alg.split(' ').filter(Boolean)) {
            for (const turn of parseMoves(tok)) {
                steps.push({ turn, label: pretty(tok), phase: g.title });
            }
        }
    }
    return { initial, steps };
}

export default function SolveScreen() {
    const { state, size } = useLocalSearchParams<{ state?: string; size?: string }>();
    const stateParam = Array.isArray(state) ? state[0] : (state ?? '');
    const sizeParam = Array.isArray(size) ? size[0] : (size ?? '3');
    const cubeSize: 2 | 3 = sizeParam === '2' ? 2 : 3;

    const [built, setBuilt] = useState<Built | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState('Building your solution…');

    const [cubies, setCubies] = useState<Cubie[]>([]);
    const [stepIdx, setStepIdx] = useState(0);
    const [active, setActive] = useState<LayerTurn | null>(null);
    const [playing, setPlaying] = useState(false);
    const dirRef = useRef<'fwd' | 'back'>('fwd');

    const sfx = useSoundEffects();
    const haptics = useHaptics();

    // Build once per state (solver blocks ~100-500ms; defer past first paint).
    useEffect(() => {
        setBuilt(null);
        setError(null);
        setStatus(
            cubeSize === 2 && !kociembaReady
                ? 'Preparing 2×2 solver (one-time setup)…'
                : 'Building your solution…'
        );
        const t = setTimeout(() => {
            try {
                setBuilt(buildSolution(stateParam, cubeSize));
            } catch (e: any) {
                setError(e?.message ?? 'Could not build a solution for this state.');
            }
        }, 60);
        return () => clearTimeout(t);
    }, [stateParam, cubeSize]);

    useEffect(() => {
        if (built) {
            setCubies(built.initial);
            setStepIdx(0);
            setActive(null);
            setPlaying(false);
        }
    }, [built]);

    const moves = useMemo(() => built?.steps ?? [], [built]);
    const done = built !== null && stepIdx >= moves.length;

    const commitActive = () => {
        if (!active) return;
        // `active` already holds the exact turn to apply: the forward move
        // for Next, the pre-inverted move for Prev. Apply as-is — flipping
        // here again would re-apply the forward turn and corrupt the cube.
        setCubies((prev) => commitLayerTurn(prev, active));
        setStepIdx((i) => (dirRef.current === 'fwd' ? i + 1 : i - 1));
        setActive(null);
        sfx.turn();
        haptics.turn();
    };

    const startNext = () => {
        if (active || !built || stepIdx >= moves.length) return;
        dirRef.current = 'fwd';
        setActive(moves[stepIdx].turn);
    };
    const startPrev = () => {
        if (active || stepIdx <= 0) return;
        dirRef.current = 'back';
        const t = moves[stepIdx - 1].turn;
        setActive({ ...t, prime: !t.prime });
    };

    // Auto-play: chain the next move shortly after each landing.
    useEffect(() => {
        if (!playing || active || !built || stepIdx >= moves.length) return;
        const t = setTimeout(startNext, 550);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, active, stepIdx, built]);

    useEffect(() => {
        if (built && stepIdx >= moves.length) setPlaying(false);
    }, [built, stepIdx, moves.length]);

    const doNext = () => { setPlaying(false); startNext(); };
    const doPrev = () => { setPlaying(false); startPrev(); };
    const doRestart = () => {
        if (!built) return;
        setCubies(built.initial);
        setStepIdx(0);
        setActive(null);
        setPlaying(false);
    };

    const current = stepIdx < moves.length ? moves[stepIdx] : null;
    const progress = moves.length === 0 ? 0 : stepIdx / moves.length;

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Pressable style={styles.back} onPress={() => router.back()}>
                    <Text style={styles.backText}>‹ Entry</Text>
                </Pressable>
                <Text style={styles.title}>Step-by-step</Text>
            </View>

            {!built ? (
                <View style={styles.center}>
                    {error ? (
                        <>
                            <Text style={styles.error}>{error}</Text>
                            <Pressable style={styles.primary} onPress={() => router.back()}>
                                <Text style={styles.primaryText}>Back to entry</Text>
                            </Pressable>
                        </>
                    ) : (
                        <>
                            <ActivityIndicator size="large" color="#2dd4bf" />
                            <Text style={styles.note}>{status}</Text>
                        </>
                    )}
                </View>
            ) : (
                <>
                    <View style={styles.stage}>
                        <SolutionScene cubies={cubies} active={active} onDone={commitActive} />
                        {done && (
                            <View style={styles.doneWrap} pointerEvents="box-none">
                                <View style={styles.doneCard}>
                                    <Text style={styles.doneTitle}>Solved ✓</Text>
                                    <Text style={styles.note}>Mirror each move on your real cube.</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.moveCard}>
                        <Text style={styles.phase}>{done ? 'Complete' : current?.phase}</Text>
                        <Text style={styles.bigMove}>{done ? '✓' : current?.label}</Text>
                        <View style={styles.bar}>
                            <View style={[styles.barFill, { flex: progress }]} />
                            <View style={[styles.barEmpty, { flex: 1 - progress }]} />
                        </View>
                        <Text style={styles.note}>
                            Step {Math.min(stepIdx + 1, moves.length)} of {moves.length} • Hold your cube
                            white-top, green-front
                        </Text>
                    </View>

                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.strip}
                        contentContainerStyle={styles.stripPad}
                    >
                        {moves.map((m, i) => (
                            <View
                                key={i}
                                style={[styles.chip, i === stepIdx && styles.chipActive, i < stepIdx && styles.chipDone]}
                            >
                                <Text style={[styles.chipText, i === stepIdx && styles.chipTextActive]}>
                                    {m.label}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>

                    <View style={styles.controls}>
                        <Pressable
                            style={[styles.secondary, styles.flex, (active || stepIdx <= 0) && styles.disabled]}
                            disabled={!!active || stepIdx <= 0}
                            onPress={doPrev}
                        >
                            <Text style={styles.secondaryText}>‹ Prev</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.primary, styles.flex, (!!active || done) && styles.disabled]}
                            disabled={!!active || done}
                            onPress={() => (playing ? setPlaying(false) : setPlaying(true))}
                        >
                            <Text style={styles.primaryText}>{playing ? 'Pause' : 'Play'}</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.secondary, styles.flex, (!!active || done) && styles.disabled]}
                            disabled={!!active || done}
                            onPress={doNext}
                        >
                            <Text style={styles.secondaryText}>Next ›</Text>
                        </Pressable>
                    </View>
                    <Pressable style={styles.ghost} onPress={doRestart}>
                        <Text style={styles.ghostText}>Restart from the start</Text>
                    </Pressable>
                </>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 16, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
    back: { paddingVertical: 6, paddingRight: 8 },
    backText: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
    title: { color: '#f2f6ff', fontSize: 22, fontWeight: '800' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    stage: {
        flex: 1,
        backgroundColor: '#101527',
        borderColor: '#232c4d',
        borderWidth: 1,
        borderRadius: 20,
        overflow: 'hidden',
        minHeight: 280,
    },
    moveCard: {
        backgroundColor: '#141a2e',
        borderColor: '#2dd4bf',
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        gap: 6,
    },
    phase: { color: '#5eead4', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
    bigMove: { color: '#f2f6ff', fontSize: 44, fontWeight: '800', lineHeight: 50 },
    bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', width: '100%', backgroundColor: '#232c4d' },
    barFill: { backgroundColor: '#2dd4bf' },
    barEmpty: { backgroundColor: 'transparent' },
    note: { color: '#7c8ab0', fontSize: 12, fontWeight: '600', textAlign: 'center' },
    strip: { maxHeight: 44 },
    stripPad: { gap: 6, alignItems: 'center', paddingVertical: 4 },
    chip: {
        backgroundColor: '#1a2340', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
        borderWidth: 1, borderColor: '#2c3a67',
    },
    chipActive: { backgroundColor: '#2dd4bf', borderColor: '#2dd4bf' },
    chipDone: { opacity: 0.5 },
    chipText: { color: '#f2f6ff', fontWeight: '700' },
    chipTextActive: { color: '#06281f' },
    controls: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    primary: { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    secondary: {
        backgroundColor: '#1a2340', borderColor: '#2c3a67', borderWidth: 1,
        borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    },
    secondaryText: { color: '#dbe4ff', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.45 },
    ghost: { alignItems: 'center', paddingVertical: 4 },
    ghostText: { color: '#5eead4', fontWeight: '700' },
    error: { color: '#f87171', fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
    doneWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12 },
    doneCard: {
        backgroundColor: 'rgba(16,24,40,0.92)', borderColor: '#2dd4bf', borderWidth: 1,
        borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', gap: 2,
    },
    doneTitle: { color: '#5eead4', fontSize: 18, fontWeight: '800' },
});
