import {useEffect, useRef, useState} from 'react';

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

        setState({
          is_loading: false,
          is_authenticated: !!session,
          user_id: session?.user.id ?? null,
          user_email: session?.user.email ?? null
        });
      } catch (error) {
        if (!is_mounted || authSeqRef.current !== seq) {
          return;
        }
        console.error('[useAuthSession] getSession failed', error);
        setState({
          is_loading: false,
          is_authenticated: false,
          user_id: null,
          user_email: null
        });
      }
    }

    load();

    const {data: sub} = supabase.auth.onAuthStateChange((event, session) => {
      const seq = bumpAuthSeq();
      console.log(`Supabase auth event: ${event}`);
      if (!is_mounted || authSeqRef.current !== seq) {
        return;
      }
      setState({
        is_loading: false,
        is_authenticated: !!session,
        user_id: session?.user.id ?? null,
        user_email: session?.user.email ?? null
      });
    });

    return () => {
      is_mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const storageKey = supabase.auth.storageKey;
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
