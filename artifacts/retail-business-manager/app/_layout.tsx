import React, { useEffect } from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StoreProvider } from '@/context/StoreContext';
import { useStore } from '@/context/StoreContext';
import { DebtProvider } from '@/context/DebtContext';
import { CustomerProvider } from '@/context/CustomerContext';
import { PaymentProvider } from '@/context/PaymentContext';
import { FloatingQuickActions } from '@/components/FloatingQuickActions';
import { AndroidPushObserver } from '@/components/AndroidPushObserver';
import { MemberNamesProvider } from '@/context/MemberNamesContext';
import { SessionLiveReadsProvider } from '@/context/SessionLiveReadsContext';
import { MemberNamePrompt } from '@/components/MemberNamePrompt';
import { AppearanceProvider } from '@/context/AppearanceContext';
import { useAppearance } from '@/context/AppearanceContext';
import { StatusBar } from 'expo-status-bar';
import { useColors } from '@/hooks/useColors';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { scheme } = useAppearance();
  const colors = useColors();
  const pathname = usePathname();
  const { isAuthenticated, isReady, canWriteBusiness, sessionKey } = useStore();
  const showQuickActions = isReady && isAuthenticated && canWriteBusiness && pathname === '/';
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AndroidPushObserver />
      <MemberNamePrompt key={sessionKey} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }} />
      {showQuickActions ? <FloatingQuickActions /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AppearanceProvider><StoreProvider>
        <ErrorBoundary>
          <ScopedBusinessProviders />
        </ErrorBoundary>
      </StoreProvider></AppearanceProvider>
    </SafeAreaProvider>
  );
}

/** Remount screen drafts and business caches on account/space/role transitions. */
function ScopedBusinessProviders() {
  const { sessionKey } = useStore();
  const queryClient = React.useMemo(() => new QueryClient(), [sessionKey]);
  return (
    <DebtProvider key={sessionKey}>
      <PaymentProvider>
        <CustomerProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <SessionLiveReadsProvider><MemberNamesProvider><RootLayoutNav /></MemberNamesProvider></SessionLiveReadsProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </CustomerProvider>
      </PaymentProvider>
    </DebtProvider>
  );
}
