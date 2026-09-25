import * as SecureStore from 'expo-secure-store';

const KEY_JWT_TOKEN = 'librechat_auth_jwt';
const KEY_REFRESH_TOKEN = 'librechat_auth_refresh';
const KEY_USER_DATA = 'librechat_user_profile';

export interface MobileUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  avatar?: string;
  role?: string;
}

let inMemoryToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (inMemoryToken) {
    return inMemoryToken;
  }
  try {
    const token = await SecureStore.getItemAsync(KEY_JWT_TOKEN);
    inMemoryToken = token;
    return token;
  } catch (error) {
    console.warn('[Storage] Error reading auth token:', error);
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  inMemoryToken = token;
  try {
    await SecureStore.setItemAsync(KEY_JWT_TOKEN, token);
  } catch (error) {
    console.error('[Storage] Error setting auth token:', error);
  }
}

export async function clearAuthSession(): Promise<void> {
  inMemoryToken = null;
  try {
    await SecureStore.deleteItemAsync(KEY_JWT_TOKEN);
    await SecureStore.deleteItemAsync(KEY_REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(KEY_USER_DATA);
  } catch (error) {
    console.warn('[Storage] Error clearing auth session:', error);
  }
}

export async function getUserProfile(): Promise<MobileUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_USER_DATA);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setUserProfile(user: MobileUser): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_USER_DATA, JSON.stringify(user));
  } catch (error) {
    console.error('[Storage] Error setting user profile:', error);
  }
}
