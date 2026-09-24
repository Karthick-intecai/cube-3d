import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSoundEffects } from '@/audio/useSoundEffects';
import { useHaptics } from '@/haptics/useHaptics';
import {
    commitPyraTurn,
    PyraSticker,
    PyraTurn,
    turnNotation,
} from '@/pyraminx/geometry';
import { solvePyraminx, stateToPyraStickers } from '@/pyraminx/solver';
import { PyraSolutionScene } from '@/three/PyraSolutionScene';

interface PlayStep {
    turn: PyraTurn;
    label: string;
    phase: string;
}

interface Built {
    initial: PyraSticker[];
    steps: PlayStep[];
}

function buildSolution(state: string): Built {
    const initial = stateToPyraStickers(state);
    const sol = solvePyraminx(initial);
    const steps: PlayStep[] = sol.moves.map((turn, i) => ({
        turn,
        label: sol.labels[i],
        phase: turn.wide ? 'Layers' : 'Tips',
    }));
    return { initial, steps };
}

export default function SolvePyraScreen() {
    const { state } = useLocalSearchParams<{ state?: string }>();
    const stateParam = Array.isArray(state) ? state[0] : (state ?? '');

    const [built, setBuilt] = useState<Built | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [stickers, setStickers] = useState<PyraSticker[]>([]);
    const [stepIdx, setStepIdx] = useState(0);
    const [active, setActive] = useState<PyraTurn | null>(null);
    const [playing, setPlaying] = useState(false);
    const dirRef = useRef<'fwd' | 'back'>('fwd');

    const sfx = useSoundEffects();
    const haptics = useHaptics();

    // Build once per state (PDB builds ~100-200ms once; defer past paint).
    useEffect(() => {
        setBuilt(null);
        setError(null);
        const t = setTimeout(() => {
            try {
                setBuilt(buildSolution(stateParam));
            } catch (e: any) {
                setError(e?.message ?? 'Could not build a solution for this state.');
            }
        }, 60);
        return () => clearTimeout(t);
    }, [stateParam]);

    useEffect(() => {
        if (built) {
            setStickers(built.initial);
            setStepIdx(0);
            setActive(null);
            setPlaying(false);
        }
    }, [built]);

    const moves = built?.steps ?? [];
    const done = built !== null && stepIdx >= moves.length;

    const commitActive = () => {
        if (!active) return;
        // `active` already holds the exact turn (pre-inverted for Prev).
        setStickers((prev) => commitPyraTurn(prev, active));
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

    useEffect(() => {
        if (!playing || active || !built || stepIdx >= moves.length) return;
        const t = setTimeout(startNext, 650);
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
        setStickers(built.initial);
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
                    <View style={styles.backRow}>
                        <Ionicons name="chevron-back" size={20} color="#5eead4" />
                        <Text style={styles.backText}>Entry</Text>
                    </View>
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
                            <Text style={styles.note}>Building your solution…</Text>
                        </>
                    )}
                </View>
            ) : (
                <>
                    <View style={styles.stage}>
                        <PyraSolutionScene stickers={stickers} active={active} onDone={commitActive} />
                        {done && (
                            <View style={styles.doneWrap} pointerEvents="box-none">
                                <View style={styles.doneCard}>
                                <View style={styles.doneTitleRow}>
                                    <Text style={styles.doneTitle}>Solved</Text>
                                    <Ionicons name="checkmark-circle" size={20} color="#5eead4" />
                                </View>
                                    <Text style={styles.note}>Mirror each move on your real pyraminx.</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.moveCard}>
                        <Text style={styles.phase}>{done ? 'Complete' : current?.phase}</Text>
                        {done ? (
                            <Ionicons name="checkmark-circle" size={44} color="#5eead4" />
                        ) : (
                            <Text style={styles.bigMove}>{current?.label}</Text>
                        )}
                        <View style={styles.bar}>
                            <View style={[styles.barFill, { flex: progress }]} />
                            <View style={[styles.barEmpty, { flex: 1 - progress }]} />
                        </View>
                        <Text style={styles.note}>
                            Step {Math.min(stepIdx + 1, moves.length)} of {moves.length} • Hold white-top
                            equivalent: apex up, green front
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
                            style={[styles.secondary, styles.flex, (!!active || stepIdx <= 0) && styles.disabled]}
                            disabled={!!active || stepIdx <= 0}
                            onPress={doPrev}
                        >
                            <View style={styles.btnRow}>
                                <Ionicons name="chevron-back" size={18} color="#dbe4ff" />
                                <Text style={styles.secondaryText}>Prev</Text>
                            </View>
                        </Pressable>
                        <Pressable
                            style={[styles.primary, styles.flex, (!!active || done) && styles.disabled]}
                            disabled={!!active || done}
                            onPress={() => (playing ? setPlaying(false) : setPlaying(true))}
                        >
                            <View style={styles.btnRow}>
                                <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
                                <Text style={styles.primaryText}>{playing ? 'Pause' : 'Play'}</Text>
                            </View>
                        </Pressable>
                        <Pressable
                            style={[styles.secondary, styles.flex, (!!active || done) && styles.disabled]}
                            disabled={!!active || done}
                            onPress={doNext}
                        >
                            <View style={styles.btnRow}>
                                <Text style={styles.secondaryText}>Next</Text>
                                <Ionicons name="chevron-forward" size={18} color="#dbe4ff" />
                            </View>
                        </Pressable>
                    </View>
                    <Pressable style={styles.ghost} onPress={doRestart}>
                        <Text style={styles.ghostText}>Restart from the start</Text>
                    </Pressable>
                    <Text style={styles.legend}>
                        Drag background to orbit • U/L/R/B tips • w = two layers • ' = counter-clockwise
                    </Text>
                </>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 16, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
    back: { paddingVertical: 6, paddingRight: 8 },
    backRow: { flexDirection: 'row', alignItems: 'center' },
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
    btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
    legend: { color: '#7c8ab0', fontSize: 12, textAlign: 'center' },
    error: { color: '#f87171', fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
    doneWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 12 },
    doneCard: {
        backgroundColor: 'rgba(16,24,40,0.92)', borderColor: '#2dd4bf', borderWidth: 1,
        borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', gap: 2,
    },
    doneTitle: { color: '#5eead4', fontSize: 18, fontWeight: '800' },
    doneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
