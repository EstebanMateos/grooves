import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState<"signin" | "signup">("signup");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState<string>("");
    const [statusType, setStatusType] = useState<"error" | "success" | "">("");
    const [loading, setLoading] = useState(false);

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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setStatus(error.message);
            setStatusType("error");
        } else {
            setStatus("Connexion réussie.");
            setStatusType("success");
            navigate("/profile");
        }
        setLoading(false);
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

                <div className="authSwitch">
                    <button
                        className={`btn ${mode === "signup" ? "btnPrimary" : "btnGhost"}`}
                        type="button"
                        onClick={() => setMode("signup")}
                    >
                        Créer un compte
                    </button>
                    <button
                        className={`btn ${mode === "signin" ? "btnPrimary" : "btnGhost"}`}
                        type="button"
                        onClick={() => setMode("signin")}
                    >
                        Se connecter
                    </button>
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
            </div>
        </div>
    );
}
