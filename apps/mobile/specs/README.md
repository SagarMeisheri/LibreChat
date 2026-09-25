# LibreChat Mobile Specifications (`apps/mobile/specs`)

Welcome to the central specification and architecture hub for the LibreChat Mobile native application.

The goal of this directory is to serve as the definitive source of truth for achieving **100% feature parity** between LibreChat Web ([`client/src`](file:///Users/sagarmeisheri/Apps/LibreChat/client/src)) and LibreChat Mobile ([`apps/mobile`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile)).

---

## Specification Documents Index

| Document | Purpose |
| :--- | :--- |
| **[MISSION.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/MISSION.md)** | Core mission, product vision, non-functional requirements, and design philosophy. |
| **[FEATURE_PARITY_MATRIX.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/FEATURE_PARITY_MATRIX.md)** | Granular audit comparing all LibreChat Web features to their Mobile implementation status. |
| **[WEB_COMPONENT_MIGRATION_SPEC.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/WEB_COMPONENT_MIGRATION_SPEC.md)** | Component-by-component architectural guide detailing how each web component group translates to native mobile. |
| **[DATA_AND_STATE_SPEC.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/DATA_AND_STATE_SPEC.md)** | Data layer, `@librechat/data-provider` integration, TanStack React Query caching, and Jotai state models. |
| **[ROADMAP.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/ROADMAP.md)** | Phased milestones (Phase 1 through Phase 6) with concrete tasks and deliverables. |
| **[CONTINUATION_GUIDE.md](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/specs/CONTINUATION_GUIDE.md)** | Step-by-step developer and AI agent guide for development, Generation Protocol v2 specifications, and testing. |

---

## Technology Stack

- **Framework**: [Expo SDK 52+](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/package.json) / React Native
- **Router**: Expo Router (File-based navigation under [`apps/mobile/app`](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/app))
- **Styling**: [NativeWind v4](file:///Users/sagarmeisheri/Apps/LibreChat/apps/mobile/tailwind.config.js) (Tailwind CSS)
- **Shared Data Layer**: [`packages/data-provider`](file:///Users/sagarmeisheri/Apps/LibreChat/packages/data-provider)
- **UI Components & Icons**: `lucide-react-native`, custom native components
- **Streaming & SSE**: Native `fetch` with `ReadableStream` decoding adhering to LibreChat Generation Protocol v2
- **Hardware-backed Storage**: `expo-secure-store` for JWT auth credentials and server host configuration
- **Sandboxed Execution**: `react-native-webview` for Interactive Artifact previews (HTML/JS, SVG, Mermaid)
