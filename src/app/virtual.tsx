import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface CubeOption {
    id: string;
    name: string;
    sub: string;
    route?: string;
    param?: string;
}

const OPTIONS: CubeOption[] = [
    { id: '2x2', name: '2x2 Pocket', sub: 'Quick & fun • 8 corners', route: '/play', param: '2x2' },
    { id: '3x3', name: '3x3 Classic', sub: 'The original speedcube', route: '/play', param: '3x3' },
    { id: '4x4', name: "4x4 Revenge", sub: 'Centers + edges challenge', route: '/play', param: '4x4' },
    { id: 'pyra', name: 'Pyraminx', sub: 'Tetrahedron twists • tips + layers', route: '/pyraminx' },
];

export default function VirtualListScreen() {
    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Pressable style={styles.back} onPress={() => router.back()}>
                    <Text style={styles.backText}>‹ Back</Text>
                </Pressable>
                <Text style={styles.title}>Choose your cube</Text>
            </View>

            <View style={styles.list}>
                {OPTIONS.map((o) => (
                    <Pressable
                        key={o.id}
                        style={styles.card}
                        onPress={() =>
                            o.route &&
                            (o.param
                                ? router.push({ pathname: o.route as '/play', params: { cube: o.param } })
                                : router.push(o.route as '/pyraminx'))
                        }
                    >
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{o.id.toUpperCase()}</Text>
                        </View>
                        <View style={styles.cardBody}>
                            <Text style={styles.cardTitle}>{o.name}</Text>
                            <Text style={styles.cardSub}>{o.sub}</Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                    </Pressable>
                ))}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 20, gap: 16 },
    header: { paddingTop: 8, gap: 8 },
    back: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 },
    backText: { color: '#5eead4', fontSize: 16, fontWeight: '700' },
    title: { color: '#f2f6ff', fontSize: 30, fontWeight: '800', lineHeight: 36 },
    list: { gap: 12 },
    card: {
        backgroundColor: '#141a2e',
        borderColor: '#232c4d',
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    cardDisabled: { opacity: 0.55 },
    badge: {
        backgroundColor: '#1a2340',
        borderColor: '#2dd4bf',
        borderWidth: 1,
        borderRadius: 12,
        minWidth: 64,
        paddingVertical: 10,
        alignItems: 'center',
    },
    badgeText: { color: '#5eead4', fontSize: 15, fontWeight: '800' },
    cardBody: { flex: 1 },
    cardTitle: { color: '#f2f6ff', fontSize: 18, fontWeight: '800' },
    cardSub: { color: '#7c8ab0', fontSize: 13, fontWeight: '600', marginTop: 2 },
    chevron: { color: '#7c8ab0', fontSize: 22, fontWeight: '700' },
});
