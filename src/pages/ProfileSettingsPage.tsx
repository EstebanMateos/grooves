import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../hooks/useAuthSession";
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
    const auth = useAuthSession();
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [status, setStatus] = useState<string>("");

    const [username, setUsername] = useState<string>("");
    const [displayName, setDisplayName] = useState<string>("");
    const [isPublicCollection, setIsPublicCollection] = useState<boolean>(true);
    const [isPublicWishlist, setIsPublicWishlist] = useState<boolean>(true);
    const navigate = useNavigate();
    const requestIdRef = useRef<number>(0);

    useEffect(() => {
        let isMounted = true;
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const isStale = () => requestIdRef.current !== requestId;

        if (auth.is_loading) {
            return () => {
                isMounted = false;
            };
        }

        if (!auth.is_authenticated || !auth.user_id) {
            setLoading(false);
            setError("Merci de te connecter.");
            setStatus("");
            setUsername("");
            setDisplayName("");
            setIsPublicCollection(true);
            setIsPublicWishlist(true);
            return () => {
                isMounted = false;
            };
        }

        async function load() {
            setLoading(true);
            setError("");
            setStatus("");

            try {
                const { data, error: dbError } = await supabase
                    .from("profiles")
                    .select("id,username,display_name,is_public_collection,is_public_wishlist")
                    .eq("id", auth.user_id)
                    .maybeSingle();

                if (dbError) {
                    throw dbError;
                }

                if (!isMounted || isStale()) {
                    return;
                }

                if (data) {
                    const row = data as ProfileRow;
                    setUsername(row.username ?? "");
                    setDisplayName(row.display_name ?? "");
                    setIsPublicCollection(!!row.is_public_collection);
                    setIsPublicWishlist(!!row.is_public_wishlist);

                }
            } catch (e) {
                if (!isMounted || isStale()) {
                    return;
                }
                setError(String(e));
            } finally {
                if (isMounted && !isStale()) {
                    setLoading(false);
                }
            }
        }

        void load();
        return () => {
            isMounted = false;
        };
    }, [auth.is_loading, auth.is_authenticated, auth.user_id]);

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
            if (auth.is_loading) {
                setError("Vérification de la session…");
                return;
            }
            if (!auth.is_authenticated || !auth.user_id) {
                setError("Merci de te connecter.");
                return;
            }

            const normalized = normalizeUsername(username);
            if (!normalized) {
                setError("Pseudo invalide.");
                return;
            }

            const payload = {
                id: auth.user_id,
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
            setStatus("Enregistré.");
            navigate("/");
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
        setStatus("Déconnecté.");
    }

    const hasPublicProfile = !!username.trim();

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <BackButton className="btn btnGhost" />
            </div>

            <h1>Profil</h1>

            {loading ? <div style={{ marginTop: 12 }}>Chargement…</div> : null}
            {error ? <div style={{ marginTop: 12, color: "red" }}>{error}</div> : null}
            {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}

            <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 520 }}>
                <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>Pseudo</div>
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="esteban"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Autorisé : a z 0 9 underscore. Les espaces sont supprimés.
                    </div>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 14, opacity: 0.8 }}>Nom affiché</div>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Esteban" />
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        type="checkbox"
                        checked={isPublicCollection}
                        onChange={(e) => setIsPublicCollection(e.target.checked)}
                    />
                    <span>Collection publique</span>
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        type="checkbox"
                        checked={isPublicWishlist}
                        onChange={(e) => setIsPublicWishlist(e.target.checked)}
                    />
                    <span>Wishlist publique</span>
                </label>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" onClick={save} disabled={loading} className="btn btnPrimary">
                        Enregistrer
                    </button>

                    {hasPublicProfile ? (
                        <button
                            type="button"
                            onClick={() => navigate(`/u/${username}`)}
                            className="btn btnGhost"
                            disabled={loading}
                        >
                            Ouvrir le profil public
                        </button>
                    ) : null}

                    <button type="button" onClick={signOut} className="btn btnGhost" disabled={loading}>
                        Déconnexion
                    </button>
                </div>
            </div>
        </div>
    );
}
