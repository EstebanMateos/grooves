// src/auth/authStore.ts
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
let subscription: {unsubscribe: () => void}|null = null;

function emit() {
  for (const l of listeners) {
    l();
  }
}

function setState(next: Partial<AuthSessionState>) {
  state = {...state, ...next};
  emit();
}

function setSession(next_session: Session|null, event: string|null) {
  setState({
    is_loading: false,
    last_event: event,
    session: next_session,
    is_authenticated: !!next_session,
    user_id: next_session?.user.id ?? null,
    user_email: next_session?.user.email ?? null,
  });
}

async function bootstrap() {
  try {
    const {data, error} = await supabase.auth.getSession();
    if (error) {
      setSession(null, 'GET_SESSION_ERROR');
      return;
    }
    setSession(data.session ?? null, 'GET_SESSION');
  } catch {
    setSession(null, 'GET_SESSION_THROW');
  }
}

export function startAuthStore() {
  if (started) {
    return;
  }
  started = true;

  void bootstrap();

  const {data} = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session ?? null, event);
  });

  subscription = data.subscription;
}

export function stopAuthStoreForTestsOnly() {
  if (subscription) {
    subscription.unsubscribe();
    subscription = null;
  }
  started = false;
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

export function getAuthSnapshot(): AuthSessionState {
  return state;
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

startAuthStore();
