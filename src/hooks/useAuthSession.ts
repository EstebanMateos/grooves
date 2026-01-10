import {useEffect, useRef, useState} from 'react';
import type {Session} from '@supabase/supabase-js';

import {supabase} from '../supabaseClient';

export type AuthSessionState = {
  is_loading: boolean; is_authenticated: boolean; user_id: string | null;
  user_email: string | null;
};

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    is_loading: true,
    is_authenticated: false,
    user_id: null,
    user_email: null
  });
  const authSeqRef = useRef<number>(0);

  useEffect(() => {
    let is_mounted = true;
    const bumpAuthSeq = () => {
      authSeqRef.current += 1;
      return authSeqRef.current;
    };
    const applySignedOut = () => {
      setState({
        is_loading: false,
        is_authenticated: false,
        user_id: null,
        user_email: null
      });
    };
    const applySession = (session: Session | null) => {
      setState({
        is_loading: false,
        is_authenticated: !!session,
        user_id: session?.user.id ?? null,
        user_email: session?.user.email ?? null
      });
    };
    const isAuthSessionMissing = (err: unknown): boolean => {
      if (err && typeof err === 'object' && 'name' in err) {
        if ((err as {name?: string}).name === 'AuthSessionMissingError') {
          return true;
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      return message.toLowerCase().includes('auth session missing');
    };
    const resolveSession = async (seq: number, reason: string) => {
      try {
        const {data, error} = await supabase.auth.getSession();
        if (error) {
          throw error;
        }
        let session = data.session ?? null;
        if (!session) {
          const {data: refreshData, error: refreshError} =
              await supabase.auth.refreshSession();
          if (refreshError) {
            if (isAuthSessionMissing(refreshError)) {
              if (!is_mounted || authSeqRef.current !== seq) {
                return;
              }
              applySignedOut();
              return;
            }
            console.warn(`[useAuthSession] ${reason} refresh failed`, refreshError);
            return;
          }
          session = refreshData.session ?? null;
        }

        if (!is_mounted || authSeqRef.current !== seq) {
          return;
        }
        if (!session) {
          applySignedOut();
          return;
        }
        applySession(session);
      } catch (error) {
        if (!is_mounted || authSeqRef.current !== seq) {
          return;
        }
        console.warn(`[useAuthSession] ${reason} revalidate failed`, error);
      }
    };

    async function load() {
      const seq = bumpAuthSeq();
      try {
        const {data, error} = await supabase.auth.getSession();
        if (error) {
          throw error;
        }
        const session = data.session;

        if (!is_mounted || authSeqRef.current !== seq) {
          return;
        }

        applySession(session);
      } catch (error) {
        if (!is_mounted || authSeqRef.current !== seq) {
          return;
        }
        console.error('[useAuthSession] getSession failed', error);
        applySignedOut();
      }
    }

    load();

    const {data: sub} = supabase.auth.onAuthStateChange((event, session) => {
      const seq = bumpAuthSeq();
      console.log(`Supabase auth event: ${event}`);
      if (!is_mounted || authSeqRef.current !== seq) {
        return;
      }
      if (session) {
        applySession(session);
      } else {
        applySignedOut();
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void resolveSession(seq, event);
      }
    });

    return () => {
      is_mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const storageKey = (supabase.auth as unknown as {storageKey?: string}).storageKey;
    if (!storageKey) {
      return;
    }

    let isMounted = true;
    let warned = false;
    const warnOnce = (message: string, error?: unknown) => {
      if (warned) {
        return;
      }
      warned = true;
      if (error) {
        console.warn(message, error);
        return;
      }
      console.warn(message);
    };
    const applySignedOut = () => {
      if (!isMounted) {
        return;
      }
      setState((prev) => {
        if (!prev.is_loading &&
            !prev.is_authenticated &&
            prev.user_id === null &&
            prev.user_email === null) {
          return prev;
        }
        return {
          is_loading: false,
          is_authenticated: false,
          user_id: null,
          user_email: null
        };
      });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      if (!event.newValue) {
        warnOnce('[useAuthSession] Supabase session storage missing.');
        applySignedOut();
      }
    };

    let lastValue: string | null = null;
    let handle: number | null = null;
    const stopMonitoring = () => {
      if (handle !== null) {
        window.clearInterval(handle);
        handle = null;
      }
      window.removeEventListener('storage', handleStorage);
    };

    try {
      window.localStorage.getItem(storageKey);
    } catch (error) {
      warnOnce('[useAuthSession] Storage unavailable; skipping storage sync.', error);
      return () => {
        isMounted = false;
      };
    }

    window.addEventListener('storage', handleStorage);

    handle = window.setInterval(() => {
      try {
        const current = window.localStorage.getItem(storageKey);
        if (current !== lastValue) {
          lastValue = current;
          if (!current) {
            warnOnce('[useAuthSession] Supabase session storage missing.');
            applySignedOut();
          }
        }
      } catch (error) {
        warnOnce('[useAuthSession] Unable to read Supabase storage.', error);
        stopMonitoring();
      }
    }, 5000);

    return () => {
      isMounted = false;
      stopMonitoring();
    };
  }, []);

  return state;
}
