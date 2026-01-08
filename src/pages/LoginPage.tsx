import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState("");

    async function signUp() {
        setStatus("");
        const { error } = await supabase.auth.signUp({ email, password });
        setStatus(error ? error.message : "Signed up");
    }

    async function signIn() {
        setStatus("");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setStatus(error ? error.message : "Signed in");
    }

    return (
        <div>
            <h1>Login</h1>

            <div style={{ display: "grid", gap: 8, maxWidth: 400 }}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                />
                <button onClick={signIn}>Sign in</button>
                <button onClick={signUp}>Sign up</button>
                <div>{status}</div>
            </div>
        </div>
    );
}
