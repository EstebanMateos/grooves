import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

type UserProfileSummary = {
    loading: boolean;
    username: string | null;
    display_name: string | null;
};

export function useUserProfileSummary(): UserProfileSummary {
    const [state, setState] = useState<UserProfileSummary>({
        loading: true,
        username: null,
        display_name: null
    });
    const requestIdRef = useRef<number>(0);

    useEffect(() => {
        let isMounted = true;

        async function load() {
            const requestId = requestIdRef.current + 1;
            requestIdRef.current = requestId;
            const isStale = () => requestIdRef.current !== requestId;
            setState((prev) => ({ ...prev, loading: true }));
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const session = sessionData.session;

                if (!session) {
                    if (isMounted && !isStale()) {
                        setState({ loading: false, username: null, display_name: null });
                    }
                    return;
                }

                const { data, error } = await supabase
                    .from("profiles")
                    .select("username,display_name")
                    .eq("id", session.user.id)
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
                console.error("[useUserProfileSummary] load failed", error);
                setState({ loading: false, username: null, display_name: null });
            }
        }

        load();

        const { data: sub } = supabase.auth.onAuthStateChange(() => load());
        return () => {
            isMounted = false;
            sub.subscription.unsubscribe();
        };
    }, []);

    return state;
}
