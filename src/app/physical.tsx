import { decodeJpegBase64, detectFace, overlayToImageCrop } from '@/cube/colorDetect';
import { COLORS } from '@/cube/constants';
import { stickerLetter } from '@/cube/facelets';
import { findBadCorners2 } from '@/cube/twoByTwo';
import { FaceKey, findBadPieces } from '@/cube/validate';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FACE_ORDER: FaceKey[] = ['F', 'R', 'U', 'D', 'L', 'B'];
const FACE_COLOR: Record<FaceKey, string> = {
    F: COLORS.F, R: COLORS.R, U: COLORS.U,
    D: COLORS.D, L: COLORS.L, B: COLORS.B,
};
const FACE_NAME: Record<FaceKey, string> = {
    F: 'Front (green)', R: 'Right (red)', U: 'Up (white)',
    D: 'Down (yellow)', L: 'Left (orange)', B: 'Back (blue)',
};
// How to hold the cube while entering each face. Wrong orientation here
// is the #1 cause of "impossible" states.
const FACE_GUIDE: Record<FaceKey, string> = {
    F: 'Green faces you, White on top.',
    R: 'Turn the cube: Red faces you, White stays on top.',
    U: 'Tip it back: White faces you, Green edge at the bottom.',
    D: 'Tip it forward: Yellow faces you, Green edge at the top.',
    L: 'Turn the cube: Orange faces you, White stays on top.',
    B: 'Turn around: Blue faces you, White stays on top.',
};
const PALETTE: { hex: string; label: string }[] = [
    { hex: COLORS.U, label: 'U' },
    { hex: COLORS.D, label: 'D' },
    { hex: COLORS.F, label: 'F' },
    { hex: COLORS.B, label: 'B' },
    { hex: COLORS.R, label: 'R' },
    { hex: COLORS.L, label: 'L' },
];

const GRID_W = 248;
const GRID_GAP = 8;

type CubeKind = 2 | 3 | 4;
const KIND_LABEL: Record<CubeKind, string> = { 2: '2×2', 3: '3×3', 4: '4×4' };

// Verified-solvable demo states (letter grids, F R U D L B order).
const DEMOS: Record<2 | 3, string> = {
    3: 'flulfbddrrudrruddldbbburrfbllffdrubfrludlubrflubfbfudl',
    2: 'burulrlduurfdbdfrdlfbflb',
};

function emptyFacesN(n: CubeKind): Record<FaceKey, string[]> {
    const o = {} as Record<FaceKey, string[]>;
    for (const f of FACE_ORDER) {
        o[f] = Array.from({ length: n * n }, (_, i) =>
            n === 3 && i === 4 ? FACE_COLOR[f] : COLORS.U
        );
    }
    return o;
}

