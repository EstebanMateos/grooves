import { supabase } from "../supabaseClient";

export async function getCollectionGroupId(userId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from("collection_group_members")
        .select("group_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.group_id ?? null;
}

export async function ensureCollectionGroupId(): Promise<string> {
    const { data, error } = await supabase.rpc("ensure_collection_group");
    if (error) {
        throw error;
    }
    return data as string;
}
