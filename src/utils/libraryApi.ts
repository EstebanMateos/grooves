import { supabase } from "../supabaseClient";
import { ensureCollectionGroupId, getCollectionGroupId } from "./collectionGroup";

export type LibraryRecord = {
    id: string;
    discogs_release_id: number;
    title: string;
    artist: string;
    year: number | null;
    country: string | null;
    thumb_url: string | null;
    label: string | null;
    catno: string | null;
};

export type LibraryListType = "collection" | "wishlist";

export type LibraryItem = {
    id: string;
    list_type: LibraryListType;
    record_id: string;
    record: LibraryRecord | null;
    created_at: string;
};

export type LibraryPreview = {
    collection: LibraryRecord[];
    wishlist: LibraryRecord[];
};

export type LibraryIndex = {
    collection_ids: Set<number>;
    wishlist_ids: Set<number>;
};

type CollectionGroupItemRow = {
    id?: string;
    record_id: string;
    created_at: string;
};

type WishlistRecordRow = {
    id?: string;
    record_id: string;
    created_at: string;
};

type JoinedRecordRow = {
    records: { discogs_release_id: number | null } | null;
};

const RECORD_SELECT = "id,discogs_release_id,title,artist,year,country,thumb_url,label,catno";

async function fetchRecordsById(recordIds: string[]): Promise<Map<string, LibraryRecord>> {
    if (recordIds.length === 0) {
        return new Map<string, LibraryRecord>();
    }

    const { data, error } = await supabase
        .from("records")
        .select(RECORD_SELECT)
        .in("id", recordIds);

    if (error) {
        throw error;
    }

    const recordById = new Map<string, LibraryRecord>();
    for (const record of (data ?? []) as LibraryRecord[]) {
        recordById.set(record.id, record);
    }
    return recordById;
}

export async function loadLibraryPreview(userId: string, limit = 120): Promise<LibraryPreview> {
    const groupId = await getCollectionGroupId(userId);
    const emptyResponse = { data: [], error: null } as const;
    const [collectionResp, wishlistResp] = await Promise.all([
        groupId
            ? supabase
                .from("collection_group_items")
                .select("record_id,created_at")
                .eq("group_id", groupId)
                .order("created_at", { ascending: false })
                .limit(limit)
            : Promise.resolve(emptyResponse),
        supabase
            .from("user_records")
            .select("record_id,created_at")
            .eq("user_id", userId)
            .eq("list_type", "wishlist")
            .order("created_at", { ascending: false })
            .limit(limit)
    ]);

    if (collectionResp.error) {
        throw collectionResp.error;
    }
    if (wishlistResp.error) {
        throw wishlistResp.error;
    }

    const collectionRows = (collectionResp.data ?? []) as CollectionGroupItemRow[];
    const wishlistRows = (wishlistResp.data ?? []) as WishlistRecordRow[];
    const recordIds = Array.from(new Set([...collectionRows, ...wishlistRows].map((item) => item.record_id)));
    const recordById = await fetchRecordsById(recordIds);

    return {
        collection: collectionRows
            .map((item) => recordById.get(item.record_id))
            .filter((record): record is LibraryRecord => !!record),
        wishlist: wishlistRows
            .map((item) => recordById.get(item.record_id))
            .filter((record): record is LibraryRecord => !!record)
    };
}

export async function loadLibraryItems(userId: string, limit = 400): Promise<{
    collectionGroupId: string | null;
    items: LibraryItem[];
}> {
    const collectionGroupId = await getCollectionGroupId(userId);
    const emptyResponse = { data: [], error: null } as const;
    const [collectionResp, wishlistResp] = await Promise.all([
        collectionGroupId
            ? supabase
                .from("collection_group_items")
                .select("id,record_id,created_at")
                .eq("group_id", collectionGroupId)
                .order("created_at", { ascending: false })
                .limit(limit)
            : Promise.resolve(emptyResponse),
        supabase
            .from("user_records")
            .select("id,record_id,created_at")
            .eq("user_id", userId)
            .eq("list_type", "wishlist")
            .order("created_at", { ascending: false })
            .limit(limit)
    ]);

    if (collectionResp.error) {
        throw collectionResp.error;
    }
    if (wishlistResp.error) {
        throw wishlistResp.error;
    }

    const collectionRows = (collectionResp.data ?? []) as Required<CollectionGroupItemRow>[];
    const wishlistRows = (wishlistResp.data ?? []) as Required<WishlistRecordRow>[];
    const recordIds = Array.from(new Set([...collectionRows, ...wishlistRows].map((item) => item.record_id)));
    const recordById = await fetchRecordsById(recordIds);
    const items: LibraryItem[] = [
        ...collectionRows.map((item) => ({
            id: item.id,
            list_type: "collection" as const,
            record_id: item.record_id,
            record: recordById.get(item.record_id) ?? null,
            created_at: item.created_at
        })),
        ...wishlistRows.map((item) => ({
            id: item.id,
            list_type: "wishlist" as const,
            record_id: item.record_id,
            record: recordById.get(item.record_id) ?? null,
            created_at: item.created_at
        }))
    ];

    return { collectionGroupId, items };
}

