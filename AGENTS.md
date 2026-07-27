# AGENTS.md

## Working area

This repository is the Expo + React Native app for CLAIRITY. The actual app lives in the `expo/` subfolder.

- App entrypoints and routes: `expo/app/`
- Shared UI primitives: `expo/components/`
- Theme and color constants: `expo/constants/`
- App-wide persistent state: `expo/lib/store.ts`
- Domain types: `expo/lib/types.ts`
- Docs and local startup notes: `expo/README.md`

## Preferred conventions

- Use Expo Router file-based routes. New screens belong in `expo/app/`.
- Reuse the existing shared primitives from `expo/components/ui.tsx` instead of introducing one-off UI patterns.
- Keep route-level logic in screen files and put cross-screen persistence/state in `expo/lib/store.ts`.
- Favor the existing project’s strong clinical UI language: clear hierarchy, generous touch targets, quiet surfaces, and simple navigation patterns.
- Use TypeScript types from `expo/lib/types.ts` for domain data where possible.

## State and data flow

- The app uses a top-level context provider created in `expo/lib/store.ts` with `@nkzw/create-context-hook`.
- Persisted state is written to `AsyncStorage` by the provider; screens should consume it through `useClairity()` rather than introducing a second storage layer.
- If a new feature needs medical record data, extend the existing domain types and the provider state instead of creating a separate store.

## Navigation patterns

- Use `expo-router` navigation helpers such as `router.push`, `router.replace`, and `useLocalSearchParams`.
- The root layout in `expo/app/_layout.tsx` already disables the default stack header globally; screens render their own `ScreenHeader`.
- Keep header and back-button behavior consistent with the existing `ScreenHeader` and `canGoBackSafe()` patterns.

## Run and verify locally

From the repo’s `expo/` folder:

```bash
bun install
bun run start
bun run start-web
bun run lint
```

## Guidance for AI coding agents

- Prefer small, surgical edits that match the existing file organization.
- Preserve the project’s medical-domain terminology and avoid inventing new app abstractions unless there is a clear reuse case.
- If you need to add a new screen, route, or document flow, follow the naming and structure already used in neighboring pages.
- When in doubt, inspect `expo/lib/store.ts`, `expo/lib/types.ts`, and `expo/components/ui.tsx` before introducing new patterns.
