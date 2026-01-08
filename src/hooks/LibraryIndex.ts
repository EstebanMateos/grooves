import {useEffect, useState} from 'react';

import {supabase} from '../supabaseClient';

type LibraryIndex = {
  collection_ids: Set<number>; wishlist_ids: Set<number>;
};

export function useUserLibraryIndex() {
  const [index, setIndex] = useState<LibraryIndex>(
      {collection_ids: new Set<number>(), wishlist_ids: new Set<number>()});

  const [loading, setLoading] = useState<boolean>(false);

  async function reload() {
    setLoading(true);

    try {
      const {data: sessionData} = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session) {
        setIndex({
          collection_ids: new Set<number>(),
          wishlist_ids: new Set<number>()
        });
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

      setIndex({collection_ids, wishlist_ids});
    } catch (error) {
      console.error('[useUserLibraryIndex] reload failed', error);
      setIndex({
        collection_ids: new Set<number>(),
        wishlist_ids: new Set<number>()
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    const {data: sub} = supabase.auth.onAuthStateChange(() => reload());
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return {...index, loading, reload};
}
