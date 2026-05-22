import { useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useAuthSession } from "../hooks/useAuthSession";
import { supabase } from "../supabaseClient";
import { getEmailRedirectUrl } from "../utils/authRedirect";
import { ensureProfileUsername, formatAuthError } from "../utils/authProfile";

export default function LoginPage() {
    const navigate = useNavigate();
    const auth = useAuthSession();
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState<string>("");
    const [statusType, setStatusType] = useState<"error" | "success" | "">("");
    const [loading, setLoading] = useState(false);

    async function signUp() {
        setStatus("");
        setStatusType("");
        setLoading(true);
        try {
            const redirectTo = getEmailRedirectUrl("/account-created");
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: redirectTo }
            });
            if (error) {
                setStatus(error.message);
                setStatusType("error");
            } else {
                navigate("/account-created");
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

            const session: Session | null = data.session ?? null;
            const userId = session?.user?.id ?? data.user?.id ?? auth.user_id ?? null;
            let hasProfile = false;
            let isAnon = false;

            if (userId) {
                const profile = await ensureProfileUsername(userId);
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

    if (auth.is_loading) {
        return (
            <div className="authPage">
                <div className="authCard">
                    <div className="muted">Vérification de la session…</div>
                </div>
            </div>
        );
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
