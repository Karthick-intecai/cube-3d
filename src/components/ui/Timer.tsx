import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { selectElapsed, useCubeStore } from '@/store/cubeStore';

/** Live speedcube timer. Runs from first turn until solved, frozen while paused. */
export function Timer() {
    'use no memo';
    // Primitive selectors only: an inline object selector returns a new
    // reference every snapshot and trips React's getSnapshot cache guard.
    const startedAt = useCubeStore((s) => s.startedAt);
    const finishedAt = useCubeStore((s) => s.finishedAt);
    const paused = useCubeStore((s) => s.paused);
    const pauseStartedAt = useCubeStore((s) => s.pauseStartedAt);
    const pausedMs = useCubeStore((s) => s.pausedMs);
    const [now, setNow] = useState(() => Date.now());

    // Always tick while mounted: recomputes from the store every 100ms,
    // so the display can never get stuck by a missed subscription update.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(id);
    }, []);

    const ms = selectElapsed({ startedAt, finishedAt, paused, pauseStartedAt, pausedMs }, now);

    return <Text style={styles.timer}>{formatTime(ms)}</Text>;
}

export function formatTime(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centis = Math.floor((ms % 1000) / 10);
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return minutes > 0
        ? `${minutes}:${pad(seconds)}.${pad(centis)}`
        : `${seconds}.${pad(centis)}`;
}

const styles = StyleSheet.create({
    timer: {
        color: '#f2f6ff',
        fontSize: 40,
        lineHeight: 44,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
        letterSpacing: 1,
    },
});
