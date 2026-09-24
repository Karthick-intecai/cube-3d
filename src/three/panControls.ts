// src/three/panControls.ts
// Touch handling via React Native core PanResponder (no gesture-handler
// dependency). Used because RNGH single-touch activation is unreliable
// on some Android builds, while core touch dispatch (taps) works fine.
import { useRef } from 'react';
import {
    PanResponder,
    type GestureResponderEvent,
    type PanResponderGestureState,
} from 'react-native';

interface Handlers {
    onBegin: (x: number, y: number) => void;
    onChange: (dx: number, dy: number) => void;
    onEnd: (tx: number, ty: number) => void;
}

/** Returns `panHandlers` to spread onto the touch surface View. */
export function usePanControls({ onBegin, onChange, onEnd }: Handlers) {
    const last = useRef({ x: 0, y: 0 });
    const handlersRef = useRef({ onBegin, onChange, onEnd });
    handlersRef.current = { onBegin, onChange, onEnd };
    const responder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (e: GestureResponderEvent) => {
                const { locationX, locationY } = e.nativeEvent;
                last.current = { x: 0, y: 0 };
                handlersRef.current.onBegin(locationX, locationY);
            },
            onPanResponderMove: (
                _e: GestureResponderEvent,
                g: PanResponderGestureState
            ) => {
                const dx = g.dx - last.current.x;
                const dy = g.dy - last.current.y;
                last.current = { x: g.dx, y: g.dy };
                handlersRef.current.onChange(dx, dy);
            },
            onPanResponderRelease: (
                _e: GestureResponderEvent,
                g: PanResponderGestureState
            ) => {
                handlersRef.current.onEnd(g.dx, g.dy);
            },
            onPanResponderTerminate: (
                _e: GestureResponderEvent,
                g: PanResponderGestureState
            ) => {
                handlersRef.current.onEnd(g.dx, g.dy);
            },
        })
    );
    return responder.current.panHandlers;
}
