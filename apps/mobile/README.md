# LibreChat Mobile (`apps/mobile`)

The official cross-platform native mobile client for LibreChat built with **Expo (React Native)**, **`@assistant-ui/react-native`**, and **NativeWind (Tailwind CSS)**.

## Features

- **Dynamic Server Connection**: Connect to local dev (`localhost:3080`), local Wi-Fi LAN IP, or a deployed LibreChat server.
- **Real-Time Streaming Chat**: Native Server-Sent Events (SSE) streaming compliant with LibreChat's Generation Protocol v2.
- **AI Tool & Reasoning Cards**: Dedicated UI indicators for model thinking / reasoning and agent tool execution.
- **Sandboxed Artifacts Preview**: Fullscreen interactive WebView preview for HTML/JS, SVG, and Mermaid diagrams with code/preview switching.
- **Hardware-Backed Token Security**: `expo-secure-store` encrypts session JWTs and user credentials.
- **Conversation History Drawer**: Thread management, model selection, and account switching.

## Quick Start (Local Testing)

### 1. Start the LibreChat Backend
Ensure your LibreChat backend server is running:
```bash
# In the repository root:
npm run backend
```
*(By default, the backend listens at `http://localhost:3080`)*

### 2. Start the Expo Mobile Development Server
From the root or from `apps/mobile`:
```bash
cd apps/mobile
npm run dev
```

### 3. Running on Devices / Emulators
- **iOS Simulator**: Press `i` in the terminal.
- **Android Emulator**: Press `a` in the terminal.
- **Physical Phone (Expo Go)**:
  1. Install **Expo Go** from the iOS App Store or Google Play Store.
  2. Scan the QR code displayed in the terminal.
  3. When prompted in the app's server configuration screen, enter your computer's local Wi-Fi IP (e.g., `http://192.168.1.50:3080`).
