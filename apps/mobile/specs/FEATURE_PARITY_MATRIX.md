# LibreChat Feature Parity Matrix: Web vs Mobile

This document provides an exhaustive comparison between the features available in the LibreChat Web application ([`client/src`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src)) and the LibreChat Mobile native application ([`apps/mobile`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile)).

**Status Legend:**
- ✅ **Implemented**: Fully working in mobile.
- 🟡 **Partial / In Progress**: Basic or mocked version exists, requires full web parity.
- ❌ **Missing**: Not yet implemented in mobile.
- 🔄 **Not Applicable**: Web-only browser capability (e.g. desktop window manager).

---

## 1. Models, Endpoints & Presets

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Dynamic Endpoint Discovery** | [`client/src/components/Endpoints`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints) | ❌ Missing | Fetch `/api/endpoints` to discover enabled providers (OpenAI, Anthropic, Google, Azure, Mistral, Ollama, Bedrock, Custom). Mobile currently hardcodes 3 models. |
| **Dynamic Model Listing** | [`client/src/components/Endpoints`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints) | ❌ Missing | Fetch `/api/models` to display available models for each endpoint. |
| **Model Parameters Tuning** | [`client/src/components/Endpoints/Settings`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints) | ❌ Missing | Configure `temperature`, `top_p`, `max_tokens`, `presence_penalty`, `frequency_penalty`, and system instructions per chat turn. |
| **Custom User API Keys** | [`client/src/components/Endpoints/Settings`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints) | ❌ Missing | Allow users to supply their own API keys / custom URLs if enabled by server admin. |
| **Presets Management** | [`client/src/components/Endpoints/Presets`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Endpoints) | ❌ Missing | Save, edit, and apply prompt/model presets. |

---

