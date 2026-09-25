import '../global.css';
import React, { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import { getAuthToken } from '../src/services/storage';
import { getServerUrl } from '../src/services/config';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    async function checkAuth() {
      try {
        const serverUrl = await getServerUrl();
        const token = await getAuthToken();

        const inAuthGroup = segments[0] === '(auth)';
        const onServerSelect = segments[0] === 'server-select';

        if (!serverUrl && !onServerSelect) {
          router.replace('/server-select');
        } else if (!token && !inAuthGroup && !onServerSelect) {
          router.replace('/(auth)/login');
        } else if (token && (inAuthGroup || onServerSelect)) {
          router.replace('/(chat)');
        }
      } catch (err) {
        console.warn('[AuthGuard] Auth check error:', err);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [segments, router]);

  if (loading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#10a37f" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor="#0d0d0d" />
        <AuthGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0d0d0d' },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="server-select" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
            <Stack.Screen name="(chat)" options={{ headerShown: false }} />
          </Stack>
        </AuthGuard>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
