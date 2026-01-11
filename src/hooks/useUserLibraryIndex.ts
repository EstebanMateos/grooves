import {useEffect, useRef, useState} from 'react';

import {supabase} from '../supabaseClient';
import {isDebugEnabled} from '../utils/supabaseDebug';
import {useAuthSession} from './useAuthSession';
import {getCollectionGroupId} from '../utils/collectionGroup';

type LibraryIndex = {
  collection_ids: Set<number>; wishlist_ids: Set<number>;
};

export function useUserLibraryIndex() {
  const auth = useAuthSession();
  const [index, setIndex] = useState<LibraryIndex>(
      {collection_ids: new Set<number>(), wishlist_ids: new Set<number>()});

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const requestIdRef = useRef<number>(0);
  const activeUserIdRef = useRef<string|null>(null);

  async function reload() {
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

      const collection_ids = new Set<number>();
      const wishlist_ids = new Set<number>();

      const groupId = await getCollectionGroupId(userId);
      const emptyResponse = {data: [], error: null} as const;
      const [collectionResp, wishlistResp] = await Promise.all([
        groupId ?
            supabase.from('collection_group_items')
                .select('records ( discogs_release_id )')
                .eq('group_id', groupId) :
            Promise.resolve(emptyResponse),
        supabase.from('user_records')
            .select('records ( discogs_release_id )')
            .eq('user_id', userId)
            .eq('list_type', 'wishlist')
      ]);

      if (collectionResp.error) {
        throw collectionResp.error;
      }
      if (wishlistResp.error) {
        throw wishlistResp.error;
      }

      (collectionResp.data ?? []).forEach((row: any) => {
        const rid = row.records?.discogs_release_id;
        if (rid) {
          collection_ids.add(rid);
        }
      });

      (wishlistResp.data ?? []).forEach((row: any) => {
        const rid = row.records?.discogs_release_id;
        if (rid) {
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
      if (isDebugEnabled()) {
        console.error('[useUserLibraryIndex] reload failed', error);
      }
      setError(String(error));
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }

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
  }, [auth.is_loading, auth.is_authenticated, auth.user_id]);

  return {...index, loading, error, reload};
}
