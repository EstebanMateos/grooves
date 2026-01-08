import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

type ProfileRow = {
    id: string;
    username: string;
    display_name: string | null;
    is_public_collection: boolean;
    is_public_wishlist: boolean;
};

export default function ProfileSettingsPage() {
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");

    const [username, setUsername] = useState<string>("");
    const [displayName, setDisplayName] = useState<string>("");
    const [isPublicCollection, setIsPublicCollection] = useState<boolean>(true);
    const [isPublicWishlist, setIsPublicWishlist] = useState<boolean>(true);
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError("");
            setStatus("");

            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const session = sessionData.session;

                if (!session) {
                    setError("Please login first.");
                    return;
                }

                const { data, error: dbError } = await supabase
                    .from("profiles")
                    .select("id,username,display_name,is_public_collection,is_public_wishlist")
                    .eq("id", session.user.id)
                    .maybeSingle();

                if (dbError) {
                    throw dbError;
                }

                if (data) {
                    const row = data as ProfileRow;
                    setUsername(row.username ?? "");
                    setDisplayName(row.display_name ?? "");
                    setIsPublicCollection(!!row.is_public_collection);
                    setIsPublicWishlist(!!row.is_public_wishlist);

                }
            } catch (e) {
                setError(String(e));
            } finally {
                setLoading(false);
            }
        }

        load();
    }, []);

    function normalizeUsername(raw: string): string {
        return raw
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/[^a-z0-9_]/g, "");
    }

    async function save() {
        setLoading(true);
        setError("");
        setStatus("");

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;

            if (!session) {
                setError("Please login first.");
                return;
            }

            const normalized = normalizeUsername(username);
            if (!normalized) {
                setError("Invalid username.");
                return;
            }

            const payload = {
                id: session.user.id,
                username: normalized,
                display_name: displayName.trim() ? displayName.trim() : null,
                is_public_collection: isPublicCollection,
                is_public_wishlist: isPublicWishlist
            };

            const { error: upsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
            if (upsertError) {
                throw upsertError;
            }

            setUsername(normalized);
            setStatus("Saved.");
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }

    async function signOut() {
        setStatus("");
        setError("");
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            setError(String(signOutError));
            return;
        }
        setStatus("Signed out.");
    }

    const hasPublicProfile = !!username.trim();

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
            </div>

            <h1>Profile</h1>

            {loading ? <div style={{ marginTop: 12 }}>Loading…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 520 }}>
                <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>Username</div>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="esteban"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Allowed: a z 0 9 underscore. Spaces are removed.</div>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>Display name</div>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Esteban" />
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        type="checkbox"
                        checked={isPublicCollection}
                        onChange={(e) => setIsPublicCollection(e.target.checked)}
                    />
                    <span>Public collection</span>
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        type="checkbox"
                        checked={isPublicWishlist}
                        onChange={(e) => setIsPublicWishlist(e.target.checked)}
                    />
                    <span>Public wishlist</span>
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={save} disabled={loading} className="btn btnPrimary">
                        Save
                    </button>

                    {hasPublicProfile ? (
                        <button
                            onClick={() => navigate(`/u/${username}`)}
                            className="btn btnGhost"
                            disabled={loading}
                        >
                            Open public profile
                        </button>
                    ) : null}

                    <button onClick={signOut} className="btn btnGhost" disabled={loading}>
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
}
