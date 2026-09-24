import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSoundEffects } from '@/audio/useSoundEffects';
import { ThemedText } from '@/components/themed-text';
import { SolvedOverlay } from '@/components/ui/SolvedOverlay';
import { Timer } from '@/components/ui/Timer';
import { LayerTurn } from '@/cube/types';
import { useHaptics } from '@/haptics/useHaptics';
import { CubeSize, useCubeStore } from '@/store/cubeStore';
import { useCubeEvents } from '@/store/useCubeEvents';
import { CubeScene } from '@/three/CubeScene';

const PARAM_TO_SIZE: Record<string, CubeSize> = { '2x2': 2, '3x3': 3, '4x4': 4 };
const SIZE_TO_NAME: Record<CubeSize, string> = { 2: '2x2 Pocket', 3: '3x3 Classic', 4: '4x4 Revenge' };

export default function PlayScreen() {
    useCubeEvents();

    const { cube } = useLocalSearchParams<{ cube?: string }>();
    const size: CubeSize = PARAM_TO_SIZE[Array.isArray(cube) ? cube[0] : (cube ?? '3x3')] ?? 3;

    const setSize = useCubeStore((s) => s.setSize);
    const scramble = useCubeStore((s) => s.scramble);
    const undo = useCubeStore((s) => s.undo);
    const pause = useCubeStore((s) => s.pause);
    const resume = useCubeStore((s) => s.resume);
    const paused = useCubeStore((s) => s.paused);
    const scrambling = useCubeStore((s) => s.scrambling);
    const solved = useCubeStore((s) => s.solved);
    const scrambled = useCubeStore((s) => s.scrambled);
    const historyLen = useCubeStore((s) => s.history.length);
    const canUndo = useCubeStore(
        (s) => s.history.length > 0 && s.active === null && !s.scrambling && !s.paused
    );

    const sfx = useSoundEffects();
    const haptics = useHaptics();

    // Fresh cube → show it solved for 1s → auto-scramble.
    useEffect(() => {
        setSize(size);
        const t = setTimeout(() => {
            useCubeStore.getState().scramble();
        }, 1000);
        return () => clearTimeout(t);
    }, [size, setSize]);

    const doUndo = () => { undo(); sfx.undo(); haptics.tap(); };
    const doPauseResume = () => {
        if (paused) { resume(); haptics.tap(); }
        else { pause(); sfx.reset(); haptics.heavy(); }
    };
    const onSwipeTurn = (turn: LayerTurn) => {
        useCubeStore.getState().enqueue(turn); // sound + haptic via useCubeEvents
    };

    const status = scrambling
        ? 'SCRAMBLING…'
        : paused
          ? 'PAUSED'
          : solved && scrambled
            ? 'SOLVED'
            : scrambled
              ? 'SOLVE IT'
              : 'READY';

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Pressable style={styles.back} onPress={() => router.back()}>
                    <View style={styles.backRow}>
                        <Ionicons name="chevron-back" size={20} color="#5eead4" />
                        <Text style={styles.backText}>Cubes</Text>
                    </View>
                </Pressable>
                <Text style={styles.title}>{SIZE_TO_NAME[size]}</Text>
            </View>

            <View style={styles.stats}>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>TIME</ThemedText>
                    <Timer />
                </View>
            </View>
            <View style={styles.statRow}>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>MOVES</ThemedText>
                    <ThemedText style={styles.statValue} numberOfLines={1}>
                        {historyLen}
                    </ThemedText>
                </View>
                <View style={[styles.statCard, styles.statusCard]}>
                    <ThemedText style={styles.statLabel}>STATUS</ThemedText>
                    <ThemedText style={styles.statusValue} numberOfLines={1}>
                        {status}
                    </ThemedText>
                </View>
            </View>

            <View style={styles.stage}>
                <CubeScene onSwipeTurn={onSwipeTurn} lockTurns={paused} />
                <SolvedOverlay />
                <ThemedText style={styles.hint}>
                    {scrambling
                        ? 'Scrambling…'
                        : paused
                          ? 'Paused — drag to look around'
                          : 'Swipe a face to turn • Drag background to orbit'}
                </ThemedText>
            </View>

            <View style={styles.controls}>
                <Pressable
                    style={[styles.secondary, styles.controlFlex, !canUndo && styles.disabled]}
                    onPress={doUndo}
                    disabled={!canUndo}
                >
                    <View style={styles.btnRow}>
                        <Ionicons name="arrow-undo" size={18} color="#dbe4ff" />
                        <ThemedText style={styles.secondaryText} numberOfLines={1}>Undo</ThemedText>
                    </View>
                </Pressable>
                <Pressable
                    style={[styles.primary, styles.controlFlex, scrambling && styles.disabled]}
                    onPress={doPauseResume}
                    disabled={scrambling}
                >
                    <View style={styles.btnRow}>
                        <Ionicons name={paused ? 'play' : 'pause'} size={18} color="#fff" />
                        <ThemedText style={styles.primaryText} numberOfLines={1}>
                            {paused ? 'Play' : 'Pause'}
                        </ThemedText>
                    </View>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 16, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
    back: { paddingVertical: 6, paddingRight: 8 },
    backRow: { flexDirection: 'row', alignItems: 'center' },
    backText: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
    title: { color: '#f2f6ff', fontSize: 22, fontWeight: '800' },
    stats: { flexDirection: 'row', gap: 12 },
    statRow: { flexDirection: 'row', gap: 12 },
    statCard: {
        backgroundColor: '#141a2e',
        borderColor: '#232c4d',
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flex: 1,
    },
    statLabel: { color: '#7c8ab0', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
    statValue: { color: '#f2f6ff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 34 },
    statusCard: { borderColor: '#2dd4bf' },
    statusValue: { color: '#5eead4', fontSize: 14, fontWeight: '800', letterSpacing: 1, lineHeight: 20 },
    stage: {
        flex: 1,
        backgroundColor: '#101527',
        borderColor: '#232c4d',
        borderWidth: 1,
        borderRadius: 20,
        overflow: 'hidden',
    },
    hint: { textAlign: 'center', color: '#7c8ab0', fontSize: 12, paddingBottom: 10 },
    controls: { flexDirection: 'row', gap: 10, paddingBottom: 8 },
    controlFlex: { flex: 1 },
    btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    primary: {
        backgroundColor: '#3b82f6',
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
    secondary: {
        backgroundColor: '#1a2340',
        borderColor: '#2c3a67',
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryText: { color: '#dbe4ff', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.45 },
});
