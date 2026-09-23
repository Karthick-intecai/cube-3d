// src/pyraminx/pyraStore.ts
import { create } from 'zustand';
import { selectElapsed, TimingSnapshot } from '../store/cubeStore';
import {
    commitPyraTurn,
    homeLayout,
    invertTurn,
    isPyraSolved,
    PyraSticker,
    PyraTurn,
    randomPyraScramble,
    TURN_MS,
} from './geometry';

interface PyraState {
    stickers: PyraSticker[];
    queue: PyraTurn[];
    active: PyraTurn | null;
    history: PyraTurn[];
    solved: boolean;
    scrambled: boolean;
    scrambling: boolean;
    paused: boolean;
    turnMs: number;
    startedAt: number | null;
    finishedAt: number | null;
    pauseStartedAt: number | null;
    pausedMs: number;

    enqueue: (t: PyraTurn) => void;
    finishActive: () => void;
    scramble: () => void;
    reset: () => void;
    undo: () => void;
    pause: () => void;
    resume: () => void;
}

const SCRAMBLE_TURNS = 14;

function freshState(): Omit<PyraState, 'enqueue' | 'finishActive' | 'scramble' | 'reset' | 'undo' | 'pause' | 'resume'> {
    return {
        stickers: homeLayout().stickers.map((s) => ({ ...s })),
        queue: [],
        active: null,
        history: [],
        solved: true,
        scrambled: false,
        scrambling: false,
        paused: false,
        turnMs: TURN_MS,
        startedAt: null,
        finishedAt: null,
        pauseStartedAt: null,
        pausedMs: 0,
    };
}

export const usePyraStore = create<PyraState>((set, get) => ({
    ...freshState(),

    enqueue: (t) => {
        const { active, queue, scrambling, paused } = get();
        if (scrambling || paused) return;
        if (active) {
            set({ queue: [...queue, t] });
        } else {
            set({ active: t });
        }
    },

    finishActive: () => {
        const { active, stickers, queue, history, startedAt, scrambling } = get();
        if (!active) return;

        const next = commitPyraTurn(stickers, active);
        const solved = isPyraSolved(next);
        const remaining = queue;
        const wasSolved = get().solved;

        if (scrambling) {
            const done = remaining.length === 0;
            set({
                stickers: next,
                active: null,
                solved,
                finishedAt: null,
                scrambling: !done,
                scrambled: done ? true : get().scrambled,
                startedAt: null,
            });
            if (!done) {
                set({ active: remaining[0], queue: remaining.slice(1) });
            }
            return;
        }

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
            stickers: next,
            active: null,
            history: [...history, active],
            queue,
            solved,
            startedAt: newStartedAt,
            finishedAt,
        });

        if (remaining.length > 0) {
            set({ active: remaining[0], queue: remaining.slice(1) });
        }
    },

    scramble: () => {
        const { scrambling, active } = get();
        if (scrambling || active) return;
        const moves = randomPyraScramble(SCRAMBLE_TURNS);
        if (moves.length === 0) return;
        set({
            stickers: homeLayout().stickers.map((s) => ({ ...s })),
            queue: moves.slice(1),
            active: moves[0],
            history: [],
            solved: true,
            scrambled: false,
            scrambling: true,
            paused: false,
            turnMs: Math.round(TURN_MS * 0.55),
            startedAt: null,
            finishedAt: null,
            pauseStartedAt: null,
            pausedMs: 0,
        });
    },

    reset: () => set({ ...freshState() }),

    undo: () => {
        const { history, stickers, active, scrambling, paused } = get();
        if (active || scrambling || paused || history.length === 0) return;
        const last = history[history.length - 1];
        const next = commitPyraTurn(stickers, invertTurn(last));
        set({
            stickers: next,
            history: history.slice(0, -1),
            solved: isPyraSolved(next),
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
export function selectPyraElapsed(now: number): number {
    const s = usePyraStore.getState();
    const snap: TimingSnapshot = {
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        paused: s.paused,
        pauseStartedAt: s.pauseStartedAt,
        pausedMs: s.pausedMs,
    };
    return selectElapsed(snap, now);
}
