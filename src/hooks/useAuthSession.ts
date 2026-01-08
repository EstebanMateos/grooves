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
        console.error("[useAuthSession] getSession failed", error);
        setState({
          is_loading: false,
          is_authenticated: false,
          user_id: null,
          user_email: null
        });
      }
    }

    load();

    const {data: sub} = supabase.auth.onAuthStateChange((_event, session) => {
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

  return state;
}
