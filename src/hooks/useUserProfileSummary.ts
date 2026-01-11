import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { isDebugEnabled } from "../utils/supabaseDebug";
import { useAuthSession } from "./useAuthSession";

type UserProfileSummary = {
    loading: boolean;
    username: string | null;
    display_name: string | null;
};

export function useUserProfileSummary(): UserProfileSummary {
    const auth = useAuthSession();
    const [state, setState] = useState<UserProfileSummary>({
        loading: true,
        username: null,
        display_name: null
    });
    const requestIdRef = useRef<number>(0);
    const activeUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const userId = auth.user_id;
        const isStale = () =>
            requestIdRef.current !== requestId || activeUserIdRef.current !== userId;

        if (auth.is_loading) {
            return () => {
                isMounted = false;
            };
        }

        if (!auth.is_authenticated || !userId) {
            activeUserIdRef.current = null;
            setState({ loading: false, username: null, display_name: null });
            return () => {
                isMounted = false;
            };
        }

        const keepPrevious = activeUserIdRef.current === userId;
        activeUserIdRef.current = userId;
        setState((prev) => ({
            loading: true,
            username: keepPrevious ? prev.username : null,
            display_name: keepPrevious ? prev.display_name : null
        }));

        async function load() {
            try {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("username,display_name")
                    .eq("id", userId)
                    .maybeSingle();

                if (!isMounted || isStale()) {
                    return;
                }

                if (error || !data) {
                    setState({ loading: false, username: null, display_name: null });
                    return;
                }

                setState({
                    loading: false,
                    username: data.username ?? null,
                    display_name: data.display_name ?? null
                });
            } catch (error) {
                if (!isMounted || isStale()) {
                    return;
                }
                if (isDebugEnabled()) {
                    console.error("[useUserProfileSummary] load failed", error);
                }
                setState({ loading: false, username: null, display_name: null });
            }
        }

        void load();

        return () => {
            isMounted = false;
        };
    }, [auth.is_loading, auth.is_authenticated, auth.user_id]);

    return state;
}
