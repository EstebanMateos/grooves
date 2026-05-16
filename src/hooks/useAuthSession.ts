import {useSyncExternalStore} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '../supabaseClient';

export type AuthSessionState = {
  is_loading: boolean; is_authenticated: boolean; user_id: string | null;
  user_email: string | null;
  session: Session | null;
  last_event: string | null;
};

type Listener = () => void;

let state: AuthSessionState = {
  is_loading: true,
  is_authenticated: false,
  user_id: null,
  user_email: null,
  session: null,
  last_event: null,
};

const listeners = new Set<Listener>();

let started = false;
let subscription: {unsubscribe: () => void} | null = null;
let authSequence = 0;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(partial: Partial<AuthSessionState>): void {
  state = {...state, ...partial};
  emit();
}

function applySession(session: Session|null, event: string|null): void {
  setState({
    is_loading: false,
    session,
    last_event: event,
    is_authenticated: !!session,
    user_id: session?.user.id ?? null,
    user_email: session?.user.email ?? null,
  });
}

async function bootstrap(): Promise<void> {
  const sequence = ++authSequence;
  try {
    const {data, error} = await supabase.auth.getSession();
    if (sequence !== authSequence) {
      return;
    }
    if (error) {
      applySession(null, 'GET_SESSION_ERROR');
      return;
    }
    applySession(data.session ?? null, 'GET_SESSION');
  } catch {
    if (sequence !== authSequence) {
      return;
    }
    applySession(null, 'GET_SESSION_THROW');
  }
}

function startStore(): void {
  if (started) {
    return;
  }
  started = true;

  void bootstrap();

  const {data} = supabase.auth.onAuthStateChange((event, session) => {
    authSequence += 1;
    applySession(session ?? null, event);
  });
  subscription = data.subscription;
}

function getSnapshot(): AuthSessionState {
  return state;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

startStore();

export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAuthSessionSnapshotForTestsOnly(): AuthSessionState {
  return getSnapshot();
}

export function stopAuthSessionStoreForTestsOnly(): void {
  subscription?.unsubscribe();
  subscription = null;
  started = false;
  authSequence = 0;
  state = {
    is_loading: true,
    is_authenticated: false,
    user_id: null,
    user_email: null,
    session: null,
    last_event: null,
  };
  emit();
}
