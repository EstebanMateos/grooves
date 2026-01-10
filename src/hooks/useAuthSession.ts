import {useEffect, useState} from 'react';

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

  useEffect(() => {
    let is_mounted = true;

    async function load() {
      try {
        const {data, error} = await supabase.auth.getSession();
        if (error) {
          throw error;
        }
        const session = data.session;

        if (!is_mounted) {
          return;
        }

        setState({
          is_loading: false,
          is_authenticated: !!session,
          user_id: session?.user.id ?? null,
          user_email: session?.user.email ?? null
        });
      } catch (error) {
        if (!is_mounted) {
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
      console.log(`Supabase auth event: ${event}`);
      if (!is_mounted) {
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
        console.warn('[useAuthSession] Supabase session storage missing.');
        applySignedOut();
      }
    };

    window.addEventListener('storage', handleStorage);

    let lastValue: string | null = null;
    const handle = window.setInterval(() => {
      try {
        const current = window.localStorage.getItem(storageKey);
        if (current !== lastValue) {
          lastValue = current;
          if (!current) {
            console.warn('[useAuthSession] Supabase session storage missing.');
            applySignedOut();
          }
        }
      } catch (error) {
        console.warn('[useAuthSession] Unable to read Supabase storage.', error);
        applySignedOut();
      }
    }, 5000);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(handle);
    };
  }, []);

  return state;
}
