import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { PrimaryButton } from '@/components/atlas/form';
import { AtlasColors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <AuthProvider>
        <Screens />
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Signed out: sign-in. Signed in for the first time: the "About you" questions.
 * After that: Home. Expo Router moves to the first allowed screen when this changes.
 */
function Screens() {
  const { state, retry } = useAuth();

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={AtlasColors.textSecondary} />
      </View>
    );
  }
  if (state.status === 'unreachable') {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{state.error}</Text>
        <View style={styles.retry}>
          <PrimaryButton label="Try again" onPress={retry} />
        </View>
      </View>
    );
  }

  const signedIn = state.status === 'signedIn';
  const needsProfile = signedIn && state.user.profile === null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: AtlasColors.bg } }}>
      <Stack.Protected guard={signedIn && !needsProfile}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="about-you" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    padding: 24,
    backgroundColor: AtlasColors.bg,
  },
  retry: { width: '100%', maxWidth: 360 },
  message: { fontSize: 15, color: AtlasColors.textSecondary, textAlign: 'center', maxWidth: 360 },
});
