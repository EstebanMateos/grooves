import {createClient} from '@supabase/supabase-js';

import {isDebugEnabled} from './utils/supabaseDebug';
import {createSafeBrowserStorage, getBrowserStorage} from './utils/safeStorage';

const supabase_url = import.meta.env.VITE_SUPABASE_URL as string;
const supabase_anon_key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const debugEnabled = isDebugEnabled();

if (!supabase_url || !supabase_anon_key) {
  if (debugEnabled) {
    console.error(
        'Supabase env manquant: vérifie VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
  }
}

export const supabase = createClient(supabase_url, supabase_anon_key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: createSafeBrowserStorage(getBrowserStorage()),
  }
});

if (debugEnabled) {
  try {
    const keys = Object.keys(window.localStorage);
    const sb_keys =
        keys.filter((k) => k.includes('sb-') || k.includes('supabase'));
    console.log('[storage] keys', sb_keys);
    for (const k of sb_keys) {
      const v = window.localStorage.getItem(k);
      console.log('[storage] item', k, v ? `len=${v.length}` : 'null');
    }
  } catch (e) {
    console.warn('[storage] cannot read localStorage', e);
  }
}

const original_sign_out = supabase.auth.signOut.bind(supabase.auth);
supabase.auth.signOut = async (...args) => {
  if (debugEnabled) {
    console.trace('[supabase] signOut called');
  }
  return await original_sign_out(...args);
};

if (debugEnabled) {
  try {
    const original_remove_item =
        window.localStorage.removeItem.bind(window.localStorage);
    window.localStorage.removeItem = (key: string) => {
      if (key.includes('sb-') || key.includes('supabase')) {
        console.trace(`[localStorage] removeItem ${key}`);
      }
      return original_remove_item(key);
    };

    const original_clear = window.localStorage.clear.bind(window.localStorage);
    window.localStorage.clear = () => {
      console.trace('[localStorage] clear');
      return original_clear();
    };
  } catch (e) {
    console.warn('[storage] cannot instrument localStorage', e);
  }
}
