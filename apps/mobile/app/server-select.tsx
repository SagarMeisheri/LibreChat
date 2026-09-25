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
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8 justify-between">
          <View>
            {/* Header Icon & Title */}
            <View className="items-center mb-8">
              <View className="w-16 h-16 rounded-2xl bg-surface-secondary border border-border-light items-center justify-center mb-4">
                <Server size={32} color="#10a37f" />
              </View>
              <Text className="text-text-primary text-2xl font-bold tracking-tight">
                Connect to LibreChat
              </Text>
              <Text className="text-text-secondary text-sm text-center mt-2 px-4">
                Enter your LibreChat backend URL to connect this mobile app.
              </Text>
            </View>

            {/* Server URL Input Box */}
            <View className="bg-surface-primary p-4 rounded-xl border border-border-light mb-4">
              <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2">
                Server Base URL
              </Text>
              <View className="flex-row items-center bg-surface-secondary rounded-lg border border-border-medium px-3 py-2.5">
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
                  className="flex-1 text-text-primary text-sm ml-2.5"
                />
              </View>

              {/* Status Banner */}
              {testResult && (
                <View
                  className={`flex-row items-center mt-3 p-3 rounded-lg ${
                    testResult.ok ? 'bg-[#10a37f]/10 border border-brand-green/30' : 'bg-red-500/10 border border-red-500/30'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 size={16} color="#10a37f" />
                  ) : (
                    <AlertCircle size={16} color="#ef4444" />
                  )}
                  <Text
                    className={`text-xs ml-2 flex-1 font-medium ${
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
              <Text className="text-text-tertiary text-xs font-semibold uppercase mb-2">
                Quick Selection
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <TouchableOpacity
                  onPress={() => {
                    setUrl(DEFAULT_DEV_URL);
                    handleTestConnection(DEFAULT_DEV_URL);
                  }}
                  className="bg-surface-secondary px-3 py-1.5 rounded-lg border border-border-light"
                >
                  <Text className="text-text-secondary text-xs">Localhost / Emulator</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const sample = 'http://192.168.1.100:3080';
                    setUrl(sample);
                  }}
                  className="bg-surface-secondary px-3 py-1.5 rounded-lg border border-border-light"
                >
                  <Text className="text-text-secondary text-xs">LAN IP Template</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="gap-3">
            <TouchableOpacity
              onPress={() => handleTestConnection()}
              disabled={testing || !url.trim()}
              className="w-full bg-surface-secondary py-3.5 rounded-xl border border-border-light items-center justify-center"
            >
              {testing ? (
                <ActivityIndicator size="small" color="#ececec" />
              ) : (
                <Text className="text-text-primary font-semibold text-sm">Test Connection</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSaveAndContinue}
              disabled={!url.trim()}
              className="w-full bg-brand-green py-3.5 rounded-xl items-center justify-center flex-row shadow-lg shadow-brand-green/20"
            >
              <Text className="text-white font-bold text-sm mr-2">Continue to Login</Text>
              <ArrowRight size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
