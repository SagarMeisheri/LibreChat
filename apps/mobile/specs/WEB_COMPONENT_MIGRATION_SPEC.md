# Web Component to Mobile Native Migration Specification

This specification provides the comprehensive architectural blueprint for converting all components from [`client/src/components`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components) into first-class native mobile equivalents in [`apps/mobile`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile).

---

## Architecture Summary: Web vs. Native Equivalents

| Web Domain (`client/src/components/`) | Web Implementation | Mobile Native Implementation (`apps/mobile/`) | Touch / Mobile UX Adaptation |
| :--- | :--- | :--- | :--- |
| **Input / ChatForm** | HTML textarea, mouse buttons, popovers | Native `TextInput` with auto-growing height, bottom-docked action bar | Accessory bar above keyboard (`KeyboardAvoidingView`), quick-action carousel |
| **Messages / Content** | DOM HTML, ReactMarkdown, KaTeX HTML | `react-native-markdown-display`, `react-native-svg`, micro-WebView for KaTeX | Tap-to-expand, code copy haptics, horizontal code scrolling |
| **SidePanel** | Desktop resizable sidebar (320px-600px) | Sliding drawer modal (`Modal` / `@gorhom/bottom-sheet`) | Full-width or 85% sliding sheet accessible via header buttons |
| **Endpoints & Models** | Radix DropdownMenu, popovers | Scrollable Bottom Sheet with category sections | Searchable grouped list (OpenAI, Anthropic, Google, etc.) with badges |
| **Files & Attachments** | Browser drag & drop, file `<input>` | `expo-image-picker` (Camera/Gallery), `expo-document-picker` | Native iOS/Android action sheet: "Take Photo", "Choose from Library", "Browse Files" |
| **Audio (STT / TTS)** | Web Speech API, MediaRecorder | `expo-av` recording + Whisper API, `expo-speech` playback | Dedicated microphone button with waveform pulsation animation |
| **Agents & Subagents** | Builder tabs, tool assignment grids | Dedicated Agent stack screens and expandable turn cards | Tabbed bottom sheet for Agent details, live progress pill for subagents |
| **MCP (Tools Protocol)** | Dialogs, server status indicators, OAuth popups | Native tool execution cards, `expo-web-browser` for OAuth | Expandable accordion cards displaying JSON args and formatted outputs |
| **Artifacts** | Multi-tab side panel with iframe sandbox | Fullscreen modal with `react-native-webview` | Split tabs: "Visual Preview" vs "Code Inspection" with copy/share buttons |
| **Nav & Conversations** | Collapsible desktop sidebar | Slide-over drawer with search, swipe actions | Swipe-left to delete or pin; pull-to-refresh; infinite scroll pagination |
| **Auth** | Multi-screen web layout, OAuth popups | Native auth screen stack, `expo-auth-session` | Deep linking (`librechat://auth-callback`) for Google/GitHub/SSO |
| **Settings & Appearance** | Multi-tab modal dialog | Hierarchical settings screen (`expo-router` stack) | Native switch toggles, grouped table rows (iOS Settings style) |

---

## Detailed Component Migration Guide

### 1. Chat Input & Composer (`client/src/components/Chat/Input`)

#### Web Source Reference:
- [`client/src/components/Chat/Input/ChatForm.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/ChatForm.tsx)
- [`client/src/components/Chat/Input/Files`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/Files)
- [`client/src/components/Chat/Input/AudioRecorder.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/AudioRecorder.tsx)
- [`client/src/components/Chat/Input/Mention.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/Mention.tsx)
- [`client/src/components/Chat/Input/SteerMenu.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/SteerMenu.tsx)

#### Mobile Native Blueprint:
1. **Attachment Chip Carousel**:
   - Above the text input, render a horizontal `ScrollView` containing uploaded file chips.
   - Each chip displays an image thumbnail or document icon, file name, and an (X) delete button.
2. **Growing Input Bar**:
   - `TextInput` with `multiline={true}`, bounded by `maxHeight: 120`.
   - Accessory row containing:
     - Attachment button (Paperclip) triggering native media picker.
     - Tools / Agent mention button (`@`).
     - Voice recorder button (Microphone).
     - Send / Stop button with smooth animated crossfade.
3. **In-Flight Steers & Preemptions**:
   - While generation is running, display an "Interrupt & Steer" button allowing users to inject mid-generation feedback conforming to Generation Protocol v2.

---

### 2. Message Content & Code Rendering (`client/src/components/Messages`)

