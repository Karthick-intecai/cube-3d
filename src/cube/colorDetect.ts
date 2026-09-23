// src/cube/colorDetect.ts
// On-device sticker color detection from a cropped face photo.
// Pure functions (no expo imports) so the math is unit-testable in Node.
import { decode as decodeJpeg } from 'jpeg-js';
import { COLORS } from './constants';

export interface RGB { r: number; g: number; b: number; }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 → bytes (no Buffer/atob dependency for Hermes). */
export function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
    const out: number[] = [];
    let i = 0;
    while (i < clean.length) {
        const c = [0, 1, 2, 3].map((k) => {
            const ch = clean[i++];
            if (ch === undefined || ch === '=') return 0;
            return B64.indexOf(ch);
        });
        out.push((c[0] << 2) | (c[1] >> 4));
        if (clean[i - 2] !== '=') out.push(((c[1] & 15) << 4) | (c[2] >> 2));
        if (clean[i - 1] !== '=') out.push(((c[2] & 3) << 6) | c[3]);
    }
    return Uint8Array.from(out);
}

export function decodeJpegBase64(b64: string): { data: Uint8Array; width: number; height: number } {
    const bytes = base64ToBytes(b64);
    const img = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
    return { data: img.data as Uint8Array, width: img.width, height: img.height };
}

export function hexToRgb(hex: string): RGB {
    const h = hex.replace('#', '');
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
    const d = mx - mn;
    let h = 0;
    if (d > 0) {
        if (mx === rn) h = ((gn - bn) / d) % 6;
        else if (mx === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: mx === 0 ? 0 : d / mx, v: mx };
}

const REF_HEX = [COLORS.U, COLORS.D, COLORS.F, COLORS.B, COLORS.R, COLORS.L];

function colorDistance(a: RGB, b: RGB): number {
    const A = rgbToHsv(a.r, a.g, a.b);
    const B = rgbToHsv(b.r, b.g, b.b);
    const hueD = Math.abs(A.h - B.h) / 180; // 0..1 (circular approx, fine away from red wrap)
    const hueDCirc = Math.min(hueD, 2 - hueD);
    const satW = Math.min(1, (A.s + B.s) * 1.5);
    return hueDCirc * 3 * satW + Math.abs(A.s - B.s) + Math.abs(A.v - B.v) * 0.6;
}

/** Classify one white-balanced sample to the nearest cube color hex. */
export function classifySample(rgb: RGB): string {
    const { s } = rgbToHsv(rgb.r, rgb.g, rgb.b);
    if (s < 0.18) return COLORS.U; // near-gray can only be white
    let best = REF_HEX[0];
    let bestD = Infinity;
    for (const hex of REF_HEX) {
        const d = colorDistance(rgb, hexToRgb(hex));
        if (d < bestD) { bestD = d; best = hex; }
    }
    return best;
}

/**
 * Map an overlay square (view coords) to image pixels.
 * Camera preview uses FILL (center-crop) scaling: the photo is scaled
 * until it covers the view, so image-px-per-view-px is the MIN ratio
 * and every view pixel lands inside the photo.
 */
export function overlayToImageCrop(
    imgW: number, imgH: number,
    viewW: number, viewH: number,
    sqX: number, sqY: number, sqSide: number
): { originX: number; originY: number; width: number; height: number } {
    const scale = Math.min(imgW / viewW, imgH / viewH);
    const offX = (imgW - viewW * scale) / 2;
    const offY = (imgH - viewH * scale) / 2;
    const originX = Math.round(offX + sqX * scale);
    const originY = Math.round(offY + sqY * scale);
    const side = Math.round(sqSide * scale);
    return {
        originX: Math.max(0, Math.min(imgW - 1, originX)),
        originY: Math.max(0, Math.min(imgH - 1, originY)),
        width: Math.max(1, Math.min(imgW - originX, side)),
        height: Math.max(1, Math.min(imgH - originY, side)),
    };
}

function avgRegion(data: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): RGB {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const o = (y * w + x) * 4;
            r += data[o]; g += data[o + 1]; b += data[o + 2]; n++;
        }
    }
    return { r: r / n, g: g / n, b: b / n };
}

/**
 * Detect sticker colors from a square face image (any size).
 * Cells are sampled at their centers (seams avoided), gray-world
 * white-balanced, then classified. Returns hexes in reading order.
 */
export function detectFace(data: Uint8Array, w: number, h: number, n = 3): string[] {
    const cell = Math.min(w, h) / n;
    const samples: RGB[] = [];
    for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
            const x0 = Math.floor(col * cell + cell * 0.3);
            const x1 = Math.ceil(col * cell + cell * 0.7);
            const y0 = Math.floor(row * cell + cell * 0.3);
            const y1 = Math.ceil(row * cell + cell * 0.7);
            samples.push(avgRegion(data, w, x0, y0, Math.min(w, x1), Math.min(h, y1)));
        }
    }
    // Gray-world white balance from the 9 samples.
    const mean = (f: (c: RGB) => number) =>
        samples.reduce((a, c) => a + f(c), 0) / samples.length;
    const gain = (m: number) => Math.max(0.5, Math.min(2, 128 / Math.max(1, m)));
    const gr = gain(mean((c) => c.r)), gg = gain(mean((c) => c.g)), gb = gain(mean((c) => c.b));
    const balanced = samples.map((c) => ({
        r: Math.min(255, c.r * gr),
        g: Math.min(255, c.g * gg),
        b: Math.min(255, c.b * gb),
    }));
    // Classify against equally-balanced references.
    const refs = REF_HEX.map((hex) => {
        const c = hexToRgb(hex);
        return { hex, rgb: { r: Math.min(255, c.r * gr), g: Math.min(255, c.g * gg), b: Math.min(255, c.b * gb) } };
    });
    return balanced.map((s) => {
        const { s: sat } = rgbToHsv(s.r, s.g, s.b);
        if (sat < 0.18) return COLORS.U;
        let best = refs[0].hex;
        let bestD = Infinity;
        for (const ref of refs) {
            const d = colorDistance(s, ref.rgb);
            if (d < bestD) { bestD = d; best = ref.hex; }
        }
        return best;
    });
}
