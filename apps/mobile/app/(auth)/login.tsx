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
    } catch (err: any) {
      const serverMessage =
        err.response?.data?.message || err.message || 'Login failed. Please check credentials.';
      setErrorMsg(serverMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="px-6 py-8 justify-between">
          <View>
            {/* Server Badge */}
            <TouchableOpacity
              onPress={() => router.push('/server-select')}
              className="flex-row items-center self-center bg-surface-secondary px-3 py-1.5 rounded-full border border-border-light mb-8"
            >
              <Globe size={13} color="#10a37f" />
              <Text className="text-text-secondary text-xs ml-1.5 font-medium" numberOfLines={1}>
                {serverUrl || 'Configure Server'}
              </Text>
              <Text className="text-brand-green text-xs font-semibold ml-2">Change</Text>
            </TouchableOpacity>

            {/* Header Brand */}
            <View className="items-center mb-8">
              <View className="w-16 h-16 rounded-2xl bg-surface-secondary border border-border-light items-center justify-center mb-4">
                <LogIn size={28} color="#10a37f" />
              </View>
              <Text className="text-text-primary text-2xl font-bold tracking-tight">
                Welcome back
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                Sign in to your LibreChat account
              </Text>
            </View>

            {/* Form Fields */}
            <View className="gap-4">
              <View>
                <Text className="text-text-secondary text-xs font-semibold uppercase mb-1.5">
                  Email
                </Text>
                <View className="flex-row items-center bg-surface-primary rounded-xl border border-border-light px-3.5 py-3">
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
                    className="flex-1 text-text-primary text-sm ml-2.5"
                  />
                </View>
              </View>

              <View>
                <Text className="text-text-secondary text-xs font-semibold uppercase mb-1.5">
                  Password
                </Text>
                <View className="flex-row items-center bg-surface-primary rounded-xl border border-border-light px-3.5 py-3">
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
                    className="flex-1 text-text-primary text-sm ml-2.5"
                  />
                </View>
              </View>
            </View>

            {/* Error Banner */}
            {errorMsg && (
              <View className="flex-row items-center bg-red-500/10 border border-red-500/30 p-3 rounded-xl mt-4">
                <AlertCircle size={16} color="#ef4444" />
                <Text className="text-red-400 text-xs ml-2 flex-1 font-medium">{errorMsg}</Text>
              </View>
            )}
          </View>

          {/* Action Button */}
          <View className="mt-8">
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className="w-full bg-brand-green py-3.5 rounded-xl items-center justify-center shadow-lg shadow-brand-green/20"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-white font-bold text-sm">Sign In</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
