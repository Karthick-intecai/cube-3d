// src/cube/scramble.ts
import { FaceName, FaceTurn } from './types';

const FACES: FaceName[] = ['R', 'L', 'U', 'D', 'F', 'B'];

export function randomScramble(n = 20): FaceTurn[] {
    const moves: FaceTurn[] = [];
    let last: FaceName | null = null;
    for (let i = 0; i < n; i++) {
        let face: FaceName;
        do {
            face = FACES[Math.floor(Math.random() * FACES.length)];
        } while (face === last);
        last = face;
        moves.push({ face, prime: Math.random() < 0.5 });
    }
    return moves;
}