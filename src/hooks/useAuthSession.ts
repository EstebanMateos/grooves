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
        const {data} = await supabase.auth.getSession();
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

    let lastValue: string | null = null;
    const handle = window.setInterval(() => {
      try {
        const current = window.localStorage.getItem(storageKey);
        if (current !== lastValue) {
          lastValue = current;
          if (!current) {
            console.warn('[useAuthSession] Supabase session storage missing.');
          }
        }
      } catch (error) {
        console.warn('[useAuthSession] Unable to read Supabase storage.', error);
      }
    }, 5000);

    return () => {
      window.clearInterval(handle);
    };
  }, []);

  return state;
}
