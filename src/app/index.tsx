import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.hero}>
                <Image
                    source={require('../../assets/images/logo-glow.png')}
                    style={styles.image}
                    contentFit="contain"
                />
                <Text style={styles.logo}>CUBE 3D</Text>
                <Text style={styles.tag}>SCAN IT • SOLVE IT • PLAY IT</Text>
            </View>

            <View style={styles.options}>
                <Pressable style={styles.card} onPress={() => router.push('/physical')}>
                    <Ionicons name="camera" size={30} color="#5eead4" />
                    <View>
                        <Text style={styles.cardTitle}>Physical Cube</Text>
                        <Text style={styles.cardSub}>Scan or enter colors, get steps</Text>
                    </View>
                </Pressable>
                <Pressable style={styles.card} onPress={() => router.push('/virtual')}>
                    <MaterialCommunityIcons name="cube-outline" size={30} color="#5eead4" />
                    <View>
                        <Text style={styles.cardTitle}>Virtual Cube</Text>
                        <Text style={styles.cardSub}>2x2 • 3x3 • 4x4 • Pyraminx</Text>
                    </View>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0b0e17', paddingHorizontal: 20, gap: 16 },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    image: { width: 220, height: 220 },
    logo: { color: '#f2f6ff', fontSize: 42, fontWeight: '800', letterSpacing: 6, lineHeight: 48 },
    tag: { color: '#5eead4', fontSize: 12, fontWeight: '700', letterSpacing: 3 },
    options: { gap: 12, paddingBottom: 16 },
    card: {
        backgroundColor: '#141a2e',
        borderColor: '#2dd4bf',
        borderWidth: 1,
        borderRadius: 18,
        paddingVertical: 20,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    cardTitle: { color: '#f2f6ff', fontSize: 20, fontWeight: '800' },
    cardSub: { color: '#7c8ab0', fontSize: 13, fontWeight: '600', marginTop: 2 },
});
