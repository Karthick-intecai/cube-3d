import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { selectElapsed, useCubeStore } from '@/store/cubeStore';
import { formatTime } from './Timer';

/** Banner shown when a scramble is solved — with final time. */
export function SolvedOverlay() {
    const solved = useCubeStore((s) => s.solved);
    const scrambled = useCubeStore((s) => s.scrambled);
    const scrambling = useCubeStore((s) => s.scrambling);
    // Primitive selectors only (see Timer.tsx): never select an inline object.
    const startedAt = useCubeStore((s) => s.startedAt);
    const finishedAt = useCubeStore((s) => s.finishedAt);
    const paused = useCubeStore((s) => s.paused);
    const pauseStartedAt = useCubeStore((s) => s.pauseStartedAt);
    const pausedMs = useCubeStore((s) => s.pausedMs);
    const scramble = useCubeStore((s) => s.scramble);

    if (!solved || !scrambled || scrambling) return null;

    const ms = selectElapsed({ startedAt, finishedAt, paused, pauseStartedAt, pausedMs }, Date.now());

    return (
        <View style={styles.wrap} pointerEvents="box-none">
            <View style={styles.card}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Solved!</Text>
                    <Ionicons name="checkmark-circle" size={18} color="#5eead4" />
                </View>
                <Text style={styles.time}>{formatTime(ms)}</Text>
                <Pressable style={styles.btn} onPress={scramble}>
                    <View style={styles.btnRow}>
                        <Ionicons name="refresh" size={16} color="#06281f" />
                        <Text style={styles.btnText}>Play again</Text>
                    </View>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 12,
    },
    card: {
        backgroundColor: 'rgba(16, 24, 40, 0.92)',
        borderColor: '#2dd4bf',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 12,
        alignItems: 'center',
        gap: 2,
    },
    title: { color: '#5eead4', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    time: { color: '#f2f6ff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 34 },
    btn: {
        marginTop: 6,
        backgroundColor: '#2dd4bf',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    btnText: { color: '#06281f', fontWeight: '800' },
});
