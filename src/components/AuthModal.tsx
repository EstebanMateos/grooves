import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

type Props = {
    open: boolean;
    onClose: () => void;
    onAuthed: () => void;
};

export default function AuthModal({ open, onClose, onAuthed }: Props) {
    const [mode, setMode] = useState<"signin" | "signup">("signup");
    const [email, setEmail] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [statusType, setStatusType] = useState<"error" | "success" | "">("");
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (open) {
            setStatus("");
            setStatusType("");
        }
    }, [open]);

    async function signIn() {
        setStatus("");
        setStatusType("");
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setStatus(error.message);
                setStatusType("error");
                return;
            }
            setStatus("Connexion réussie.");
            setStatusType("success");
            onAuthed();
            onClose();
        } finally {
            setLoading(false);
        }
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
                return;
            }
            setStatus("Compte créé. Vérifie ton email si une confirmation est demandée.");
            setStatusType("success");
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

    if (!open) {
        return null;
    }

    return (
        <div
            onClick={onClose}
            className="authModalOverlay"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="authCard authModalCard"
            >
                <div className="authHeader">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div className="badge">Grooves</div>
                        <button className="btn btnGhost" onClick={onClose} type="button">
                            Fermer
                        </button>
                    </div>
                    <h2 className="authTitle">{mode === "signup" ? "Créer un compte" : "Se connecter"}</h2>
                    <p className="authSubtitle">
                        Accède à ta collection, ta wishlist et ton profil public.
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
