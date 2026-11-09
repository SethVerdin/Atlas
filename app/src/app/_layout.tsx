import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AtlasColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <AuthProvider>
        <StatusBar style="light" />
        <Screens />
        <AnimatedSplashOverlay />
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Signed out: only the login screen exists. Signed in: the app, but no login screen. */
function Screens() {
  const { status } = useAuth();
  // Checking a saved token takes a moment; the splash overlay covers this.
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: AtlasColors.bg }} />;

  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: AtlasColors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
