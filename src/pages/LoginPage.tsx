import { useState } from "react";
import type { FormEvent } from "react";
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

    async function generateAnonUsername(): Promise<string> {
        try {
            const { count } = await supabase
                .from("profiles")
                .select("id", { count: "exact", head: true })
                .ilike("username", "ano_%");
            if (typeof count === "number") {
                return `ano_${count + 1}`;
            }
        } catch {
            // Fall back to timestamp-based ID if count fails.
        }
        return `ano_${Math.floor(Date.now() / 1000)}`;
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

            if (upsertError.code === "23505" || upsertError.message.includes("duplicate")) {
                const parts = candidate.split("_");
                const suffix = Number(parts[1]) || 0;
                candidate = `ano_${suffix + 1}`;
                continue;
            }

            throw upsertError;
        }

        return { username: candidate, isAnon: true };
    }

    async function signUp() {
        setStatus("");
        setStatusType("");
        setLoading(true);
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
        setLoading(false);
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

            let session = data.session ?? null;
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
