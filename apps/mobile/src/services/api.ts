import axios, { AxiosRequestConfig } from 'axios';
import { getServerUrl } from './config';
import { getAuthToken, clearAuthSession } from './storage';

export async function createApiClient() {
  const baseURL = await getServerUrl();
  const token = await getAuthToken();

  const client = axios.create({
    baseURL,
    timeout: 20000,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        console.warn('[API] 401 Unauthorized encountered');
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    username?: string;
  };
}

export async function loginUser(payload: LoginPayload): Promise<LoginResponse> {
  const client = await createApiClient();
  const response = await client.post<LoginResponse>('/api/auth/login', payload);
  return response.data;
}

export interface ConvoItem {
  conversationId: string;
  title: string;
  endpoint: string;
  model?: string;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationsResponse {
  conversations: ConvoItem[];
  pageNumber: number;
  pageSize: number;
  pages: number;
}

export async function fetchConversations(pageNumber = 1): Promise<ConversationsResponse> {
  const client = await createApiClient();
  const response = await client.get<ConversationsResponse>(
    `/api/convos?pageNumber=${pageNumber}&pageSize=30`,
  );
  return response.data;
}

export async function fetchConversationMessages(conversationId: string) {
  const client = await createApiClient();
  const response = await client.get(`/api/messages/${conversationId}`);
  return response.data;
}

export async function deleteConversation(conversationId: string) {
  const client = await createApiClient();
  const response = await client.delete('/api/convos', {
    data: { arg: { conversationId } },
  });
  return response.data;
}

export async function fetchStartupConfig() {
  const client = await createApiClient();
  const response = await client.get('/api/config');
  return response.data;
}

export async function fetchEndpoints() {
  const client = await createApiClient();
  const response = await client.get('/api/endpoints');
  return response.data;
}
