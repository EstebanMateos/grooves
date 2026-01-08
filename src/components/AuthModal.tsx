import { useState } from "react";
import { supabase } from "../supabaseClient";

type Props = {
    open: boolean;
    onClose: () => void;
    onAuthed: () => void;
};

export default function AuthModal({ open, onClose, onAuthed }: Props) {
    const [email, setEmail] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const [status, setStatus] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(false);

    async function signIn() {
        setStatus("");
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setStatus(error.message);
                return;
            }
            setStatus("");
            onAuthed();
            onClose();
        } finally {
            setLoading(false);
        }
    }

    async function signUp() {
        setStatus("");
        setLoading(true);

        try {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) {
                setStatus(error.message);
                return;
            }
            setStatus("Account created. You can sign in now.");
        } finally {
            setLoading(false);
        }
    }

    if (!open) {
        return null;
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 420,
                    maxWidth: "100%",
                    background: "white",
                    borderRadius: 8,
                    padding: 16
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0 }}>Login</h2>
                    <button onClick={onClose}>Close</button>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="password"
                    />

                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={signIn} disabled={loading || !email || !password}>
                            Sign in
                        </button>
                        <button onClick={signUp} disabled={loading || !email || !password}>
                            Sign up
                        </button>
                    </div>

                    {status ? <div style={{ fontSize: 14, color: status.includes("created") ? "black" : "red" }}>{status}</div> : null}
                </div>
            </div>
        </div>
    );
}