export async function loadLibraryIndex(userId: string): Promise<LibraryIndex> {
    const groupId = await getCollectionGroupId(userId);
    const emptyResponse = { data: [], error: null } as const;
    const [collectionResp, wishlistResp] = await Promise.all([
        groupId
            ? supabase
                .from("collection_group_items")
                .select("records ( discogs_release_id )")
                .eq("group_id", groupId)
            : Promise.resolve(emptyResponse),
        supabase
            .from("user_records")
            .select("records ( discogs_release_id )")
            .eq("user_id", userId)
            .eq("list_type", "wishlist")
    ]);

    if (collectionResp.error) {
        throw collectionResp.error;
    }
    if (wishlistResp.error) {
        throw wishlistResp.error;
    }

    const collection_ids = new Set<number>();
    const wishlist_ids = new Set<number>();
    ((collectionResp.data ?? []) as unknown as JoinedRecordRow[]).forEach((row) => {
        const rid = row.records?.discogs_release_id;
        if (rid) {
            collection_ids.add(rid);
        }
    });
    ((wishlistResp.data ?? []) as unknown as JoinedRecordRow[]).forEach((row) => {
        const rid = row.records?.discogs_release_id;
        if (rid) {
            wishlist_ids.add(rid);
        }
    });

    return { collection_ids, wishlist_ids };
}

export async function removeCollectionItemById(itemId: string, collectionGroupId: string): Promise<void> {
    const { error } = await supabase
        .from("collection_group_items")
        .delete()
        .eq("id", itemId)
        .eq("group_id", collectionGroupId);

    if (error) {
        throw error;
    }
}

export async function removeWishlistItemById(itemId: string, userId: string): Promise<void> {
    const { error } = await supabase
        .from("user_records")
        .delete()
        .eq("id", itemId)
        .eq("user_id", userId);

    if (error) {
        throw error;
    }
}

export async function addCollectionRecord(recordId: string, userId: string, groupId: string): Promise<{
    id: string;
    record_id: string;
    created_at: string;
}> {
    const { data, error } = await supabase
        .from("collection_group_items")
        .upsert(
            {
                group_id: groupId,
                record_id: recordId,
                added_by_user_id: userId
            },
            { onConflict: "group_id,record_id" }
        )
        .select("id,record_id,created_at")
        .single();

    if (error || !data?.id) {
        throw error ?? new Error("Impossible d'ajouter à la collection.");
    }

    return data as { id: string; record_id: string; created_at: string };
}

export async function addRecordToCollection(recordId: string, userId: string, groupId?: string | null): Promise<{
    groupId: string;
    item: {
        id: string;
        record_id: string;
        created_at: string;
    };
}> {
    const nextGroupId = groupId ?? await ensureCollectionGroupId();
    const item = await addCollectionRecord(recordId, userId, nextGroupId);
    return { groupId: nextGroupId, item };
}

export async function getRecordIdByDiscogsReleaseId(discogsReleaseId: number): Promise<string | null> {
    const { data, error } = await supabase
        .from("records")
        .select("id")
        .eq("discogs_release_id", discogsReleaseId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.id ?? null;
}

export async function removeCollectionRecord(recordId: string, groupId: string): Promise<void> {
    const { error } = await supabase
        .from("collection_group_items")
        .delete()
        .eq("group_id", groupId)
        .eq("record_id", recordId);

    if (error) {
        throw error;
    }
}

export async function removeWishlistRecord(recordId: string, userId: string): Promise<void> {
    const { error } = await supabase
        .from("user_records")
        .delete()
        .eq("user_id", userId)
        .eq("record_id", recordId)
        .eq("list_type", "wishlist");

    if (error) {
        throw error;
    }
}
