import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AuthModal from "./components/AuthModal";
import { supabase } from "./supabaseClient";
import { useAuthSession } from "./hooks/useAuthSession";
import DiscoverProfilesPage from "./pages/DiscoverProfilesPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MyLibraryPage from "./pages/MyLibraryPage";
import ProfileSettingsPage from "./pages/ProfileSettingsPage";
import PublicProfilePage from "./pages/PublicProfilePage";
import ReleasePage from "./pages/ReleasePage";

export default function App() {
    const auth = useAuthSession();
    const [authOpen, setAuthOpen] = useState<boolean>(false);

    async function signOut() {
        await supabase.auth.signOut();
    }

    return (
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: 16 }}>
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20
                }}
            >
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <Link to="/" style={{ textDecoration: "none", fontWeight: 800, letterSpacing: 0.2 }}>
                        Grooves
                    </Link>

                    <Link to="/people" style={{ textDecoration: "none" }}>
                        People
                    </Link>

                    <Link to="/my-library" style={{ textDecoration: "none" }}>
                        My library
                    </Link>

                    <Link to="/profile" style={{ textDecoration: "none" }}>
                        Profile
                    </Link>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {auth.is_loading ? (
                        <span style={{ opacity: 0.7, fontSize: 14 }}>Checking session…</span>
                    ) : auth.is_authenticated ? (
                        <>
                            <span style={{ opacity: 0.8, fontSize: 14 }}>{auth.user_email ?? "Connected"}</span>
                            <button className="btn btnGhost" onClick={signOut}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <span style={{ opacity: 0.8, fontSize: 14 }}>Not logged in</span>
                            <button className="btn btnPrimary" onClick={() => setAuthOpen(true)}>
                                Login
                            </button>
                        </>
                    )}
                </div>
            </header>

            <Routes>
                <Route path="/" element={<HomePage onRequireAuth={() => setAuthOpen(true)} />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/people" element={<DiscoverProfilesPage />} />
                <Route path="/my-library" element={<MyLibraryPage />} />
                <Route path="/profile" element={<ProfileSettingsPage />} />
                <Route path="/u/:username" element={<PublicProfilePage />} />
                <Route
                    path="/release/:discogsReleaseId"
                    element={<ReleasePage onRequireAuth={() => setAuthOpen(true)} />}
                />
            </Routes>

            <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={() => {}} />
        </div>
    );
}
