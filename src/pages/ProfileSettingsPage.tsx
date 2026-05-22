import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../hooks/useAuthSession";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";
import { clearLibraryCache } from "../utils/libraryCache";

type ProfileRow = {
    id: string;
    username: string;
    display_name: string | null;
    is_public_collection: boolean;
    is_public_wishlist: boolean;
};

type ProfileLite = {
    id: string;
    username: string;
    display_name: string | null;
};

type GroupMemberRow = {
    user_id: string;
    created_at: string;
};

type GroupMemberView = {
    user_id: string;
    username: string;
    display_name: string | null;
};

type GroupInviteRow = {
    id: string;
    inviter_id: string;
    invitee_id: string;
    status: string;
    created_at: string;
};

type GroupInviteView = GroupInviteRow & {
    inviter: ProfileLite | null;
    invitee: ProfileLite | null;
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
    const [groupId, setGroupId] = useState<string | null>(null);
    const [groupMembers, setGroupMembers] = useState<GroupMemberView[]>([]);
    const [incomingInvites, setIncomingInvites] = useState<GroupInviteView[]>([]);
    const [outgoingInvites, setOutgoingInvites] = useState<GroupInviteView[]>([]);
    const [inviteUsername, setInviteUsername] = useState<string>("");
    const [groupLoading, setGroupLoading] = useState<boolean>(false);
    const [groupError, setGroupError] = useState<string>("");
    const [groupStatus, setGroupStatus] = useState<string>("");
    const [groupBusyId, setGroupBusyId] = useState<string | null>(null);
    const navigate = useNavigate();
    const requestIdRef = useRef<number>(0);
    const groupRequestIdRef = useRef<number>(0);

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

    function formatProfileLabel(profile: ProfileLite | null, fallback: string) {
        if (!profile) {
            return fallback;
        }
        if (profile.display_name) {
            return `${profile.display_name} (@${profile.username})`;
        }
        return profile.username;
    }

    function formatSupabaseError(error: unknown) {
        if (!error || typeof error !== "object") {
            return String(error);
        }
        const err = error as { message?: string; details?: string; hint?: string; code?: string };
        const parts = [err.message, err.details, err.hint, err.code].filter(Boolean);
        return parts.join(" | ") || "Erreur inconnue";
    }

    async function loadGroupState() {
        const requestId = groupRequestIdRef.current + 1;
        groupRequestIdRef.current = requestId;
        const isStale = () => groupRequestIdRef.current !== requestId;

        if (auth.is_loading) {
            return;
        }

        if (!auth.is_authenticated || !auth.user_id) {
            if (isStale()) {
                return;
            }
            setGroupId(null);
            setGroupMembers([]);
            setIncomingInvites([]);
            setOutgoingInvites([]);
            setGroupError("");
            setGroupStatus("");
            setGroupLoading(false);
            return;
        }

        setGroupLoading(true);
        setGroupError("");
        setGroupStatus("");

        try {
            const { data: membership, error: membershipError } = await supabase
                .from("collection_group_members")
                .select("group_id")
                .eq("user_id", auth.user_id)
                .maybeSingle();

            if (membershipError) {
                throw membershipError;
            }

            if (isStale()) {
                return;
            }

            const nextGroupId = membership?.group_id ?? null;
            setGroupId(nextGroupId);

            const emptyResponse = { data: [], error: null } as const;
            const [membersResp, incomingResp, outgoingResp] = await Promise.all([
                nextGroupId
                    ? supabase
                        .from("collection_group_members")
                        .select("user_id,created_at")
                        .eq("group_id", nextGroupId)
                        .order("created_at", { ascending: true })
                    : Promise.resolve(emptyResponse),
                supabase
                    .from("collection_group_invites")
                    .select("id,inviter_id,invitee_id,status,created_at")
                    .eq("invitee_id", auth.user_id)
                    .eq("status", "pending")
                    .order("created_at", { ascending: true }),
                supabase
                    .from("collection_group_invites")
                    .select("id,inviter_id,invitee_id,status,created_at")
                    .eq("inviter_id", auth.user_id)
                    .eq("status", "pending")
                    .order("created_at", { ascending: true })
            ]);

            if (membersResp.error) {
                throw membersResp.error;
            }
            if (incomingResp.error) {
                throw incomingResp.error;
            }
            if (outgoingResp.error) {
                throw outgoingResp.error;
            }

            const members = (membersResp.data ?? []) as GroupMemberRow[];
            const incoming = (incomingResp.data ?? []) as GroupInviteRow[];
            const outgoing = (outgoingResp.data ?? []) as GroupInviteRow[];

            const profileIds = new Set<string>();
            members.forEach((m) => profileIds.add(m.user_id));
            incoming.forEach((i) => profileIds.add(i.inviter_id));
            outgoing.forEach((i) => profileIds.add(i.invitee_id));

            let profiles: ProfileLite[] = [];
            if (profileIds.size > 0) {
                const { data: profileData, error: profileError } = await supabase
                    .from("profiles")
                    .select("id,username,display_name")
                    .in("id", Array.from(profileIds));

                if (profileError) {
                    throw profileError;
                }

                profiles = (profileData ?? []) as ProfileLite[];
            }

            const profileById = new Map<string, ProfileLite>();
            profiles.forEach((p) => profileById.set(p.id, p));

            const memberViews = members.map((m) => {
                const profile = profileById.get(m.user_id) ?? null;
                return {
                    user_id: m.user_id,
                    username: profile?.username ?? "utilisateur",
                    display_name: profile?.display_name ?? null
                };
            });

            const incomingViews = incoming.map((invite) => ({
                ...invite,
                inviter: profileById.get(invite.inviter_id) ?? null,
                invitee: profileById.get(invite.invitee_id) ?? null
            }));

            const outgoingViews = outgoing.map((invite) => ({
                ...invite,
                inviter: profileById.get(invite.inviter_id) ?? null,
                invitee: profileById.get(invite.invitee_id) ?? null
            }));

            if (isStale()) {
                return;
            }

            setGroupMembers(memberViews);
            setIncomingInvites(incomingViews);
            setOutgoingInvites(outgoingViews);
        } catch (e) {
            if (!isStale()) {
                setGroupError(formatSupabaseError(e));
            }
        } finally {
            if (!isStale()) {
                setGroupLoading(false);
            }
        }
    }

    useEffect(() => {
        void loadGroupState();
    // loadGroupState is intentionally called from the current auth snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.is_loading, auth.is_authenticated, auth.user_id]);

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

    async function sendInvite() {
        setGroupStatus("");
        setGroupError("");

        if (auth.is_loading) {
            setGroupError("Verification de la session…");
            return;
        }
        if (!auth.is_authenticated || !auth.user_id) {
            setGroupError("Merci de te connecter.");
            return;
        }

        const normalized = normalizeUsername(inviteUsername);
        if (!normalized) {
            setGroupError("Pseudo invalide.");
            return;
        }

        setGroupBusyId("invite");
        try {
            const { error: inviteError } = await supabase.rpc("invite_collection_member", {
                p_username: normalized
            });

            if (inviteError) {
                throw inviteError;
            }

            setInviteUsername("");
            setGroupStatus("Invitation envoyee.");
            await loadGroupState();
        } catch (e) {
            setGroupError(formatSupabaseError(e));
        } finally {
            setGroupBusyId(null);
        }
    }

    async function acceptInvite(inviteId: string) {
        setGroupStatus("");
        setGroupError("");
        setGroupBusyId(inviteId);
        try {
            const { error: acceptError } = await supabase.rpc("accept_collection_invite", {
                p_invite_id: inviteId
            });
            if (acceptError) {
                throw acceptError;
            }
            setGroupStatus("Invitation acceptee.");
            await loadGroupState();
        } catch (e) {
            setGroupError(formatSupabaseError(e));
        } finally {
            setGroupBusyId(null);
        }
    }

    async function declineInvite(inviteId: string) {
        setGroupStatus("");
        setGroupError("");
        setGroupBusyId(inviteId);
        try {
            const { error: declineError } = await supabase.rpc("decline_collection_invite", {
                p_invite_id: inviteId
            });
            if (declineError) {
                throw declineError;
            }
            setGroupStatus("Invitation refusee.");
            await loadGroupState();
        } catch (e) {
            setGroupError(formatSupabaseError(e));
        } finally {
            setGroupBusyId(null);
        }
    }

    async function leaveGroup() {
        setGroupStatus("");
        setGroupError("");
        setGroupBusyId("leave");
        try {
            const { error: leaveError } = await supabase.rpc("leave_collection_group", {
                p_copy: true
            });
            if (leaveError) {
                throw leaveError;
            }
            setGroupStatus("Groupe quitte.");
            await loadGroupState();
        } catch (e) {
            setGroupError(formatSupabaseError(e));
        } finally {
            setGroupBusyId(null);
        }
    }

    async function signOut() {
        setStatus("");
        setError("");
        clearLibraryCache(auth.user_id);
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            setError(String(signOutError));
            return;
        }
        setStatus("Déconnecté.");
    }

    const hasPublicProfile = !!username.trim();
    const canLeaveGroup = groupMembers.length > 1;

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
                        placeholder="my_pseudo"
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
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="MonPrenom" />
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

            <div className="panel" style={{ marginTop: 20, maxWidth: 520 }}>
                <div className="panelTitle">Collection partagée</div>
                <div className="muted" style={{ marginTop: 6 }}>
                    Partage la collection avec les personnes du meme foyer. La wishlist reste personnelle.
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                    {groupId ? "Groupe actif." : "Aucun groupe actif pour l'instant."}
                </div>

                {groupLoading ? <div className="muted" style={{ marginTop: 10 }}>Chargement…</div> : null}
                {groupError ? <div className="error" style={{ marginTop: 10 }}>{groupError}</div> : null}
                {groupStatus ? <div style={{ marginTop: 10 }}>{groupStatus}</div> : null}

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontSize: 14, opacity: 0.8 }}>Inviter par pseudo</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <input
                                value={inviteUsername}
                                onChange={(e) => setInviteUsername(e.target.value)}
                                placeholder="pseudo"
                                className="input"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                onClick={sendInvite}
                                className="btn btnPrimary"
                                disabled={groupBusyId === "invite" || groupLoading || !inviteUsername.trim()}
                            >
                                Inviter
                            </button>
                        </div>
                    </label>
                </div>

                {incomingInvites.length > 0 ? (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Invitations recues</div>
                        <div style={{ display: "grid", gap: 8 }}>
                            {incomingInvites.map((invite) => (
                                <div key={invite.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <div style={{ flex: 1 }}>
                                        {formatProfileLabel(invite.inviter, "Utilisateur")} veut partager sa collection.
                                    </div>
                                        <button
                                            type="button"
                                            className="btn btnPrimary"
                                            onClick={() => acceptInvite(invite.id)}
                                            disabled={groupBusyId === invite.id || groupLoading}
                                        >
                                            Accepter
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btnGhost"
                                            onClick={() => declineInvite(invite.id)}
                                            disabled={groupBusyId === invite.id || groupLoading}
                                        >
                                            Refuser
                                        </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {outgoingInvites.length > 0 ? (
                    <div style={{ marginTop: 14 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Invitations envoyees</div>
                        <div style={{ display: "grid", gap: 8 }}>
                            {outgoingInvites.map((invite) => (
                                <div key={invite.id} className="muted small">
                                    En attente de {formatProfileLabel(invite.invitee, "Utilisateur")}.
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Membres du groupe</div>
                    <div style={{ display: "grid", gap: 6 }}>
                        {groupMembers.length > 0 ? (
                            groupMembers.map((member) => (
                                <div key={member.user_id}>
                                    {member.display_name ? `${member.display_name} (@${member.username})` : member.username}
                                </div>
                            ))
                        ) : (
                            <div className="muted small">Aucun membre pour le moment.</div>
                        )}
                    </div>
                </div>

                <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
                    <button
                        type="button"
                        className="btn btnGhost"
                        onClick={leaveGroup}
                        disabled={groupBusyId === "leave" || groupLoading || !canLeaveGroup}
                    >
                        Quitter le groupe
                    </button>
                    <div className="muted small">
                        En quittant, tu conserves une copie de la collection actuelle.
                    </div>
                    {!canLeaveGroup ? (
                        <div className="muted small">Tu es seul dans ce groupe.</div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
