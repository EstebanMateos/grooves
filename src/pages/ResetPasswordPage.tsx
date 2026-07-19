import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { openedFromPasswordRecoveryLink, supabase } from "../supabaseClient";
import { useAuthSession } from "../hooks/useAuthSession";
import { formatAuthError } from "../utils/authProfile";

type Props = {
    onFinished?: () => void;
};

export default function ResetPasswordPage({ onFinished }: Props) {
    const navigate = useNavigate();
    const auth = useAuthSession();
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const hasRecoverySession = !!auth.session && (openedFromPasswordRecoveryLink || auth.last_event === "PASSWORD_RECOVERY");

    async function updatePassword(event: FormEvent) {
        event.preventDefault();
        if (password.length < 8) {
            setStatus("Le mot de passe doit contenir au moins 8 caractères.");
            return;
        }
        if (password !== confirmation) {
            setStatus("Les deux mots de passe ne correspondent pas.");
            return;
        }
        setLoading(true);
        setStatus("");
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                setStatus(formatAuthError(error));
                return;
            }
            await supabase.auth.signOut();
            onFinished?.();
            navigate("/login", { replace: true });
        } catch (error) {
            setStatus(formatAuthError(error));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="authPage">
            <div className="authCard">
                <div className="authHeader">
                    <div className="badge">Grooves</div>
                    <h1 className="authTitle">Nouveau mot de passe</h1>
                    <p className="authSubtitle">
                        {auth.is_loading
                            ? "Vérification du lien…"
                            : hasRecoverySession
                                ? "Choisis un nouveau mot de passe pour ton compte."
                                : "Ce lien est invalide ou a expiré. Demande un nouveau lien depuis la page de connexion."}
                    </p>
                </div>

                {hasRecoverySession ? (
                    <form className="authForm" onSubmit={updatePassword}>
                        <label className="authField">
                            <span className="authLabel">Nouveau mot de passe</span>
                            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                        </label>
                        <label className="authField">
                            <span className="authLabel">Confirmer le mot de passe</span>
                            <input className="input" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" minLength={8} required />
                        </label>
                        <button className="btn btnPrimary" type="submit" disabled={loading || !password || !confirmation}>
                            {loading ? "Mise à jour…" : "Changer mon mot de passe"}
                        </button>
                        {status ? <div className="error">{status}</div> : null}
                    </form>
                ) : !auth.is_loading ? (
                    <button className="btn btnGhost" type="button" onClick={() => navigate("/login")}>Retour à la connexion</button>
                ) : null}
            </div>
        </div>
    );
}
