# Mobile Data & State Architecture Specification

This document details the data contracts, caching strategies, state management, and offline behavior for the LibreChat Mobile application ([`apps/mobile`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile)).

---

## 1. Shared Monorepo Integration (`@librechat/data-provider`)

The mobile app must avoid re-declaring API types, schemas, and endpoint definitions by directly leveraging the existing workspace package [`packages/data-provider`](file:///Users/sagarmeisheri/Apps/LibreChat/packages/data-provider).

### Imported Capabilities:
* **Types & Enums**: `EModelEndpoint`, `TConversation`, `TMessage`, `TEndpointsConfig`, `TUser`.
* **API Endpoints**: Route paths (`/api/convos`, `/api/messages`, `/api/models`, `/api/endpoints`, `/api/files`).
* **Query Keys**: Canonical query keys for TanStack Query (`QueryKeys.allConversations`, `QueryKeys.models`).

---

## 2. Server State: TanStack React Query

All asynchronous REST operations must be managed by **`@tanstack/react-query`**:

### Core Query Definitions:
```typescript
// 1. Fetching available endpoints and models
export const useEndpointsQuery = () =>
  useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

// 2. Paginated conversation history
export const useConversationsQuery = (pageNumber: number) =>
  useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam = 1 }) => fetchConversations(pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.pageNumber < lastPage.pages ? lastPage.pageNumber + 1 : undefined,
    initialPageParam: 1,
  });

// 3. Conversation messages
export const useConversationMessagesQuery = (conversationId: string) =>
  useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchConversationMessages(conversationId),
    enabled: !!conversationId,
  });
```

### Optimistic Updates:
* **Deleting a Conversation**: Instantly remove the conversation from the cached list and rollback on server error.
* **Renaming a Conversation**: Optimistically update title in the header and drawer list.

---

## 3. Client State: Jotai Atoms

Following the LibreChat client architecture guidelines, all new client-side state is managed via **Jotai**:

```typescript
import { atom } from 'jotai';

// 1. Active Chat State
export const activeConversationIdAtom = atom<string>('');
export const activeModelAtom = atom<{
  id: string;
  name: string;
  endpoint: string;
}>({
  id: 'gpt-4o',
  name: 'GPT-4o',
  endpoint: 'openAI',
});

// 2. Draft & Attachments
export const activeInputTextAtom = atom<string>('');
export const attachedFilesAtom = atom<
  Array<{
    file_id: string;
    filepath: string;
    filename: string;
    type: string;
    size: number;
    previewUri?: string;
  }>
>([]);

// 3. Generation State
export const isStreamingAtom = atom<boolean>(false);
export const activeAbortControllerAtom = atom<AbortController | null>(null);

// 4. UI Sheets & Drawers
export const historyDrawerOpenAtom = atom<boolean>(false);
export const modelPickerOpenAtom = atom<boolean>(false);
export const parametersSheetOpenAtom = atom<boolean>(false);
```

---

## 4. Hardware Security & Token Life Cycle

1. **Token Refresh Protocol**:
   - Store access JWT and optional refresh token in `expo-secure-store`.
   - On encountering `401 Unauthorized`:
     1. Attempt silent token refresh via `/api/auth/refresh`.
     2. If refresh succeeds, retry the failed request with the new access token.
     3. If refresh fails, clear all credentials via `clearAuthSession()` and route user to `/(auth)/login`.
2. **Biometric Unlock (Optional)**:
   - Provide an optional `LocalAuthentication` gate (FaceID / TouchID / Android Biometrics) before decrypting stored tokens on cold app launch.

---

## 5. Network Resiliency & Disconnection Strategy

Mobile devices frequently switch networks. The streaming transport must handle connection drops cleanly:

1. **Transient Network Drop**:
   - If an active SSE stream terminates without a `[DONE]` event or `final: true` indicator, flag the message status as `interrupted`.
2. **One-Tap Retry / Resume**:
   - Provide a "Resume / Retry" pill directly on the interrupted assistant bubble.
   - Resend continuation request using `parentMessageId` pointing to the last confirmed turn.
3. **Draft Preservation**:
   - User input text in the composer is automatically retained across app backgrounding and unexpected app terminations.
