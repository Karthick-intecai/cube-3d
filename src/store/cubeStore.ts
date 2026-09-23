// src/store/cubeStore.ts
import { create } from 'zustand';
import { SCRAMBLE_TURN_MS, TURN_DURATION_MS } from '../cube/constants';
import { createSolvedCube } from '../cube/createCube';
import { randomScramble } from '../cube/scramble';
import { isSolved } from '../cube/solveCheck';
import { commitLayerTurn } from '../cube/turns';
import { faceToLayer } from '../cube/types';
import { Cubie, LayerTurn } from '../cube/types';

export const CUBE_SIZES = [2, 3, 4] as const;
export type CubeSize = (typeof CUBE_SIZES)[number];

const SCRAMBLE_LENGTHS: Record<CubeSize, number> = { 2: 12, 3: 20, 4: 40 };

interface CubeState {
    cubies: Cubie[];
    size: CubeSize;
    queue: LayerTurn[];           // pending turns
    active: LayerTurn | null;     // currently animating
    history: LayerTurn[];         // user turns only (scramble moves excluded)
    solved: boolean;
    scrambled: boolean;
    /** True while an animated scramble is playing. Input is locked. */
    scrambling: boolean;
    /** Paused: orbit allowed, face turns blocked, timer frozen. */
    paused: boolean;
    /** Current per-turn animation length in ms (fast during scramble). */
    turnMs: number;
    startedAt: number | null;
    finishedAt: number | null;
    pauseStartedAt: number | null;
    pausedMs: number;

    setSize: (n: CubeSize) => void;
    enqueue: (t: LayerTurn) => void;
    finishActive: () => void;
    /** Animated scramble: resets to solved then plays turns visibly. */
    scramble: () => void;
    reset: () => void;
    undo: () => void;
    pause: () => void;
    resume: () => void;
}

function freshState(size: CubeSize) {
    return {
        cubies: createSolvedCube(size),
        size,
        queue: [] as LayerTurn[],
        active: null as LayerTurn | null,
        history: [] as LayerTurn[],
        solved: true,
        scrambled: false,
        scrambling: false,
        paused: false,
        turnMs: TURN_DURATION_MS,
        startedAt: null as number | null,
        finishedAt: null as number | null,
        pauseStartedAt: null as number | null,
        pausedMs: 0,
    };
}

export const useCubeStore = create<CubeState>((set, get) => ({
    ...freshState(3),

    setSize: (n) => set({ ...freshState(n) }),

    enqueue: (t) => {
        const { active, queue, scrambling, paused } = get();
        // Lock user turns while a scramble is playing or paused.
        if (scrambling || paused) return;
        if (active) {
            set({ queue: [...queue, t] });
        } else {
            set({ active: t });
        }
    },

    finishActive: () => {
        const { active, cubies, queue, history, startedAt, scrambling } = get();
        if (!active) return;

        const next = commitLayerTurn(cubies, active);
        const solved = isSolved(next);
        const remaining = queue;
        const wasSolved = get().solved;

        if (scrambling) {
            // Scramble moves don't count as history and don't start the timer.
            const done = remaining.length === 0;
            set({
                cubies: next,
                active: null,
                solved,
                finishedAt: null,
                // Keep scrambling until the last queued move lands.
                scrambling: !done,
                turnMs: done ? TURN_DURATION_MS : SCRAMBLE_TURN_MS,
                scrambled: done ? true : get().scrambled,
                startedAt: null,
            });
            if (!done) {
                set({ active: remaining[0], queue: remaining.slice(1) });
            }
            return;
        }

        // Timer: (re)start when the cube leaves the solved state,
        // stop when it returns to solved. Works with or without a scramble.
        const now = Date.now();
        let newStartedAt = startedAt;
        let finishedAt: number | null = get().finishedAt;
        if (!solved) {
            newStartedAt = wasSolved ? now : (startedAt ?? now);
            finishedAt = null;
        } else {
            finishedAt = newStartedAt !== null ? now : null;
        }

        set({
            cubies: next,
            active: null,
            history: [...history, active],
            queue,
            solved,
            startedAt: newStartedAt,
            finishedAt,
        });

        // auto-start the next queued turn
        if (remaining.length > 0) {
            set({ active: remaining[0], queue: remaining.slice(1) });
        }
    },

    scramble: () => {
        const { scrambling, active, size } = get();
        if (scrambling || active) return;
        const moves = randomScramble(SCRAMBLE_LENGTHS[size]).map((m) =>
            faceToLayer(m.face, m.prime, size)
        );
        if (moves.length === 0) return;
        // Reset to solved, then play the scramble through the animation
        // pipeline so it looks like a real cube being scrambled.
        set({
            cubies: createSolvedCube(size),
            queue: moves.slice(1),
            active: moves[0],
            history: [],
            solved: true, // will flip false as moves land
            scrambled: false,
            scrambling: true,
            paused: false,
            turnMs: SCRAMBLE_TURN_MS,
            startedAt: null,
            finishedAt: null,
            pauseStartedAt: null,
            pausedMs: 0,
        });
    },

    reset: () => set({ ...freshState(get().size) }),

    undo: () => {
        const { history, cubies, active, scrambling, paused } = get();
        if (active || scrambling || paused || history.length === 0) return;
        const last = history[history.length - 1];
        // inverse turn: same axis/layer, opposite direction
        const inverse: LayerTurn = { axisIdx: last.axisIdx, layer: last.layer, prime: !last.prime };
        const next = commitLayerTurn(cubies, inverse);
        set({
            cubies: next,
            history: history.slice(0, -1),
            solved: isSolved(next),
            finishedAt: null,
        });
    },

    pause: () => {
        const { paused, scrambling } = get();
        if (paused || scrambling) return;
        set({ paused: true, pauseStartedAt: Date.now() });
    },

    resume: () => {
        const { paused, pauseStartedAt, pausedMs } = get();
        if (!paused) return;
        set({
            paused: false,
            pauseStartedAt: null,
            pausedMs: pauseStartedAt !== null ? pausedMs + (Date.now() - pauseStartedAt) : pausedMs,
        });
    },
}));

/** Elapsed solve time in ms, excluding paused time. */
export interface TimingSnapshot {
    startedAt: number | null;
    finishedAt: number | null;
    paused: boolean;
    pauseStartedAt: number | null;
    pausedMs: number;
}

export function selectElapsed(t: TimingSnapshot, now: number): number {
    if (t.startedAt === null) return 0;
    const end = t.finishedAt ?? (t.paused && t.pauseStartedAt !== null ? t.pauseStartedAt : now);
    return Math.max(0, end - t.startedAt - t.pausedMs);
}
