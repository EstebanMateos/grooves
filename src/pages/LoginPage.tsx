import { useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState<string>("");
    const [statusType, setStatusType] = useState<"error" | "success" | "">("");
    const [loading, setLoading] = useState(false);

    function formatAuthError(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);
        if (!message) {
            return "Erreur inconnue.";
        }
        const normalized = message.toLowerCase();
        if (normalized.includes("timeout") || normalized.includes("expirée")) {
            return "Délai dépassé. Vérifie ta connexion et réessaie.";
        }
        return message;
    }

    function buildAnonUsername(suffix?: string): string {
        const safeSuffix = (suffix ?? "").replace(/[^a-z0-9_]/g, "");
        if (safeSuffix) {
            return `ano_${safeSuffix}`;
        }
        const timePart = Date.now().toString(36);
        const randPart = Math.random().toString(36).slice(2, 8);
        return `ano_${timePart}_${randPart}`;
    }

    async function generateAnonUsername(): Promise<string> {
        try {
            const { count } = await supabase
                .from("profiles")
                .select("id", { count: "exact", head: true })
                .ilike("username", "ano_%");
            if (typeof count === "number") {
                return buildAnonUsername(String(count + 1));
            }
        } catch {
            // Fall back to timestamp-based ID if count fails.
        }
        return buildAnonUsername();
    }

    async function ensureProfileUsername(userId: string): Promise<{ username: string; isAnon: boolean }> {
        const { data: profileRow, error: profileError } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (profileRow?.username) {
            return { username: profileRow.username, isAnon: profileRow.username.startsWith("ano_") };
        }

        let candidate = await generateAnonUsername();
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const { error: upsertError } = await supabase
                .from("profiles")
                .upsert(
                    { id: userId, username: candidate, display_name: candidate },
                    { onConflict: "id" }
                );

            if (!upsertError) {
                return { username: candidate, isAnon: true };
            }

            lastError = upsertError;
            const message = upsertError.message?.toLowerCase() ?? "";
            if (upsertError.code === "23505" || message.includes("duplicate")) {
                candidate = buildAnonUsername();
                continue;
            }

            throw upsertError;
        }

        throw lastError instanceof Error
            ? lastError
            : new Error("Impossible de créer un pseudo automatique.");
    }

    async function signUp() {
        setStatus("");
        setStatusType("");
        setLoading(true);
        try {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) {
                setStatus(error.message);
                setStatusType("error");
            } else {
                setStatus("Veuillez confirmer sur l'email reçu par Supabase puis connecte-toi.");
                setStatusType("success");
                setMode("signin");
                navigate("/login");
            }
        } catch (error) {
            setStatus(formatAuthError(error));
            setStatusType("error");
        } finally {
            setLoading(false);
        }
    }

    async function signIn() {
        setStatus("");
        setStatusType("");
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setStatus(error.message);
                setStatusType("error");
                return;
            }

            let session: Session | null = data.session ?? null;
            if (!session) {
                const { data: sessionData } = await supabase.auth.getSession();
                session = sessionData.session ?? null;
            }
            let hasProfile = false;
            let isAnon = false;

            if (session) {
                const profile = await ensureProfileUsername(session.user.id);
                hasProfile = !!profile.username;
                isAnon = profile.isAnon;
            }

            setStatus("Connexion réussie.");
            setStatusType("success");
            navigate(hasProfile && !isAnon ? "/" : "/profile");
        } catch (error) {
            setStatus(formatAuthError(error));
            setStatusType("error");
        } finally {
            setLoading(false);
        }
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (loading) {
            return;
        }
        if (mode === "signup") {
            signUp();
        } else {
            signIn();
        }
    }

    return (
        <div className="authPage">
            <div className="authCard">
                <div className="authHeader">
                    <div className="badge">Grooves</div>
                    <h1 className="authTitle">Bienvenue</h1>
                    <p className="authSubtitle">
                        Crée un compte ou connecte-toi pour gérer ta collection et ta wishlist.
                    </p>
                </div>

                <form className="authForm" onSubmit={handleSubmit}>
                    <label className="authField">
                        <span className="authLabel">Email</span>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="toi@email.com"
                            autoComplete="email"
                            required
                        />
                    </label>

                    <label className="authField">
                        <span className="authLabel">Mot de passe</span>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={mode === "signup" ? "new-password" : "current-password"}
                            required
                        />
                    </label>

                    <button className="btn btnPrimary" type="submit" disabled={!email || !password || loading}>
                        {mode === "signup" ? "Créer mon compte" : "Se connecter"}
                    </button>

                    {status ? (
                        <div className={statusType === "error" ? "error" : "success"}>{status}</div>
                    ) : null}
                </form>

                <div style={{ marginTop: 12, textAlign: "center" }}>
                    {mode === "signin" ? (
                        <>
                            <div className="muted" style={{ marginBottom: 8 }}>
                                Pas encore de compte ?
                            </div>
                            <button className="btn btnGhost" type="button" onClick={() => setMode("signup")}>
                                Créer un compte
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="muted" style={{ marginBottom: 8 }}>
                                Déjà un compte ?
                            </div>
                            <button className="btn btnGhost" type="button" onClick={() => setMode("signin")}>
                                Se connecter
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
