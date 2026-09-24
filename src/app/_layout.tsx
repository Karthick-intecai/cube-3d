import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {

  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          {/*
            Full-screen gesture canvases: a left-to-right drag must turn /
            orbit the puzzle, never pop the navigation stack. The native
            iOS back-swipe is therefore off here (header back buttons stay).
          */}
          <Stack.Screen name="play" options={{ gestureEnabled: false }} />
          <Stack.Screen name="pyraminx" options={{ gestureEnabled: false }} />
          <Stack.Screen name="solve" options={{ gestureEnabled: false }} />
          <Stack.Screen name="solve-pyra" options={{ gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}