# LibreChat Mobile Implementation Roadmap

This roadmap outlines the systematic path from the current MVP to **complete feature parity** with LibreChat Web. Each phase represents a self-contained, testable milestone.

---

## Phase 1: Rich Text, Syntax Highlighting & Math (Immediate Priority)

**Objective**: Eliminate unparsed raw text messages and bring the reading experience up to modern AI chat standards.

- [ ] **1.1. Native Markdown Parsing**:
  - Replace raw `<Text>` message rendering with `react-native-markdown-display` or customized native markdown components.
  - Implement support for bold, italic, strikethrough, blockquotes, ordered/unordered lists, and hyperlinked URLs.
- [ ] **1.2. Code Blocks & Syntax Highlighting**:
  - Add dedicated code card with language banner (e.g., Python, TypeScript, SQL).
  - Add one-tap "Copy Code" button with haptic feedback.
  - Add horizontal scrolling for long code lines and line-wrapping toggle.
- [ ] **1.3. LaTeX / Math Rendering**:
  - Render inline math (`$...$`) and block equations (`$$...$$`) using a lightweight KaTeX native view or micro-WebView renderer.
- [ ] **1.4. Collapsible Thought / Reasoning View**:
  - Add collapsible accordion for model thinking blocks (`item.thought`) with elapsed thinking duration timer and polished animations.

---

## Phase 2: Dynamic Endpoints, Models & Parameters

**Objective**: Remove all hardcoded models and connect directly to the server's endpoint discovery engine.

- [ ] **2.1. Dynamic Endpoints & Models Fetching**:
  - Implement `fetchStartupConfig()` and `fetchEndpoints()` from [`apps/mobile/src/services/api.ts`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/src/services/api.ts).
  - Support all LibreChat providers: OpenAI, Anthropic, Google, Azure, Mistral, Bedrock, Ollama, and Custom endpoints.
- [ ] **2.2. Enhanced Model Switcher**:
  - Replace static model picker with a grouped, searchable modal sheet categorized by provider.
  - Display model avatars/icons and context window metadata.
- [ ] **2.3. Model Parameters Sheet**:
  - Bottom sheet to adjust parameters: Temperature, Top P, Max Output Tokens, Presence/Frequency Penalty, and System Instructions.
- [ ] **2.4. Custom User API Keys**:
  - Secure modal allowing users to input and store their own provider API keys if allowed by server configuration.

---

## Phase 3: Conversation Tree, Forking & Message Actions

**Objective**: Give mobile users full control over message branches and the conversation lifecycle.

- [ ] **3.1. Message Editing & Forking**:
  - Long-press or tap pencil icon on user messages to edit prompt text.
  - Dispatch new turn with `parentMessageId` pointing to the edited turn's parent, creating a new branch.
- [ ] **3.2. Branch Navigation**:
  - Render `< 1 / 3 >` pagination controls when multiple siblings exist under a parent message.
  - Allow switching active branch without reloading the entire chat.
- [ ] **3.3. Response Regeneration & Continuation**:
  - Add "Regenerate" button under assistant turns with model swap option.
  - Add "Continue" button when generation hits model token limits.
- [ ] **3.4. Message Quick Actions**:
  - Long-press contextual action sheet: Copy text, Share snippet, Thumbs up / down feedback, and Bookmark.

---

## Phase 4: Multimodal Attachments & Voice

**Objective**: Enable camera, photo, document, and speech capabilities.

- [ ] **4.1. Image & Document Picker**:
  - Integrate `expo-image-picker` for camera and photo gallery uploads.
  - Integrate `expo-document-picker` for PDFs, TXT, CSV, and code files.
- [ ] **4.2. Upload Service & Composer Preview**:
  - Upload files to `/api/files/upload` with multipart form data.
  - Render preview chips in the input bar with upload progress indicators and removal (X) button.
  - Pass uploaded `file_id` references in the streaming turn payload.
- [ ] **4.3. Speech-to-Text (STT)**:
  - Add microphone button in the input bar.
  - Record audio via `expo-av` and stream to LibreChat's Whisper transcription endpoint `/api/audio/transcriptions`.
- [ ] **4.4. Text-to-Speech (TTS)**:
  - Add speaker icon on assistant messages to trigger audio playback via `/api/audio/speech` or native `expo-speech`.

---

## Phase 5: Agents, Subagents & MCP (Model Context Protocol)

**Objective**: Bring LibreChat's premier agentic workflows and tool integrations to native mobile.

- [ ] **5.1. Agent Browser & Selector**:
  - Fetch user's accessible agents via `/api/agents`.
  - Allow switching between standard endpoints and custom autonomous agents.
  - Display agent avatar, description, and assigned tools.
- [ ] **5.2. MCP Tools Execution & Inspection**:
  - Render expandable tool execution cards displaying tool name, arguments, execution status, and return output.
- [ ] **5.3. Human-in-the-Loop Approvals**:
  - Modal sheet when an agent pauses for user confirmation (`suspension` / `action_approval`).
  - One-tap "Approve" or "Reject" response back to the execution host.
- [ ] **5.4. Subagent Activity Stream**:
  - Dedicated sub-panel for tracking background subagent threads, status, and intermediate thinking.
- [ ] **5.5. MCP OAuth Bridge**:
  - Handle OAuth authorization requests for external MCP tools using `expo-web-browser`.

---

## Phase 6: Auth Expansion, Theming, Search & Polish

**Objective**: Enterprise-grade authentication, search, theming, and offline resilience.

- [ ] **6.1. Social & SSO Authentication**:
  - Support Google, GitHub, Apple, and OpenID Connect / SAML login flows via deep-linking redirect schemas (`librechat://auth-callback`).
- [ ] **6.2. Two-Factor Authentication (2FA)**:
  - In-app 6-digit TOTP verification screen.
- [ ] **6.3. Conversation Search & Pagination**:
  - Infinite scroll pagination in the conversation drawer (`pageNumber++`).
  - Search bar with client & server-side query filtering.
- [ ] **6.4. Theme Management**:
  - Settings screen to choose Dark, Light, or System appearance, persisting to `expo-secure-store`.
- [ ] **6.5. Sharing & Exporting**:
  - Export chat history as Markdown or JSON; share public link via native share sheet (`Share.share`).