#### Web Source Reference:
- [`client/src/components/Messages/Content/Markdown.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages/Content)
- [`client/src/components/Messages/Content/CodeBlock.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages/Content/CodeBlock.tsx)
- [`client/src/components/Messages/Content/RunCode.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages/Content/RunCode.tsx)

#### Mobile Native Blueprint:
1. **Markdown Formatting**:
   - Use `react-native-markdown-display` styled with NativeWind typography tokens (`text-text-primary`, `leading-6`).
   - Custom render rules for headers (`h1-h4`), bullet points, tables, and blockquotes.
2. **Native Code Block (`CodeCard.tsx`)**:
   - Header bar with language icon (`LangIcon.tsx`), syntax label, and one-touch Copy button.
   - Code body rendered in monospace font with horizontal scrolling (`showsHorizontalScrollIndicator={false}`).
   - "Run Code" badge if attached code environment is active.
3. **LaTeX / KaTeX Equations**:
   - Block equations rendered with responsive SVG math formatting or isolated micro-WebView instances to prevent CSS leakage.

---

### 3. Endpoints & Model Selection (`client/src/components/Endpoints`)

#### Web Source Reference:
- [`client/src/components/Endpoints`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints)
- [`client/src/components/SidePanel/Parameters`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel/Parameters)

#### Mobile Native Blueprint:
1. **Dynamic Model Bottom Sheet**:
   - Fetch endpoints via `fetchEndpoints()` (`/api/endpoints`) and models via `/api/models`.
   - Filterable search bar at top of sheet.
   - Section headers: OpenAI, Anthropic, Google Gemini, Custom Models, Autonomous Agents.
2. **Model Parameter Tuning Sheet**:
   - Dedicated configuration sheet:
     - Sliders for Temperature (`0.0` - `2.0`), Top P (`0.0` - `1.0`), Max Output Tokens.
     - Switch toggles for Stream responses and Code Interpreter.
     - Custom system prompt input field.

---

### 4. SidePanel Capabilities (`client/src/components/SidePanel`)

#### Web Source Reference:
- [`client/src/components/SidePanel/Agents`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel/Agents)
- [`client/src/components/SidePanel/Bookmarks`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel/Bookmarks)
- [`client/src/components/SidePanel/Memories`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel/Memories)
- [`client/src/components/SidePanel/Schedules`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel/Schedules)

#### Mobile Native Blueprint:
On mobile, the desktop side panel converts into **tabbed modals or dedicated stack screens**:
- **Agent Directory (`/agents`)**: Browse public and personal custom agents with system instructions, avatar, and assigned tools.
- **Bookmarks (`/bookmarks`)**: View and search all tagged/bookmarked message snippets across conversations.
- **Memories (`/settings/memories`)**: Review what LibreChat has learned about the user with one-tap memory deletion.
- **Scheduled Runs (`/schedules`)**: Inspect scheduled agent executions and their status.

---

### 5. Files & Multimodal Pipeline (`client/src/components/Files`)

#### Web Source Reference:
- [`client/src/components/Files`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Files)

#### Mobile Native Blueprint:
1. **Media Picker Modal**:
   ```typescript
   // Camera capture
   const photo = await ImagePicker.launchCameraAsync({
     mediaTypes: ImagePicker.MediaTypeOptions.Images,
     quality: 0.8,
   });
   // Document selection
   const doc = await DocumentPicker.getDocumentAsync({
     type: ['application/pdf', 'text/*', 'application/json'],
   });
   ```
2. **Upload Manager**:
   - Dispatch `FormData` multipart POST to `/api/files/upload`.
   - Store resulting `file_id`, `filepath`, and MIME type in turn state.
   - Include files array in streaming request payload (`files: [{ file_id, ... }]`).

---

### 6. Tools, MCP & Approvals (`client/src/components/MCP` & `Plugins`)

#### Web Source Reference:
- [`client/src/components/MCP`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/MCP)
- [`client/src/components/Chat/Input/CodeApprovalMenu.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input/CodeApprovalMenu.tsx)

#### Mobile Native Blueprint:
1. **Tool Invocation Cards**:
   - Collapsible cards during streaming:
     - Header: Tool name + status pill (Running, Completed, Errored).
     - Body: Accordion showing JSON input arguments and sanitized tool output.
2. **Human-in-the-Loop Approvals**:
   - Native Alert or Bottom Sheet when an agent pauses with an action approval request:
     - Clear description of the pending tool call (e.g., executing code or mutating files).
     - Prominent "Approve" (green) and "Reject" (red) buttons sending approval token back to `/api/agents/chat`.

---

### 7. Audio, Voice & Speech (`client/src/components/Audio`)

#### Web Source Reference:
- [`client/src/components/Audio/SpeechToText.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Audio/SpeechToText.tsx)
- [`client/src/components/Audio/TextToSpeech.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Audio/TextToSpeech.tsx)

#### Mobile Native Blueprint:
1. **Speech-to-Text (STT)**:
   - Record user voice in AAC/M4A format via `expo-av`.
   - Send to `/api/audio/transcriptions` (Whisper model) or native on-device speech recognizer.
   - Insert transcribed text directly into the chat input bar.
2. **Text-to-Speech (TTS)**:
   - Speaker button on assistant message header.
   - Streams audio from `/api/audio/speech` or utilizes `expo-speech` with device voice synthesis.

---

### 8. Conversation Management, Search & Sharing (`client/src/components/Nav`, `Share`)

#### Web Source Reference:
- [`client/src/components/Nav`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav)
- [`client/src/components/Share`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Share)

#### Mobile Native Blueprint:
1. **Drawer Navigation**:
   - Search bar filtering conversations with debounce (300ms).
   - Infinite scroll list with `onEndReached` calling `fetchConversations(pageNumber + 1)`.
   - Swipeable list items (`Swipeable` from `react-native-gesture-handler`) for quick Archive, Pin, or Delete.
2. **Chat Title Editing**:
   - Long-press conversation title in header or drawer item to trigger inline rename.
3. **Native Sharing**:
   - Generate public share link via `/api/share` and launch native iOS/Android share sheet:
     ```typescript
     await Share.share({ url: shareUrl, title: conversation.title });
     ```

---

### 9. Authentication & Multi-Tenant Support (`client/src/components/Auth`)

#### Web Source Reference:
- [`client/src/components/Auth`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth)

#### Mobile Native Blueprint:
1. **OAuth & Social Logins**:
   - Use `expo-auth-session` / `expo-web-browser` with custom redirect URI (`librechat://auth-callback`).
   - Listen for deep links returning the authentication JWT.
2. **Two-Factor Authentication (2FA)**:
   - Dedicated 6-digit TOTP input screen with automatic paste and auto-submit.
3. **Password Reset & Email Verification**:
   - Clean, touch-first forms with validation messages matching backend schemas.
