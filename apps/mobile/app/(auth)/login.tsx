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
import { LogIn, Lock, Mail, Globe, AlertCircle } from 'lucide-react-native';
import { getServerUrl } from '../../src/services/config';
import { setAuthToken, setUserProfile } from '../../src/services/storage';
import { loginUser } from '../../src/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getServerUrl().then((url) => setServerUrl(url));
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const data = await loginUser({ email: email.trim(), password });
      if (data.token) {
        await setAuthToken(data.token);
        if (data.user) {
          await setUserProfile(data.user);
        }
        router.replace('/(chat)');
      } else {
        setErrorMsg('Invalid response from server. No token received.');
      }
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      const serverMessage =
        error.response?.data?.message || error.message || 'Login failed. Please check credentials.';
      setErrorMsg(serverMessage);
    } finally {
      setLoading(false);
    }
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
            {/* Server Badge */}
            <TouchableOpacity
              onPress={() => router.push('/server-select')}
              className="mb-8 flex-row items-center self-center rounded-full border border-border-light bg-surface-secondary px-3 py-1.5"
            >
              <Globe size={13} color="#10a37f" />
              <Text className="ml-1.5 text-xs font-medium text-text-secondary" numberOfLines={1}>
                {serverUrl || 'Configure Server'}
              </Text>
              <Text className="text-brand-green ml-2 text-xs font-semibold">Change</Text>
            </TouchableOpacity>

            {/* Header Brand */}
            <View className="mb-8 items-center">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-border-light bg-surface-secondary">
                <LogIn size={28} color="#10a37f" />
              </View>
              <Text className="text-2xl font-bold tracking-tight text-text-primary">
                Welcome back
              </Text>
              <Text className="mt-1 text-sm text-text-secondary">
                Sign in to your LibreChat account
              </Text>
            </View>

            {/* Form Fields */}
            <View className="gap-4">
              <View>
                <Text className="mb-1.5 text-xs font-semibold uppercase text-text-secondary">
                  Email
                </Text>
                <View className="flex-row items-center rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
                  <Mail size={18} color="#8e8e8e" />
                  <TextInput
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      setErrorMsg(null);
                    }}
                    placeholder="user@example.com"
                    placeholderTextColor="#666666"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="ml-2.5 flex-1 text-sm text-text-primary"
                  />
                </View>
              </View>

              <View>
                <Text className="mb-1.5 text-xs font-semibold uppercase text-text-secondary">
                  Password
                </Text>
                <View className="flex-row items-center rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
                  <Lock size={18} color="#8e8e8e" />
                  <TextInput
                    value={password}
                    onChangeText={(t) => {
                      setPassword(t);
                      setErrorMsg(null);
                    }}
                    placeholder="••••••••"
                    placeholderTextColor="#666666"
                    secureTextEntry
                    className="ml-2.5 flex-1 text-sm text-text-primary"
                  />
                </View>
              </View>
            </View>

            {/* Error Banner */}
            {errorMsg && (
              <View className="mt-4 flex-row items-center rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                <AlertCircle size={16} color="#ef4444" />
                <Text className="ml-2 flex-1 text-xs font-medium text-red-400">{errorMsg}</Text>
              </View>
            )}
          </View>

          {/* Action Button */}
          <View className="mt-8">
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className="bg-brand-green shadow-brand-green/20 w-full items-center justify-center rounded-xl py-3.5 shadow-lg"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-bold text-white">Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
