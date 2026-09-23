import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSoundEffects } from '@/audio/useSoundEffects';
import { ThemedText } from '@/components/themed-text';
import { formatTime } from '@/components/ui/Timer';
import { useHaptics } from '@/haptics/useHaptics';
import { turnNotation } from '@/pyraminx/geometry';
import { selectPyraElapsed, usePyraStore } from '@/pyraminx/pyraStore';
import { PyraScene } from '@/three/PyraScene';
import { PyraTurn } from '@/pyraminx/geometry';

function PyraTimer() {
    'use no memo';
    const startedAt = usePyraStore((s) => s.startedAt);
    const finishedAt = usePyraStore((s) => s.finishedAt);
    void startedAt;
    void finishedAt;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, []);
    return <Text style={styles.timer}>{formatTime(selectPyraElapsed(now))}</Text>;
}

export default function PyraminxScreen() {
    const scramble = usePyraStore((s) => s.scramble);
    const reset = usePyraStore((s) => s.reset);
    const undo = usePyraStore((s) => s.undo);
    const pause = usePyraStore((s) => s.pause);
    const resume = usePyraStore((s) => s.resume);
    const paused = usePyraStore((s) => s.paused);
    const scrambling = usePyraStore((s) => s.scrambling);
    const solved = usePyraStore((s) => s.solved);
    const scrambled = usePyraStore((s) => s.scrambled);
    const historyLen = usePyraStore((s) => s.history.length);
    const lastMove = usePyraStore((s) => s.history[s.history.length - 1]);
    const canUndo = usePyraStore(
        (s) => s.history.length > 0 && s.active === null && !s.scrambling && !s.paused
    );

    const sfx = useSoundEffects();
    const haptics = useHaptics();

    // Turn sounds + win fanfare for pyraminx turns.
    const active = usePyraStore((s) => s.active);
    const prevActive = useRef(active);
    const prevSolved = useRef(solved);
    useEffect(() => {
        if (active && active !== prevActive.current) {
            sfx.turn();
            haptics.turn();
        }
        prevActive.current = active;
        if (solved && !prevSolved.current) {
            sfx.win();
            haptics.success();
        }
        prevSolved.current = solved;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, solved]);

    // Fresh pyramid → show it solved for 1s → auto-scramble.
    useEffect(() => {
        reset();
        const t = setTimeout(() => {
            usePyraStore.getState().scramble();
        }, 1000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doUndo = () => { undo(); sfx.undo(); haptics.tap(); };
    const doPauseResume = () => {
        if (paused) { resume(); haptics.tap(); }
        else { pause(); sfx.reset(); haptics.heavy(); }
    };
    const onSwipeTurn = (turn: PyraTurn) => {
        usePyraStore.getState().enqueue(turn);
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
                    <Text style={styles.backText}>‹ Cubes</Text>
                </Pressable>
                <Text style={styles.title}>Pyraminx</Text>
            </View>

            <View style={styles.stats}>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>TIME</ThemedText>
                    <PyraTimer />
                </View>
            </View>
            <View style={styles.statRow}>
                <View style={styles.statCard}>
                    <ThemedText style={styles.statLabel}>MOVES</ThemedText>
                    <ThemedText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                        {historyLen}
                    </ThemedText>
                </View>
                <View style={[styles.statCard, styles.statusCard]}>
                    <ThemedText style={styles.statLabel}>STATUS</ThemedText>
                    <ThemedText
                        style={styles.statusValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                    >
                        {status}
                    </ThemedText>
                </View>
            </View>

            <View style={styles.stage}>
                <PyraScene onSwipeTurn={onSwipeTurn} lockTurns={paused} />
                <ThemedText style={styles.hint}>
                    {scrambling
                        ? 'Scrambling…'
                        : paused
                          ? 'Paused — drag to look around'
                          : 'Swipe a face to turn • Drag background to orbit'}
                </ThemedText>
            </View>

            {lastMove && (
                <ThemedText style={styles.lastMove}>
                    Last move: {turnNotation(lastMove)}
                </ThemedText>
            )}

            <View style={styles.controls}>
                <Pressable
                    style={[styles.secondary, styles.controlFlex, !canUndo && styles.disabled]}
                    onPress={doUndo}
                    disabled={!canUndo}
                >
                    <ThemedText style={styles.secondaryText} numberOfLines={1}>Undo</ThemedText>
                </Pressable>
                <Pressable
                    style={[styles.primary, styles.controlFlex, scrambling && styles.disabled]}
                    onPress={doPauseResume}
                    disabled={scrambling}
                >
                    <ThemedText style={styles.primaryText} numberOfLines={1}>
                        {paused ? 'Play' : 'Pause'}
                    </ThemedText>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 16, gap: 12 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
    back: { paddingVertical: 6, paddingRight: 8 },
    backText: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
    title: { color: '#f2f6ff', fontSize: 22, fontWeight: '800' },
    timer: {
        color: '#f2f6ff', fontSize: 40, lineHeight: 44,
        fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 1,
    },
    stats: { flexDirection: 'row', gap: 12 },
    statRow: { flexDirection: 'row', gap: 12 },
    statCard: {
        backgroundColor: '#141a2e', borderColor: '#232c4d', borderWidth: 1,
        borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flex: 1,
    },
    statLabel: { color: '#7c8ab0', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
    statValue: { color: '#f2f6ff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], lineHeight: 34 },
    statusCard: { borderColor: '#2dd4bf' },
    statusValue: { color: '#5eead4', fontSize: 16, fontWeight: '800', letterSpacing: 1, lineHeight: 22 },
    stage: {
        flex: 1, backgroundColor: '#101527', borderColor: '#232c4d',
        borderWidth: 1, borderRadius: 20, overflow: 'hidden',
    },
    hint: { textAlign: 'center', color: '#7c8ab0', fontSize: 12, paddingBottom: 10 },
    lastMove: { textAlign: 'center', color: '#5eead4', fontSize: 13, fontWeight: '700' },
    controls: { flexDirection: 'row', gap: 10, paddingBottom: 8 },
    controlFlex: { flex: 1 },
    primary: {
        backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16,
        paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
    secondary: {
        backgroundColor: '#1a2340', borderColor: '#2c3a67', borderWidth: 1,
        borderRadius: 14, paddingVertical: 16, paddingHorizontal: 8,
        alignItems: 'center', justifyContent: 'center',
    },
    secondaryText: { color: '#dbe4ff', fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.45 },
});
