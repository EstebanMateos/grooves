import { Link } from "react-router-dom";
import { useAuthSession } from "../hooks/useAuthSession";

export default function AccountCreatedPage() {
    const auth = useAuthSession();

    if (auth.is_loading) {
        return (
            <div className="authPage">
                <div className="authCard">
                    <div className="muted">Vérification de la session…</div>
                </div>
            </div>
        );
    }

    const isAuthed = auth.is_authenticated;

    return (
        <div className="authPage">
            <div className="authCard">
                <div className="authHeader">
                    <div className="badge">Grooves</div>
                    <h1 className="authTitle">{isAuthed ? "Email confirmé" : "Compte créé"}</h1>
                    <p className="authSubtitle">
                        {isAuthed
                            ? "Ton email est validé. Tu peux continuer."
                            : "Un email de validation t'a été envoyé. Clique sur le lien puis connecte-toi."}
                    </p>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {isAuthed ? (
                        <>
                            <Link to="/" className="btn btnPrimary">
                                Aller à l'accueil
                            </Link>
                            <Link to="/profile" className="btn btnGhost">
                                Compléter mon profil
                            </Link>
                        </>
                    ) : (
                        <Link to="/login" className="btn btnPrimary">
                            Se connecter
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