export default function PhysicalScreen() {
    const [cubeType, setCubeType] = useState<CubeKind>(3);
    const [typeOpen, setTypeOpen] = useState(true);
    const n = cubeType;
    const cellCount = n * n;
    const cellSize = (GRID_W - (n - 1) * GRID_GAP) / n;

    const [tab, setTab] = useState<'manual' | 'camera'>('manual');
    const [face, setFace] = useState<FaceKey>('F');
    const [paint, setPaint] = useState<string>(COLORS.F);
    const [faces, setFaces] = useState<Record<FaceKey, string[]>>(() => emptyFacesN(3));
    const [photos, setPhotos] = useState<Record<FaceKey, string | null>>({
        F: null, R: null, U: null, D: null, L: null, B: null,
    });
    const [error, setError] = useState<string | null>(null);
    const [badFaces, setBadFaces] = useState<FaceKey[]>([]);

    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const [photoFace, setPhotoFace] = useState<FaceKey>('F');
    const [busy, setBusy] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanned, setScanned] = useState<Record<FaceKey, boolean>>({
        F: false, R: false, U: false, D: false, L: false, B: false,
    });
    const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
    const squareSide = Math.min(viewSize.w, viewSize.h) * 0.8;
    const sqX = (viewSize.w - squareSide) / 2;
    const sqY = (viewSize.h - squareSide) / 2;

    const pickType = (t: CubeKind) => {
        if (t !== cubeType) {
            setCubeType(t);
            setFaces(emptyFacesN(t));
            setPhotos({ F: null, R: null, U: null, D: null, L: null, B: null });
            setScanned({ F: false, R: false, U: false, D: false, L: false, B: false });
            setError(null);
            setBadFaces([]);
            setScanError(null);
            setFace('F');
            setPhotoFace('F');
            touchedRef.current.clear();
        }
        setTypeOpen(false);
    };

    // --- manual entry ---
    const touchedRef = useRef<Set<string>>(new Set());
    const paintCell = (i: number) => {
        if (n === 3 && i === 4) return; // center is fixed on 3x3
        touchedRef.current.add(`${face}:${i}`);
        const required: number[] = [];
        for (let k = 0; k < cellCount; k++) {
            if (n === 3 && k === 4) continue;
            required.push(k);
        }
        const painted = required.every((k) => touchedRef.current.has(`${face}:${k}`));
        setFaces((prev) => {
            const next = { ...prev, [face]: [...prev[face]] };
            next[face][i] = paint;
            return next;
        });
        setError(null);
        setBadFaces([]);
        // Beginner-friendly: move to the next face once this one is filled.
        if (painted) {
            const idx = FACE_ORDER.indexOf(face);
            if (idx < FACE_ORDER.length - 1) setFace(FACE_ORDER[idx + 1]);
        }
    };

    const loadDemo = () => {
        const demo = DEMOS[n as 2 | 3];
        if (!demo) return;
        const hexOf: Record<string, string> = {
            f: COLORS.F, r: COLORS.R, u: COLORS.U,
            d: COLORS.D, l: COLORS.L, b: COLORS.B,
        };
        const grids = {} as Record<FaceKey, string[]>;
        FACE_ORDER.forEach((f, fi) => {
            grids[f] = [...demo.slice(fi * cellCount, (fi + 1) * cellCount)].map((ch) => hexOf[ch]);
        });
        setFaces(grids);
        setError(null);
        setBadFaces([]);
        setFace('F');
    };

    const counts = new Map<string, number>();
    for (const f of FACE_ORDER) for (const c of faces[f]) counts.set(c, (counts.get(c) ?? 0) + 1);
    const countProblems = PALETTE.filter((p) => (counts.get(p.hex) ?? 0) !== cellCount);
    const solvableKind = n === 2 || n === 3;
    const canSolve = countProblems.length === 0 && solvableKind;

    const doSolve = () => {
        setError(null);
        setBadFaces([]);
        // Local legality check first: tells exactly which piece is wrong.
        const bad = n === 2 ? findBadCorners2(faces) : findBadPieces(faces);
        if (bad) {
            setError(
                `Impossible cube: ${bad.message} ` +
                `Each corner/edge color combo must exist on a real cube — ` +
                `usually one face was entered with the wrong orientation (see the guide above the grid).`
            );
            setBadFaces(bad.faces);
            return;
        }
        let state = '';
        for (const f of FACE_ORDER) {
            for (const hex of faces[f]) state += stickerLetter(hex);
        }
        // Graphical step-by-step player builds the cube from this state.
        router.push({ pathname: '/solve', params: { state, size: String(n) } });
    };

    // --- camera: align face in the square, auto-detect its colors ---
    const takePhoto = async () => {
        if (!cameraRef.current || busy || !viewSize.w) return;
        setBusy(true);
        setScanError(null);
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            if (!photo?.uri || !photo.width || !photo.height) throw new Error('capture failed');
            // Crop the overlay square out of the full photo, shrink to 30px/cell.
            const crop = overlayToImageCrop(
                photo.width, photo.height, viewSize.w, viewSize.h, sqX, sqY, squareSide
            );
            const px = 30 * n;
            const small = await manipulateAsync(
                photo.uri,
                [{ crop }, { resize: { width: px, height: px } }],
                { compress: 0.9, format: SaveFormat.JPEG }
            );
            const b64 = await readAsStringAsync(small.uri, { encoding: 'base64' });
            const { data, width, height } = decodeJpegBase64(b64);
            const hexes = detectFace(data, width, height, n);
            if (n === 3) hexes[4] = FACE_COLOR[photoFace]; // center sticker is known
            setFaces((prev) => ({ ...prev, [photoFace]: hexes }));
            setPhotos((p) => ({ ...p, [photoFace]: small.uri }));
            const nextScanned = { ...scanned, [photoFace]: true };
            setScanned(nextScanned);
            setError(null);
            setBadFaces([]);
            const next = FACE_ORDER.find((f) => !nextScanned[f]);
            if (next) setPhotoFace(next);
        } catch {
            setScanError('Could not read the colors — fill the square with the face, hold steady, use good light.');
        } finally {
            setBusy(false);
        }
    };
    const photoCount = FACE_ORDER.filter((f) => photos[f]).length;
    const photosDone = photoCount === FACE_ORDER.length;

    return (
        <SafeAreaView style={styles.safe}>
            <Modal visible={typeOpen} transparent animationType="fade">
                <View style={styles.modalWrap}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>What cube are you solving?</Text>
                        {([2, 3, 4] as CubeKind[]).map((t) => (
                            <Pressable
                                key={t}
                                style={[styles.typeCard, cubeType === t && styles.typeCardActive]}
                                onPress={() => pickType(t)}
                            >
                                <Text style={styles.typeName}>{KIND_LABEL[t]}</Text>
                                <Text style={styles.typeSub}>
                                    {t === 2 ? 'Pocket cube • 8 corners' : t === 3 ? 'Classic • full solver' : 'Revenge • scan & entry'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </Modal>

            <View style={styles.header}>
                <Pressable style={styles.back} onPress={() => router.back()}>
                    <Text style={styles.backText}>‹ Home</Text>
                </Pressable>
                <Text style={styles.title}>Physical solver</Text>
                <Pressable style={styles.typeChip} onPress={() => setTypeOpen(true)}>
                    <Text style={styles.typeChipText}>{KIND_LABEL[n]} ▾</Text>
                </Pressable>
            </View>

            <Text style={styles.orient}>
                {KIND_LABEL[n]} • standard scheme — WHITE on top, GREEN in front.
            </Text>

            <View style={styles.tabs}>
                {(['manual', 'camera'] as const).map((t) => (
                    <Pressable
                        key={t}
                        style={[styles.tab, tab === t && styles.tabActive]}
                        onPress={() => setTab(t)}
                    >
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'manual' ? 'Enter colors' : `Camera (${photoCount}/6)`}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {tab === 'manual' ? (
                <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
                    <View style={styles.faceTabs}>
                        {FACE_ORDER.map((f) => (
                            <Pressable
                                key={f}
                                style={[
                                    styles.faceTab,
                                    face === f && styles.faceTabActive,
                                    badFaces.includes(f) && styles.faceTabBad,
                                ]}
                                onPress={() => setFace(f)}
                            >
                                <View style={[styles.dot, { backgroundColor: FACE_COLOR[f] }]} />
                                <Text style={styles.faceTabText}>{f}</Text>
                            </Pressable>
                        ))}
                    </View>

                    <Text style={styles.faceName}>{FACE_NAME[face]} — top row first</Text>
                    <Text style={styles.guide}>{FACE_GUIDE[face]}</Text>
                    <View style={[styles.grid, { width: GRID_W }]}>
                        {faces[face].map((hex, i) => (
                            <Pressable
                                key={i}
                                style={[
                                    styles.cell,
                                    { backgroundColor: hex, width: cellSize, height: cellSize },
                                    n === 3 && i === 4 && styles.cellLocked,
                                ]}
                                onPress={() => paintCell(i)}
                            />
                        ))}
                    </View>

                    <Text style={styles.paletteLabel}>Paint color:</Text>
                    <View style={styles.palette}>
                        {PALETTE.map((p) => (
                            <Pressable
                                key={p.hex}
                                style={[
                                    styles.swatch,
                                    { backgroundColor: p.hex },
                                    paint === p.hex && styles.swatchActive,
                                ]}
                                onPress={() => setPaint(p.hex)}
                            >
                                <Text style={styles.swatchText}>{p.label}</Text>
                            </Pressable>
                        ))}
                    </View>

                    {!canSolve && solvableKind && (
                        <Text style={styles.warn}>
                            Counts: {PALETTE.map((p) => `${p.label}×${counts.get(p.hex) ?? 0}`).join('  ')} (need {cellCount} each)
                        </Text>
                    )}
                    {!solvableKind && (
                        <Text style={styles.warn}>
                            4×4 auto-solve is coming soon — scan & entry work, solution next.
                        </Text>
                    )}

                    <Pressable
                        style={[styles.solve, !canSolve && styles.disabled]}
                        disabled={!canSolve}
                        onPress={doSolve}
                    >
                        <Text style={styles.solveText}>Get graphical solution ›</Text>
                    </Pressable>
                    {solvableKind && (
                        <Pressable style={styles.ghost} onPress={loadDemo}>
                            <Text style={styles.ghostText}>New to this? Load a demo scramble ›</Text>
                        </Pressable>
                    )}

                    {error && <Text style={styles.error}>{error}</Text>}
                </ScrollView>
            ) : (
                <View style={styles.body}>
                    {!permission ? (
                        <Text style={styles.warn}>Loading camera…</Text>
                    ) : !permission.granted ? (
                        <View style={styles.permBox}>
                            <Text style={styles.warn}>Camera access is needed to snap each face.</Text>
                            <Pressable style={styles.solve} onPress={requestPermission}>
                                <Text style={styles.solveText}>Grant permission</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <ScrollView style={styles.body} contentContainerStyle={styles.bodyPad}>
                            <Text style={styles.faceName}>
                                Scan: {FACE_NAME[photoFace]} ({photoCount}/6)
                            </Text>
                            <Text style={styles.guide}>{FACE_GUIDE[photoFace]}</Text>
                            <View
                                style={styles.cameraBox}
                                onLayout={(e) => {
                                    const { width, height } = e.nativeEvent.layout;
                                    setViewSize({ w: width, h: height });
                                }}
                            >
                                <CameraView ref={cameraRef} style={styles.camera} facing="back" />
                                {squareSide > 0 && (
                                    <View
                                        pointerEvents="none"
                                        style={[
                                            styles.overlay,
                                            { left: sqX, top: sqY, width: squareSide, height: squareSide },
                                        ]}
                                    >
                                        {Array.from({ length: n - 1 }, (_, k) => (
                                            <View
                                                key={`v${k}`}
                                                style={[styles.overlayLineV, { left: `${((k + 1) / n) * 100}%` }]}
                                            />
                                        ))}
                                        {Array.from({ length: n - 1 }, (_, k) => (
                                            <View
                                                key={`h${k}`}
                                                style={[styles.overlayLineH, { top: `${((k + 1) / n) * 100}%` }]}
                                            />
                                        ))}
                                        <Text style={styles.overlayLabel}>
                                            Fit the {photoFace} face here
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.thumbs}>
                                {FACE_ORDER.map((f) => (
                                    <Pressable key={f} onPress={() => setPhotoFace(f)}>
                                        <View style={[styles.thumb, photoFace === f && styles.thumbActive]}>
                                            {photos[f] ? (
                                                <Image source={{ uri: photos[f]! }} style={styles.thumbImg} />
                                            ) : (
                                                <Text style={styles.thumbText}>{f}</Text>
                                            )}
                                            {scanned[f] && <Text style={styles.thumbCheck}>✓</Text>}
                                        </View>
                                    </Pressable>
                                ))}
                            </View>
                            {scanError && <Text style={styles.error}>{scanError}</Text>}
                            <Pressable
                                style={[styles.solve, (busy || photosDone) && styles.disabled]}
                                disabled={busy || photosDone}
                                onPress={takePhoto}
                            >
                                <Text style={styles.solveText}>
                                    {photosDone
                                        ? 'All 6 faces scanned ✓'
                                        : busy
                                          ? 'Reading colors…'
                                          : `Scan ${photoFace} face`}
                                </Text>
                            </Pressable>
                            {photosDone ? (
                                <Pressable style={styles.solve} onPress={() => setTab('manual')}>
                                    <Text style={styles.solveText}>Review colors & solve ›</Text>
                                </Pressable>
                            ) : (
                                <Text style={styles.warn}>
                                    Fill the square with one face at a time — colors are
                                    detected automatically. Good light helps a lot.
                                </Text>
                            )}
                        </ScrollView>
                    )}
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 16, gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
    back: { paddingVertical: 6, paddingRight: 8 },
    backText: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
    title: { color: '#f2f6ff', fontSize: 22, fontWeight: '800', flex: 1 },
    typeChip: {
        backgroundColor: '#1a2340', borderColor: '#2dd4bf', borderWidth: 1,
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7,
    },
    typeChipText: { color: '#5eead4', fontSize: 13, fontWeight: '800' },
    modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 },
    modalCard: { backgroundColor: '#141a2e', borderRadius: 20, padding: 20, gap: 10, width: '100%', borderWidth: 1, borderColor: '#232c4d' },
    modalTitle: { color: '#f2f6ff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    typeCard: {
        backgroundColor: '#1a2340', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
        borderWidth: 1, borderColor: '#2c3a67', flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    typeCardActive: { borderColor: '#2dd4bf' },
    typeName: { color: '#f2f6ff', fontSize: 22, fontWeight: '800', minWidth: 64 },
    typeSub: { color: '#7c8ab0', fontSize: 13, fontWeight: '600' },
    orient: { color: '#7c8ab0', fontSize: 12, fontWeight: '600' },
    tabs: { flexDirection: 'row', backgroundColor: '#141a2e', borderRadius: 12, padding: 4, gap: 4 },
    tab: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
    tabActive: { backgroundColor: '#2dd4bf' },
    tabText: { color: '#7c8ab0', fontWeight: '800' },
    tabTextActive: { color: '#06281f' },
    body: { flex: 1 },
    bodyPad: { gap: 12, paddingBottom: 24 },
    faceTabs: { flexDirection: 'row', gap: 6 },
    faceTab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 4, backgroundColor: '#141a2e', borderRadius: 10, paddingVertical: 10,
        borderWidth: 1, borderColor: '#232c4d',
    },
    faceTabActive: { borderColor: '#2dd4bf' },
    faceTabBad: { borderColor: '#f87171', borderWidth: 2 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    faceTabText: { color: '#dbe4ff', fontWeight: '800' },
    faceName: { color: '#dbe4ff', fontSize: 14, fontWeight: '700' },
    guide: { color: '#5eead4', fontSize: 12, fontWeight: '600', lineHeight: 17 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, alignSelf: 'center' },
    cell: { borderRadius: 12, borderWidth: 2, borderColor: '#232c4d' },
    cellLocked: { borderColor: '#2dd4bf' },
    paletteLabel: { color: '#7c8ab0', fontSize: 12, fontWeight: '700' },
    palette: { flexDirection: 'row', gap: 8 },
    swatch: {
        flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'transparent',
    },
    swatchActive: { borderColor: '#fff' },
    swatchText: { color: '#0b0e17', fontWeight: '800' },
    warn: { color: '#fbbf24', fontSize: 12, fontWeight: '600', lineHeight: 18 },
    error: { color: '#f87171', fontSize: 13, fontWeight: '600', lineHeight: 19 },
    solve: { backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    solveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    disabled: { opacity: 0.45 },
    permBox: { gap: 12 },
    cameraBox: { height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
    camera: { flex: 1 },
    overlay: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#2dd4bf',
        borderRadius: 12,
    },
    overlayLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(45,212,191,0.6)' },
    overlayLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(45,212,191,0.6)' },
    overlayLabel: {
        position: 'absolute', top: -22, left: 0, right: 0, textAlign: 'center',
        color: '#5eead4', fontSize: 12, fontWeight: '700',
    },
    thumbs: { flexDirection: 'row', gap: 8 },
    thumb: {
        width: 52, height: 52, borderRadius: 10, backgroundColor: '#141a2e',
        alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#232c4d', overflow: 'hidden',
    },
    thumbActive: { borderColor: '#2dd4bf' },
    thumbImg: { width: '100%', height: '100%' },
    thumbText: { color: '#7c8ab0', fontWeight: '800' },
    thumbCheck: {
        position: 'absolute', right: 2, bottom: 0,
        color: '#2dd4bf', fontSize: 14, fontWeight: '800',
    },
    ghost: { alignItems: 'center', paddingVertical: 8 },
    ghostText: { color: '#5eead4', fontWeight: '700' },
});
