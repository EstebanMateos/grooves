# TODO (Reliability / Logic Issues)

## High
- [x] Fix auth state race between `getSession()` and `onAuthStateChange()` so stale results cannot overwrite newer auth events. Files: `src/hooks/useAuthSession.ts`, `src/pages/HomePage.tsx`, `src/pages/MyLibraryPage.tsx`.
  - [x] Add a monotonically increasing auth sequence ref and ignore stale `getSession()` results.
  - [x] Guard auth `setState` calls with `isMounted` + sequence in both the initial load and auth change handler.
- [x] Keep storage instrumentation safe when `localStorage` is blocked or unavailable. File: `src/supabaseClient.ts`.
  - [x] Wrap debug instrumentation in try/catch so storage-restricted browsers still boot.
- [x] Prevent stale route data when navigating quickly (cancel or sequence in-flight fetches). Files: `src/pages/ReleasePage.tsx`, `src/pages/PublicProfilePage.tsx`.
  - [x] Add an `AbortController` per effect and pass `signal` to `fetch`.
  - [x] Track a request id in a `useRef` and ignore late responses.
  - [x] Check the current param (`discogsReleaseId`/`username`) before committing state.

## Medium
- [x] Surface auth errors in the modal when network errors occur (catch thrown errors and display status). File: `src/components/AuthModal.tsx`.
  - [x] Wrap `signInWithPassword` and `signUp` in try/catch and set `status`/`statusType` on exceptions.
  - [x] Add a small `formatAuthError` helper (or reuse the one from `LoginPage`) for consistent messaging.
  - [x] Ensure `loading` is always cleared in `finally`.
- [x] Clear or update the library cache when the server returns an empty list to avoid stale offline data. File: `src/pages/MyLibraryPage.tsx`.
  - [x] When `userRecords.length === 0`, call `writeCache(userId, [])` or remove the cache key.
  - [x] Keep `updated_at` in sync when the list is empty (so offline status is correct).
  - [ ] Consider clearing cached data on logout to avoid cross-user leakage.
- [x] Guard PWA install prompt storage access with try/catch to avoid crashes in storage-restricted browsers. File: `src/App.tsx`.
  - [x] Wrap `localStorage.getItem` in try/catch and default to "not dismissed" on error.
  - [x] Wrap `setItem` calls in try/catch in `handleInstalled`, `handleInstall`, and `handleDismissInstall`.
  - [x] Add a small in-memory fallback flag for the current session.
- [x] Abort obsolete Discogs searches so route/query changes do not keep consuming quota. Files: `src/pages/HomePage.tsx`, `src/pages/SearchResultsPage.tsx`.

## Tests (Prevention)
- [x] Auth race regression test: delayed `getSession()` + SIGNED_OUT event should stay signed out.
  - [ ] Mock `supabase.auth.getSession()` to resolve after a delay.
  - [ ] Trigger `onAuthStateChange` with SIGNED_OUT before the delay completes.
  - [ ] Assert `is_authenticated` remains false after the delayed promise resolves.
- [ ] Storage-blocked auth test: blocked `localStorage` should not force sign-out during a valid session.
  - [ ] Mock `localStorage.getItem` to throw and return a valid session from Supabase.
  - [ ] Wait for the polling interval to tick.
  - [ ] Assert auth state stays authenticated.
- [ ] Stale fetch test: slow request for one route should not overwrite a newer route response.
  - [ ] Mock `fetch` so the first request resolves after the second.
  - [ ] Navigate from A to B quickly.
  - [ ] Assert UI shows B data only.
- [ ] Auth modal error test: thrown error surfaces in UI.
  - [ ] Mock `signInWithPassword` to throw.
  - [ ] Submit the modal form.
  - [ ] Assert the error status is visible.
- [ ] Library cache test: empty server response clears cache.
  - [ ] Seed localStorage with cached items.
  - [ ] Mock `user_records` to return an empty list.
  - [ ] Assert cache is cleared and UI stays empty when offline.
- [x] Discogs abort test: abort should not retry.
  - [ ] Call `fetchWithRetry` with an already-aborted signal.
  - [x] Assert the underlying fetch is called once and no retry occurs.
