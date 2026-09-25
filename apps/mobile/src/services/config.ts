import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import Constants from 'expo-constants';

const STORAGE_KEY_SERVER_URL = 'librechat_server_url';

export const getDetectedDevUrl = (): string => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:3080`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3080' : 'http://localhost:3080';
};

export const DEFAULT_DEV_URL = getDetectedDevUrl();

let cachedServerUrl: string | null = null;

export async function hasSavedServerUrl(): Promise<boolean> {
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEY_SERVER_URL);
    return Boolean(saved);
  } catch {
    return false;
  }
}

export async function getServerUrl(): Promise<string> {
  if (cachedServerUrl) {
    return cachedServerUrl;
  }
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEY_SERVER_URL);
    if (saved) {
      cachedServerUrl = saved;
      return saved;
    }
  } catch (error) {
    console.warn('[Config] Error reading server URL from secure store:', error);
  }
  cachedServerUrl = DEFAULT_DEV_URL;
  return DEFAULT_DEV_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  const sanitized = url.trim().replace(/\/+$/, '');
  cachedServerUrl = sanitized;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY_SERVER_URL, sanitized);
  } catch (error) {
    console.error('[Config] Error saving server URL:', error);
  }
}

export interface ServerHealthCheckResult {
  ok: boolean;
  status: number;
  message?: string;
}

export async function testServerConnection(url: string): Promise<ServerHealthCheckResult> {
  const sanitized = url.trim().replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${sanitized}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok || response.status === 404 || response.status === 401) {
      // 200/404/401 indicates server is reachable
      return { ok: true, status: response.status };
    }
    return {
      ok: false,
      status: response.status,
      message: `Server returned status ${response.status}`,
    };
  } catch (err) {
    const error = err as Error;
    return {
      ok: false,
      status: 0,
      message: error.name === 'AbortError' ? 'Connection timed out' : error.message,
    };
  }
}
