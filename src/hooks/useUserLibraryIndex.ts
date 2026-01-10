import {useEffect, useRef, useState} from 'react';

import {supabase} from '../supabaseClient';

type LibraryIndex = {
  collection_ids: Set<number>; wishlist_ids: Set<number>;
};

export function useUserLibraryIndex() {
  const [index, setIndex] = useState<LibraryIndex>(
      {collection_ids: new Set<number>(), wishlist_ids: new Set<number>()});

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const requestIdRef = useRef<number>(0);

  function isAuthSessionMissing(err: unknown): boolean {
    if (err && typeof err === 'object' && 'name' in err) {
      if ((err as {name?: string}).name === 'AuthSessionMissingError') {
        return true;
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return message.toLowerCase().includes('auth session missing');
  }

  async function getSessionOrRefresh() {
    const {data, error: sessionError} = await supabase.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (data.session) {
      return data.session;
    }

    const {data: refreshData, error: refreshError} =
        await supabase.auth.refreshSession();
    if (refreshError) {
      if (isAuthSessionMissing(refreshError)) {
        return null;
      }
      throw refreshError;
    }
    return refreshData.session ?? null;
  }

  async function reload() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isStale = () => requestIdRef.current !== requestId;
    setLoading(true);
    setError('');

    try {
      const session = await getSessionOrRefresh();

      if (!session) {
        if (isStale()) {
          return;
        }
        setIndex({
          collection_ids: new Set<number>(),
          wishlist_ids: new Set<number>()
        });
        setError('');
        return;
      }

      const {data, error} =
          await supabase.from('user_records')
              .select('list_type, records ( discogs_release_id )')
              .eq('user_id', session.user.id);

      if (error) {
        throw error;
      }

      const collection_ids = new Set<number>();
      const wishlist_ids = new Set<number>();

      (data ?? []).forEach((row: any) => {
        const rid = row.records?.discogs_release_id;
        if (!rid) {
          return;
        }
        if (row.list_type === 'collection') {
          collection_ids.add(rid);
        } else if (row.list_type === 'wishlist') {
          wishlist_ids.add(rid);
        }
      });

      if (isStale()) {
        return;
      }

      setIndex({collection_ids, wishlist_ids});
      setError('');
    } catch (error) {
      if (isStale()) {
        return;
      }
      console.error('[useUserLibraryIndex] reload failed', error);
      setError(String(error));
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    reload();
    const {data: sub} = supabase.auth.onAuthStateChange(() => reload());
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return {...index, loading, error, reload};
}
