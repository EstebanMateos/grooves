# Auth/Data Reliability TODO

This document captures the reliability issues identified in the current
frontend and proposes an attack plan to fix them. Each item is ordered by
severity.

## 1) CRITICAL: Library data persists after logout

Problem
- The library page loads data once on mount and does not clear it when the
  session changes. If a user signs out (same tab or another tab), the previous
  user's library stays visible.

Impact
- Data exposure risk between users on shared devices or multi-tab usage.

Root cause
- `MyLibraryPage` only calls `load()` in `useEffect([])` and never listens to
  auth changes. Cached data can also be reused without verifying current user.

Attack plan
- Add auth-aware state in `MyLibraryPage`:
  - Subscribe to `supabase.auth.onAuthStateChange`.
  - On `SIGNED_OUT`, clear `items`, `status`, `error`, `busyId`.
  - On `SIGNED_IN`, call `load()` to refresh data.
- Guard `load()` results:
  - Capture `session.user.id` at request start.
  - Before `setItems`, confirm the current session user id is the same.
  - Skip cache unless the active session user id matches the cache key.
- Add a "no session" UI path that is driven by auth state, not stale error
  strings.
- Tests:
  - E2E: login, open library, logout in another tab, assert list clears and
    login prompt shows.

## 2) CRITICAL: Stale async responses overwrite state after auth change

Problem
- Multiple components load data tied to the current user but do not guard
  against auth changes or in-flight responses. Old responses can overwrite
  state for the new user.

Impact
- Previous user's profile/library/favorites can appear after switching users.

Root cause
- Async fetches are not canceled and do not check the current session before
  committing state updates.

Attack plan
- Add request guards for user-scoped data:
  - Use an incrementing `requestId` ref or `AbortController`.
  - Capture `userId` at request start and compare before `setState`.
  - Apply to:
    - `useUserLibraryIndex`
    - `useUserProfileSummary`
    - `HomePage.loadLibraryPreview`
    - `DiscoverProfilesPage.loadFavorites`
- Tests:
  - Integration: delay the first request, switch users, assert only the latest
    request updates state.

## 3) HIGH: Auth timeout can report failure while sign-in succeeds later

Problem
- The auth helper uses `Promise.race` to time out but does not cancel the
  underlying request. The auth session can still be created later, while the UI
  shows an error.

Impact
- Confusing UX, potential silent sign-in after a visible failure.

Root cause
- Timeout wrapper only rejects; it does not abort or reconcile later auth
  events.

Attack plan
- Decide a single source of truth for auth state:
  - Prefer `useAuthSession` / `onAuthStateChange` to set authenticated state.
- When timeout triggers:
  - Mark the attempt as canceled.
  - If a later auth event arrives for the same attempt, either ignore it or
    explicitly sign out.
- If possible, move timeouts into the fetch layer with AbortController and
  wire to Supabase calls.
- Tests:
  - Integration: throttle network to exceed timeout, verify UI does not end in
    a confusing "failed but authenticated" state.

## 4) HIGH: Profile auto-creation can report success without writing a row

Problem
- `ensureProfileUsername` returns a username even after 5 failed upsert
  attempts, which can navigate the user to the app as if profile creation
  succeeded.

Impact
- Missing profile data, broken flows that depend on profiles, hidden errors.

Root cause
- The function returns a candidate even on repeated failures; it never throws.

Attack plan
- Make profile creation strict:
  - Track success and throw if all retries fail.
  - Generate a truly unique fallback (UUID) to avoid collisions.
  - Surface the error to the UI and keep the user on the login page with a
    retry message.
- Tests:
  - Unit: simulate repeated upsert failures and assert an error is thrown and
    UI shows failure.

## 5) MEDIUM: `useAuthSession` does not handle storage/session errors robustly

Problem
- The hook does not check `error` from `getSession()` and the storage polling
  only logs warnings. Clearing auth storage can leave `is_authenticated` true.

Impact
- UI can claim the user is logged in when the session is gone or corrupted.

Root cause
- Missing error handling and no state update on missing storage.

Attack plan
- Update `useAuthSession`:
  - Read `{ data, error }` and treat any error as unauthenticated.
  - Add a `storage` event listener to detect session key removal and update
    state or trigger `signOut`.
  - Consider replacing the polling interval with `storage` events to reduce
    noise and drift.
- Tests:
  - Unit: mock `getSession()` with an error, assert state resets to
    unauthenticated.
  - Integration: clear localStorage and assert UI updates.

## 6) MEDIUM: Library filter ignores the selected filter

Problem
- The library filter uses `useMemo` but does not include `filter` in its
  dependencies, so toggling "Collection/Wishlist" does nothing until another
  state change.

Impact
- Incorrect or stale filtered view.

Root cause
- Missing dependency in `useMemo`.

Attack plan
- Add `filter` to the dependency list for `filteredItems`.
- Tests:
  - Component: click filter buttons and assert list updates immediately.

## 7) MEDIUM: Search results can be stale due to out-of-order responses

Problem
- Search pages do not cancel in-flight requests. Fast query/page changes can
  show results from an older request.

Impact
- Results do not match the query or page shown in the UI.

Root cause
- No AbortController or request-id guard when fetching.

Attack plan
- Add cancellation/guards for all search requests:
  - Use AbortController per request and abort previous on new search.
  - Alternatively, track a `requestId` and only apply the latest response.
- Tests:
  - Integration: delay a request, change query, ensure only latest response is
    rendered.

