# Developer & Agent Continuation Guide (`apps/mobile`)

This guide is designed for developers and AI agents taking over or contributing to the LibreChat Mobile native application. It details architectural standards, networking protocols, design conventions, and instructions for testing.

---

## 1. Directory Structure

```
apps/mobile/
├── app/                      # Expo Router navigation (file-based)
│   ├── _layout.tsx           # Root provider layout & auth session gate
│   ├── server-select.tsx     # Server host configuration screen
│   ├── (auth)/
│   │   └── login.tsx         # User authentication screen
│   └── (chat)/
│       ├── _layout.tsx       # Chat stack navigation
│       └── index.tsx         # Main chat interface & conversation feed
├── src/
│   ├── components/           # Reusable UI components
│   │   └── ArtifactModal.tsx # Sandboxed WebView code/preview renderer
│   └── services/             # Core logic & API layer
│       ├── api.ts            # Axios HTTP client for standard REST endpoints
│       ├── config.ts         # Server URL resolution & fallback logic
│       ├── storage.ts        # Encrypted storage (expo-secure-store)
│       └── transport.ts      # SSE streaming adhering to Generation Protocol v2
├── specs/                    # Specification & parity documentation
│   ├── README.md
│   ├── MISSION.md
│   ├── FEATURE_PARITY_MATRIX.md
│   ├── ROADMAP.md
│   └── CONTINUATION_GUIDE.md
├── tailwind.config.js        # NativeWind semantic theme tokens
└── package.json              # Mobile package dependencies
```

---

## 2. Generation Protocol v2 Specification

All streaming communication with the LibreChat backend must strictly follow **Generation Protocol v2**:

### Request Headers
```http
POST /api/ask HTTP/1.1
Content-Type: application/json
Accept: text/event-stream
X-LibreChat-Generation-Protocol: 2
Authorization: Bearer <JWT_TOKEN>
```
*(For Agent runs, the endpoint is `/api/agents/chat` instead of `/api/ask`).*

### Request Body Schema
```typescript
{
  text: string;                  // User prompt
  conversationId?: string;       // Omit for new chats; supply for continuing
  parentMessageId?: string;      // The message being replied to (for branching)
  endpoint: string;              // e.g., 'openAI', 'anthropic', 'google', 'agents'
  model?: string;                // e.g., 'gpt-4o', 'claude-3-5-sonnet'
  agent_id?: string;             // Supplied when endpoint is 'agents'
  generationProtocolVersion: 2;  // Protocol enforcement
  isCreatedByUser: true;
}
```

### Event Stream Chunks
The server sends standard Server-Sent Events (`data: <json>\n\n`):
1. **Delta Chunks**: `{ "text": "...", "delta": "..." }` or non-JSON chunk prefixed with `0:"..."`.
2. **Reasoning / Thought**: `{ "thought": "..." }`.
3. **Tool Invocations**: `{ "tool_calls": [...] }` or `{ "toolCall": { "name": "...", "args": {...} } }`.
4. **Metadata**: `{ "conversationId": "...", "messageId": "..." }`.
5. **Terminal Completion**:
   - Explicit `data: [DONE]`
   - Or `{ "final": true }` / `{ "done": true }`.

---

## 3. Storage & Security Architecture

1. **Hardware-Backed Encryption**:
   Always use `expo-secure-store` via [`apps/mobile/src/services/storage.ts`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/src/services/storage.ts) to store:
   - `librechat_auth_token` (JWT)
   - `librechat_user_profile` (Serialized user metadata)
   - `librechat_server_url` (Custom backend host)
2. **No Cleartext Credentials**:
   Never write authentication tokens, passwords, or provider API keys to `AsyncStorage` or unencrypted storage.
3. **Session Invalidation**:
   If an API call returns `401 Unauthorized`, clear the stored token via `clearAuthSession()` and redirect to `/(auth)/login`.

---

## 4. Styling & Theme Conventions

- **NativeWind (Tailwind CSS)**: Use Tailwind utility classes via `className="..."`.
- **Semantic Theme Tokens**:
  Always use semantic color tokens from [`tailwind.config.js`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/tailwind.config.js):
  - Backgrounds: `bg-background`, `bg-surface-primary`, `bg-surface-secondary`, `bg-surface-tertiary`
  - Borders: `border-border-light`, `border-border-medium`
  - Text: `text-text-primary`, `text-text-secondary`, `text-text-tertiary`
  - Brand: `bg-brand-green`, `text-brand-green`
- **Avoid Hardcoded Colors**: Do not use raw hex strings like `#ffffff` or `#121212` in new component classes.

---

## 5. Running & Testing Locally

### Step 1: Start the LibreChat Backend
From the repository root:
```bash
npm run backend
```
*Backend runs at `http://localhost:3080` (or `http://<YOUR_LAN_IP>:3080`).*

### Step 2: Start the Expo Development Server
```bash
cd apps/mobile
npm run dev
```

### Step 3: Device / Simulator Connection
- **iOS Simulator** (Mac): Press `i` in the Expo terminal.
- **Android Emulator**: Press `a` in the Expo terminal.
- **Physical Phone (Expo Go)**:
  1. Open Expo Go and scan the terminal QR code.
  2. In the app's **Server Connection** screen, enter your computer's local Wi-Fi IP address (e.g., `http://192.168.1.100:3080`). **Do not use `http://localhost:3080` on physical phones**, as `localhost` points to the mobile device itself.

---

## 6. Common Issues & Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| `Network Error` on login | Physical phone connecting to `localhost:3080` | Tap "Change Server" on the login screen and enter your machine's LAN IP (`http://192.168.x.x:3080`). Ensure the phone and computer are on the same Wi-Fi network. |
| Stream cuts off abruptly | Missing `generationProtocolVersion: 2` | Ensure every streaming request payload passes `generationProtocolVersion: 2` and header `X-LibreChat-Generation-Protocol: 2`. |
| Unparsed Markdown | Using raw `<Text>` component | Replace `<Text>{item.content}</Text>` with a markdown renderer as outlined in Phase 1 of [`ROADMAP.md`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/ROADMAP.md). |
| NativeWind classes not applying | Missing Babel cache bust | Clear Metro cache with `npx expo start -c`. |