## 2. Chat, Messaging & Conversation Tree

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Generation Protocol v2 SSE** | [`api/server/routes/ask/`](file:///Users/sagarmeisheri/Apps/LibreChat/api) | ✅ Implemented | SSE streaming using `fetch` + `ReadableStream` with delta chunks. |
| **Abort / Stop Generation** | [`client/src/components/Chat/Input`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Input) | ✅ Implemented | AbortController cancellation signal wired to streaming request. |
| **Thinking / Reasoning Badge** | [`client/src/components/Chat/Messages`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | 🟡 Partial | Renders thought text, but needs collapsible accordion and timer. |
| **Markdown & Formatting** | [`client/src/components/Messages/Content/Markdown.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages) | ❌ Missing | Currently renders raw `<Text>`. Needs bold, italics, lists, blockquotes, tables, and links. |
| **Syntax-Highlighted Code** | [`client/src/components/Messages/Content/CodeBlock.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages) | ❌ Missing | Syntax-highlighted code blocks with language badge, copy code button, and code wrapping. |
| **LaTeX / KaTeX Math** | [`client/src/components/Messages/Content/Markdown.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Messages) | ❌ Missing | Render inline math (`$...$`) and block math (`$$...$$`). |
| **Branching / Message Tree** | [`client/src/components/Chat/Messages/HoverButtons.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | ❌ Missing | Edit past user messages and navigate between response branches (`< 1 / 3 >`). |
| **Regenerate Response** | [`client/src/components/Chat/Messages`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | ❌ Missing | One-tap regenerate button for assistant turns. |
| **Continue Response** | [`client/src/components/Chat/Messages`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | ❌ Missing | Continue generation button when a model cuts off at max tokens. |
| **Message Feedback & Actions** | [`client/src/components/Chat/Messages`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | ❌ Missing | Thumbs up/down rating, copy message, and bookmarking. |

---

## 3. Multimodal & File Attachments

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **File Picker (Documents)** | [`client/src/components/Files`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Files) | ❌ Missing | Attach PDF, CSV, TXT, code files via `expo-document-picker`. |
| **Photo / Camera Upload** | [`client/src/components/Files`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Files) | ❌ Missing | Take photos directly or pick from camera roll using `expo-image-picker`. |
| **Upload Pipeline & Progress** | [`client/src/components/Files/Upload`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Files) | ❌ Missing | Upload to `/api/files/upload`, display progress ring, and attach file metadata to the turn. |
| **File Preview & Deletion** | [`client/src/components/Input/Files`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Input) | ❌ Missing | Thumbnail preview in input composer with a dismiss (X) button. |

---

## 4. Voice & Speech

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Speech-to-Text (STT)** | [`client/src/components/Audio/SpeechToText.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Audio) | ❌ Missing | Native microphone recording (`expo-av` / native STT) or Whisper `/api/audio/transcriptions`. |
| **Text-to-Speech (TTS)** | [`client/src/components/Audio/TextToSpeech.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Audio) | ❌ Missing | Read responses aloud using OpenAI TTS, ElevenLabs, or `expo-speech`. |
| **Continuous Voice Mode** | [`client/src/components/Audio`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Audio) | ❌ Missing | Hands-free back-and-forth conversational mode. |

---

## 5. Agents, Tools & MCP (Model Context Protocol)

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Agent Selection & Execution** | [`client/src/components/Agents`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Agents) | 🟡 Partial | `agentId` exists in transport layer, but no UI to browse, select, or configure agents. |
| **Subagent Threads & Live Activity** | [`client/src/components/SidePanel/Agent`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel) | ❌ Missing | Child conversation view and live activity stream for multi-agent workflows. |
| **MCP Server Tools & Discovery** | [`client/src/components/MCP`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/MCP) | ❌ Missing | View available MCP tools, trigger executions, and inspect inputs/outputs. |
| **Human-in-the-Loop Approvals** | [`client/src/components/Chat/Messages`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Chat/Messages) | ❌ Missing | Modal to approve or decline sensitive tool executions or prompt confirmations. |
| **MCP OAuth Authorization** | [`client/src/components/OAuth`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/OAuth) | ❌ Missing | In-app browser auth prompt (`expo-web-browser`) for MCP third-party OAuth. |
| **Plugins / Tools Selector** | [`client/src/components/Plugins`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Plugins) | ❌ Missing | Toggle DALL-E, Web Search, Wolfram Alpha, Calculator. |

---

## 6. Artifacts & Code Execution

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Sandboxed Preview (HTML/SVG)** | [`client/src/components/Artifacts`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Artifacts) | ✅ Implemented | Dedicated WebView modal preview with code inspection tab. |
| **Mermaid Diagram Rendering** | [`client/src/components/Artifacts`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Artifacts) | ✅ Implemented | Bundled Mermaid.js in WebView for architecture diagrams. |
| **Artifact History & Versions** | [`client/src/components/Artifacts`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Artifacts) | ❌ Missing | Navigate between previous code iterations. |
| **Attached Code Environment** | [`client/src/components/SidePanel/Code`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/SidePanel) | ❌ Missing | Code execution dispatch to Docker/SRT sandbox and output stream display. |

---

## 7. History, Organization & Search

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Conversation List & Switch** | [`client/src/components/Nav/Nav.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ✅ Implemented | Drawer modal with past chats and active chat loader. |
| **Delete Conversation** | [`client/src/components/Nav`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ✅ Implemented | Trash button with confirmation. |
| **Infinite Scroll Pagination** | [`client/src/components/Nav`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Fetch subsequent pages (`pageNumber++`) when scrolling down. |
| **Conversation Search** | [`client/src/components/Nav/NavSearch.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Search bar filtering chats by title and query content. |
| **Rename Conversation** | [`client/src/components/Nav`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Edit conversation title inline or via menu. |
| **Archive / Duplicate Chat** | [`client/src/components/Nav`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Archive chat out of main list; duplicate chat tree. |
| **Share Conversation** | [`client/src/components/Share`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Share) | ❌ Missing | Create public share link and manage shared chats. |
| **Export Chat** | [`client/src/components/Nav/ExportModal.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Export to Markdown, Text, or JSON. |

---

## 8. Authentication & Settings

| Feature | Web Reference | Mobile Status | Description / Requirements |
| :--- | :--- | :---: | :--- |
| **Local Login** | [`client/src/components/Auth/Login.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth) | ✅ Implemented | Email/password sign-in. |
| **Secure Token Storage** | [`client/src/components/Auth`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth) | ✅ Implemented | Hardware-backed encrypted storage with `expo-secure-store`. |
| **Registration / Sign Up** | [`client/src/components/Auth/Registration.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth) | ❌ Missing | In-app account registration if enabled by server. |
| **OAuth / SSO (Google, etc.)** | [`client/src/components/Auth`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth) | ❌ Missing | Social / SSO login using `expo-auth-session` / `WebBrowser`. |
| **Password Reset & 2FA** | [`client/src/components/Auth/TwoFactor`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Auth) | ❌ Missing | Forgot password flow and 2FA TOTP code verification. |
| **Theming (Dark/Light/OLED)** | [`client/src/components/Appearance`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Appearance) | 🟡 Partial | Tailwind dark theme styled; needs toggle for Light/Dark/System. |
| **Data Controls** | [`client/src/components/Nav/SettingsTabs/Data.tsx`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src/components/Nav) | ❌ Missing | Clear all conversations, revoke all sessions, delete account. |
