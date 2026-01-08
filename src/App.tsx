import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AuthModal from "./components/AuthModal";
import { supabase } from "./supabaseClient";
import { useAuthSession } from "./hooks/useAuthSession";
import LoginPage from "./pages/LoginPage";
import ReleasePage from "./pages/ReleasePage";
import SearchPage from "./pages/SearchPage";
import MyLibraryPage from "./pages/MyLibraryPage";

export default function App() {
    const auth = useAuthSession();
    const [authOpen, setAuthOpen] = useState<boolean>(false);

    async function signOut() {
        await supabase.auth.signOut();
    }

    return (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20
                }}
            >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <Link to="/" style={{ textDecoration: "none", fontWeight: 700 }}>
                        Grooves
                    </Link>
                    <Link to="/my-library" style={{ textDecoration: "none" }}>
                        My library
                    </Link>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {auth.is_loading ? (
                        <span style={{ opacity: 0.7, fontSize: 14 }}>Checking session…</span>
                    ) : auth.is_authenticated ? (
                        <>
                            <span style={{ opacity: 0.8, fontSize: 14 }}>{auth.user_email ?? "Connected"}</span>
                            <button onClick={signOut}>Logout</button>
                        </>
                    ) : (
                        <>
                            <span style={{ opacity: 0.8, fontSize: 14 }}>Not logged in</span>
                            <button onClick={() => setAuthOpen(true)}>Login</button>
                        </>
                    )}
                </div>
            </header>

            <Routes>
                <Route path="/" element={<SearchPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/my-library" element={<MyLibraryPage />} />
                <Route
                    path="/release/:discogsReleaseId"
                    element={<ReleasePage onRequireAuth={() => setAuthOpen(true)} />
                }
                />
            </Routes>

            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => {}} />
        </div>
    );
}
