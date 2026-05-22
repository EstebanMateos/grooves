import {useCallback, useEffect, useRef, useState} from 'react';

import {isDebugEnabled} from '../utils/supabaseDebug';
import {useAuthSession} from './useAuthSession';
import {loadLibraryIndex, type LibraryIndex} from '../utils/libraryApi';

export function useUserLibraryIndex() {
  const auth = useAuthSession();
  const [index, setIndex] = useState<LibraryIndex>(
      {collection_ids: new Set<number>(), wishlist_ids: new Set<number>()});

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const requestIdRef = useRef<number>(0);
  const activeUserIdRef = useRef<string|null>(null);

  const reload = useCallback(async () => {
    if (auth.is_loading) {
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const userId = auth.user_id;
    const isStale = () =>
        requestIdRef.current !== requestId ||
        activeUserIdRef.current !== userId;
    setLoading(true);
    setError('');

    try {
      if (!auth.is_authenticated || !userId) {
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

      activeUserIdRef.current = userId;

      const nextIndex = await loadLibraryIndex(userId);

      if (isStale()) {
        return;
      }

      setIndex(nextIndex);
      setError('');
    } catch (error) {
      if (isStale()) {
        return;
      }
      if (isDebugEnabled()) {
        console.error('[useUserLibraryIndex] reload failed', error);
      }
      setError(String(error));
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [auth.is_authenticated, auth.is_loading, auth.user_id]);

  useEffect(() => {
    if (auth.is_loading) {
      return;
    }
    if (!auth.is_authenticated || !auth.user_id) {
      activeUserIdRef.current = null;
      setIndex({
        collection_ids: new Set<number>(),
        wishlist_ids: new Set<number>()
      });
      setError('');
      setLoading(false);
      return;
    }
    activeUserIdRef.current = auth.user_id;
    void reload();
  }, [auth.is_loading, auth.is_authenticated, auth.user_id, reload]);

  return {...index, loading, error, reload};
}
