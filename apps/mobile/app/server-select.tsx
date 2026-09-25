import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Server, Wifi, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react-native';
import {
  getServerUrl,
  setServerUrl,
  testServerConnection,
  DEFAULT_DEV_URL,
} from '../src/services/config';

export default function ServerSelectScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  useEffect(() => {
    getServerUrl().then((saved) => setUrl(saved));
  }, []);

  const handleTestConnection = async (targetUrl = url) => {
    if (!targetUrl.trim()) return;
    setTesting(true);
    setTestResult(null);

    const result = await testServerConnection(targetUrl);
    setTesting(false);
    if (result.ok) {
      setTestResult({ ok: true, message: 'Server is reachable!' });
    } else {
      setTestResult({
        ok: false,
        message: result.message || 'Cannot reach server. Verify IP and port 3080.',
      });
    }
  };

  const handleSaveAndContinue = async () => {
    if (!url.trim()) return;
    await setServerUrl(url);
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'space-between',
            paddingHorizontal: 24,
            paddingVertical: 32,
          }}
        >
          <View>
            {/* Header Icon & Title */}
            <View className="mb-8 items-center">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-border-light bg-surface-secondary">
                <Server size={32} color="#10a37f" />
              </View>
              <Text className="text-2xl font-bold tracking-tight text-text-primary">
                Connect to LibreChat
              </Text>
              <Text className="mt-2 px-4 text-center text-sm text-text-secondary">
                Enter your LibreChat backend URL to connect this mobile app.
              </Text>
            </View>

            {/* Server URL Input Box */}
            <View className="mb-4 rounded-xl border border-border-light bg-surface-primary p-4">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Server Base URL
              </Text>
              <View className="flex-row items-center rounded-lg border border-border-medium bg-surface-secondary px-3 py-2.5">
                <Wifi size={18} color="#8e8e8e" />
                <TextInput
                  value={url}
                  onChangeText={(text) => {
                    setUrl(text);
                    setTestResult(null);
                  }}
                  placeholder="http://192.168.1.x:3080"
                  placeholderTextColor="#666666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="ml-2.5 flex-1 text-sm text-text-primary"
                />
              </View>

              {/* Status Banner */}
              {testResult && (
                <View
                  className={`mt-3 flex-row items-center rounded-lg p-3 ${
                    testResult.ok
                      ? 'border-brand-green/30 border bg-[#10a37f]/10'
                      : 'border border-red-500/30 bg-red-500/10'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 size={16} color="#10a37f" />
                  ) : (
                    <AlertCircle size={16} color="#ef4444" />
                  )}
                  <Text
                    className={`ml-2 flex-1 text-xs font-medium ${
                      testResult.ok ? 'text-brand-green' : 'text-red-400'
                    }`}
                  >
                    {testResult.message}
                  </Text>
                </View>
              )}
            </View>

            {/* Quick Presets */}
            <View className="mb-6">
              <Text className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
                Quick Selection
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <TouchableOpacity
                  onPress={() => {
                    setUrl(DEFAULT_DEV_URL);
                    handleTestConnection(DEFAULT_DEV_URL);
                  }}
                  className="rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5"
                >
                  <Text className="text-xs text-text-secondary">Localhost / Emulator</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const sample = 'http://192.168.1.100:3080';
                    setUrl(sample);
                  }}
                  className="rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5"
                >
                  <Text className="text-xs text-text-secondary">LAN IP Template</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="gap-3">
            <TouchableOpacity
              onPress={() => handleTestConnection()}
              disabled={testing || !url.trim()}
              className="w-full items-center justify-center rounded-xl border border-border-light bg-surface-secondary py-3.5"
            >
              {testing ? (
                <ActivityIndicator size="small" color="#ececec" />
              ) : (
                <Text className="text-sm font-semibold text-text-primary">Test Connection</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveAndContinue}
              disabled={!url.trim()}
              className="bg-brand-green shadow-brand-green/20 w-full flex-row items-center justify-center rounded-xl py-3.5 shadow-lg"
            >
              <Text className="mr-2 text-sm font-bold text-white">Continue to Login</Text>
              <ArrowRight size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
