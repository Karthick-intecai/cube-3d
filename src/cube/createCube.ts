// src/cube/createCube.ts
import { COLORS } from './constants';
import { Cubie } from './types';

export function createSolvedCube(size = 3): Cubie[] {
    const outer = (size - 1) / 2;
    const cubies: Cubie[] = [];
    let id = 0;
    for (let ix = 0; ix < size; ix++) {
        for (let iy = 0; iy < size; iy++) {
            for (let iz = 0; iz < size; iz++) {
                const x = ix - outer, y = iy - outer, z = iz - outer;
                // Skip fully interior cubies (no visible stickers).
                if (Math.abs(x) < outer - 0.99 && Math.abs(y) < outer - 0.99 && Math.abs(z) < outer - 0.99) continue;
                const stickers: Cubie['stickers'] = [
                    x === outer ? COLORS.R : COLORS.HIDDEN, // +X
                    x === -outer ? COLORS.L : COLORS.HIDDEN, // -X
                    y === outer ? COLORS.U : COLORS.HIDDEN, // +Y
                    y === -outer ? COLORS.D : COLORS.HIDDEN, // -Y
                    z === outer ? COLORS.F : COLORS.HIDDEN, // +Z
                    z === -outer ? COLORS.B : COLORS.HIDDEN, // -Z
                ];
                cubies.push({ id: id++, position: [x, y, z], quaternion: [0, 0, 0, 1], stickers });
            }
        }
    }
    return cubies;
}
